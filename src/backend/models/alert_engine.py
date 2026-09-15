"""
alert_engine.py

Dynamic alert generation for real-time risk changes and anomaly events.

Public API:
    AlertEngine           — singleton class with process_update() + get_active_alerts()
    alert_engine          — module-level singleton instance
    get_active_alerts()   — module-level convenience function
"""

from __future__ import annotations

import threading
import uuid
from collections import deque
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Optional

from .risk_engine import AssetRiskResult
from ..data.realtime_simulator import SensorSnapshot
from ..data.weather_simulator import WeatherSnapshot

# ---------------------------------------------------------------------------
# Alert thresholds
# ---------------------------------------------------------------------------
RISK_WARNING_THRESHOLD = 60.0
RISK_CRITICAL_THRESHOLD = 80.0
RISK_DELTA_THRESHOLD = 15.0      # points increase in one cycle
PD_THRESHOLD_PC = 80.0           # picocoulombs
LOAD_THRESHOLD_PCT = 95.0
WEATHER_RISK_THRESHOLD = 0.7

MAX_ALERTS = 50


@dataclass
class Alert:
    alert_id: str
    timestamp: str
    asset_id: str
    asset_name: str
    district: str
    severity: str               # "info"|"warning"|"critical"
    alert_type: str             # "threshold_crossed"|"risk_increase"|"anomaly_detected"|"weather_warning"
    message: str
    previous_risk: float
    current_risk: float
    recommended_action: str
    acknowledged: bool = False

    def to_dict(self) -> dict:
        return asdict(self)


class AlertEngine:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._alerts: deque[Alert] = deque(maxlen=MAX_ALERTS)
        # Track previous risk scores to detect delta jumps
        self._prev_risk: dict[str, float] = {}
        # Track which thresholds have been crossed (to avoid re-alerting on same state)
        self._warned: dict[str, set] = {}    # asset_id -> set of triggered conditions

    # ------------------------------------------------------------------
    def _emit(self, alert: Alert) -> None:
        self._alerts.appendleft(alert)

    def _ts(self) -> str:
        return datetime.now(tz=timezone.utc).isoformat()

    def _aid(self) -> str:
        return str(uuid.uuid4())[:8].upper()

    def _has_fired(self, asset_id: str, key: str) -> bool:
        return key in self._warned.get(asset_id, set())

    def _mark_fired(self, asset_id: str, key: str) -> None:
        self._warned.setdefault(asset_id, set()).add(key)

    def _clear_fired(self, asset_id: str, key: str) -> None:
        self._warned.get(asset_id, set()).discard(key)

    # ------------------------------------------------------------------
    def process_update(
        self,
        asset_risks: dict[str, AssetRiskResult],
        sensors: dict[str, SensorSnapshot],
        weather_map: dict[str, WeatherSnapshot],
        assets: list[dict],
    ) -> list[Alert]:
        """
        Compare current state to previous; emit alerts for threshold crossings
        and anomalies. Returns newly generated alerts in this cycle.
        """
        asset_by_id: dict[str, dict] = {a["asset_id"]: a for a in assets}
        new_alerts: list[Alert] = []

        with self._lock:
            for aid, risk in asset_risks.items():
                asset = asset_by_id.get(aid, {})
                asset_name = asset.get("asset_name", aid)
                district = asset.get("district", "Gujarat")
                sensor = sensors.get(aid)
                prev_risk = self._prev_risk.get(aid, 0.0)
                cur_risk = risk.overall_risk_score

                # --- 1. Risk threshold crossed: warning (60) ---
                if cur_risk >= RISK_WARNING_THRESHOLD and not self._has_fired(aid, "warn_60"):
                    alert = Alert(
                        alert_id=self._aid(),
                        timestamp=self._ts(),
                        asset_id=aid,
                        asset_name=asset_name,
                        district=district,
                        severity="warning",
                        alert_type="threshold_crossed",
                        message=(
                            f"{asset_name} risk score reached {cur_risk:.0f}/100 "
                            f"(threshold: {RISK_WARNING_THRESHOLD:.0f}). "
                            f"Risk level: {risk.risk_level.upper()}."
                        ),
                        previous_risk=prev_risk,
                        current_risk=cur_risk,
                        recommended_action=risk.recommended_action,
                    )
                    new_alerts.append(alert)
                    self._emit(alert)
                    self._mark_fired(aid, "warn_60")
                elif cur_risk < RISK_WARNING_THRESHOLD - 5:
                    self._clear_fired(aid, "warn_60")

                # --- 2. Risk threshold crossed: critical (80) ---
                if cur_risk >= RISK_CRITICAL_THRESHOLD and not self._has_fired(aid, "crit_80"):
                    alert = Alert(
                        alert_id=self._aid(),
                        timestamp=self._ts(),
                        asset_id=aid,
                        asset_name=asset_name,
                        district=district,
                        severity="critical",
                        alert_type="threshold_crossed",
                        message=(
                            f"🚨 CRITICAL: {asset_name} risk score {cur_risk:.0f}/100. "
                            f"Immediate intervention required. "
                            f"Customers at risk: {risk.customers_at_risk:,}."
                        ),
                        previous_risk=prev_risk,
                        current_risk=cur_risk,
                        recommended_action=risk.recommended_action,
                    )
                    new_alerts.append(alert)
                    self._emit(alert)
                    self._mark_fired(aid, "crit_80")
                elif cur_risk < RISK_CRITICAL_THRESHOLD - 5:
                    self._clear_fired(aid, "crit_80")

                # --- 3. Rapid risk increase ---
                delta = cur_risk - prev_risk
                if delta >= RISK_DELTA_THRESHOLD and not self._has_fired(aid, f"delta_{int(prev_risk)}"):
                    alert = Alert(
                        alert_id=self._aid(),
                        timestamp=self._ts(),
                        asset_id=aid,
                        asset_name=asset_name,
                        district=district,
                        severity="warning" if cur_risk < 80 else "critical",
                        alert_type="risk_increase",
                        message=(
                            f"{asset_name} risk score increased by {delta:.0f} points "
                            f"({prev_risk:.0f} → {cur_risk:.0f}) in one update cycle."
                        ),
                        previous_risk=prev_risk,
                        current_risk=cur_risk,
                        recommended_action=risk.recommended_action,
                    )
                    new_alerts.append(alert)
                    self._emit(alert)
                    self._mark_fired(aid, f"delta_{int(prev_risk)}")

                # --- 4. Anomaly detected ---
                if sensor and sensor.anomaly_active and not self._has_fired(aid, f"anomaly_{sensor.anomaly_type}"):
                    alert = Alert(
                        alert_id=self._aid(),
                        timestamp=self._ts(),
                        asset_id=aid,
                        asset_name=asset_name,
                        district=district,
                        severity="critical" if cur_risk >= 70 else "warning",
                        alert_type="anomaly_detected",
                        message=(
                            f"Anomaly detected on {asset_name}: "
                            f"{sensor.anomaly_type.replace('_', ' ').title()}. "
                            f"Current risk: {cur_risk:.0f}/100."
                        ),
                        previous_risk=prev_risk,
                        current_risk=cur_risk,
                        recommended_action=risk.recommended_action,
                    )
                    new_alerts.append(alert)
                    self._emit(alert)
                    self._mark_fired(aid, f"anomaly_{sensor.anomaly_type}")
                elif sensor and not sensor.anomaly_active:
                    # Clear all anomaly fired flags when anomaly clears
                    for atype in ["overheating", "high_vibration", "pd_spike", "overload"]:
                        self._clear_fired(aid, f"anomaly_{atype}")

                # --- 5. Partial discharge spike ---
                if sensor and sensor.partial_discharge_pc > PD_THRESHOLD_PC \
                        and not self._has_fired(aid, "pd_high"):
                    alert = Alert(
                        alert_id=self._aid(),
                        timestamp=self._ts(),
                        asset_id=aid,
                        asset_name=asset_name,
                        district=district,
                        severity="warning",
                        alert_type="threshold_crossed",
                        message=(
                            f"High partial discharge on {asset_name}: "
                            f"{sensor.partial_discharge_pc:.0f} pC "
                            f"(threshold: {PD_THRESHOLD_PC:.0f} pC). "
                            "Insulation degradation risk."
                        ),
                        previous_risk=prev_risk,
                        current_risk=cur_risk,
                        recommended_action="Schedule insulation testing within 48 hours.",
                    )
                    new_alerts.append(alert)
                    self._emit(alert)
                    self._mark_fired(aid, "pd_high")
                elif sensor and sensor.partial_discharge_pc < PD_THRESHOLD_PC - 10:
                    self._clear_fired(aid, "pd_high")

                # --- 6. Overload ---
                if sensor and sensor.load_pct > LOAD_THRESHOLD_PCT \
                        and not self._has_fired(aid, "overload"):
                    alert = Alert(
                        alert_id=self._aid(),
                        timestamp=self._ts(),
                        asset_id=aid,
                        asset_name=asset_name,
                        district=district,
                        severity="warning",
                        alert_type="threshold_crossed",
                        message=(
                            f"{asset_name} operating at {sensor.load_pct:.0f}% load "
                            f"(threshold: {LOAD_THRESHOLD_PCT:.0f}%). Overload risk."
                        ),
                        previous_risk=prev_risk,
                        current_risk=cur_risk,
                        recommended_action="Initiate load shedding or transfer to alternate feeder.",
                    )
                    new_alerts.append(alert)
                    self._emit(alert)
                    self._mark_fired(aid, "overload")
                elif sensor and sensor.load_pct < LOAD_THRESHOLD_PCT - 5:
                    self._clear_fired(aid, "overload")

                # Update previous risk
                self._prev_risk[aid] = cur_risk

            # --- 7. Weather warnings per district (evaluated once per update) ---
            for district, wx in weather_map.items():
                if wx.weather_risk_score > WEATHER_RISK_THRESHOLD \
                        and not self._has_fired(f"wx_{district}", "wx_high"):
                    # Find high-risk assets in this district
                    district_assets = [a for a in assets if a.get("district") == district]
                    risky_in_district = [
                        r for a in district_assets
                        if (r := asset_risks.get(a["asset_id"])) and r.risk_level in ("high", "critical")
                    ]
                    if risky_in_district:
                        alert = Alert(
                            alert_id=self._aid(),
                            timestamp=self._ts(),
                            asset_id="DISTRICT",
                            asset_name=f"{district} District",
                            district=district,
                            severity="warning",
                            alert_type="weather_warning",
                            message=(
                                f"Elevated weather risk in {district}: "
                                f"{wx.condition} conditions "
                                f"(risk score: {wx.weather_risk_score:.2f}). "
                                f"{len(risky_in_district)} high-risk asset(s) exposed."
                            ),
                            previous_risk=0.0,
                            current_risk=wx.weather_risk_score * 100,
                            recommended_action=(
                                f"Pre-position crew near {district}. "
                                "Inspect outdoor switchgear and line connections."
                            ),
                        )
                        new_alerts.append(alert)
                        self._emit(alert)
                        self._mark_fired(f"wx_{district}", "wx_high")
                elif wx.weather_risk_score < WEATHER_RISK_THRESHOLD - 0.1:
                    self._clear_fired(f"wx_{district}", "wx_high")

        return new_alerts

    # ------------------------------------------------------------------
    def get_active_alerts(self) -> list[Alert]:
        with self._lock:
            return list(self._alerts)

    def acknowledge(self, alert_id: str) -> bool:
        with self._lock:
            for alert in self._alerts:
                if alert.alert_id == alert_id:
                    alert.acknowledged = True
                    return True
        return False


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------
alert_engine = AlertEngine()


def get_active_alerts() -> list[Alert]:
    return alert_engine.get_active_alerts()
