"""
risk_engine.py

Extended real-time risk calculation engine.
Computes AssetRiskResult for each asset from live sensor + weather data.

Public API:
    compute_asset_risk(asset, sensor, weather) -> AssetRiskResult
    compute_all_risks(assets, sensors, weather_map) -> dict[asset_id -> AssetRiskResult]
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Optional

from ..data.realtime_simulator import SensorSnapshot
from ..data.weather_simulator import WeatherSnapshot

# ---------------------------------------------------------------------------
# Risk level thresholds (0-100 scale)
# ---------------------------------------------------------------------------
_THRESHOLDS = {"low": 30, "medium": 60, "high": 80}


def _risk_level(score: float) -> str:
    if score <= 30:
        return "low"
    if score <= 60:
        return "medium"
    if score <= 80:
        return "high"
    return "critical"


# ---------------------------------------------------------------------------
# Result dataclass
# ---------------------------------------------------------------------------
@dataclass
class AssetRiskResult:
    asset_id: str
    timestamp: str

    # Component scores (0-100)
    sensor_risk_score: float
    weather_risk_score: float
    historical_risk_score: float
    load_risk_score: float
    age_risk_score: float

    # Final
    overall_risk_score: float
    risk_level: str
    failure_probability: float      # 0-100%

    # Grid impact
    grid_impact_score: float        # failure_prob * customers_served * criticality
    customers_at_risk: int

    # Explainability
    contributing_factors: list[dict] = field(default_factory=list)
    risk_explanation: str = ""

    # Recommendation
    recommended_action: str = ""
    action_urgency_hours: int = 72

    def to_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# Sensor risk sub-score (0-100)
# ---------------------------------------------------------------------------
def _sensor_risk(sensor: SensorSnapshot, asset_type: str) -> tuple[float, list[dict]]:
    """
    Weighted sensor risk for transformer-class vs other asset types.
    Returns (score_0_100, contributing_factors).
    """
    is_tx = asset_type in ("transformer", "substation")
    factors: list[dict] = []

    # --- Partial discharge (strongest signal for TX/sub) ---
    pd_score = min(100.0, sensor.partial_discharge_pc / 1.5)   # 150 pC → 100
    pd_weight = 0.30 if is_tx else 0.15
    factors.append({"factor": "partial_discharge_pc", "value": round(sensor.partial_discharge_pc, 1),
                    "score": round(pd_score, 1), "weight": pd_weight})

    # --- Temperature ---
    # Normal range 30–70°C; above 80 is serious; above 95 is critical
    if sensor.temperature_c < 70:
        temp_score = max(0.0, (sensor.temperature_c - 30) / 40 * 40)
    else:
        temp_score = 40 + (sensor.temperature_c - 70) / 30 * 60
    temp_score = min(100.0, temp_score)
    temp_weight = 0.20 if is_tx else 0.25
    factors.append({"factor": "temperature_c", "value": round(sensor.temperature_c, 1),
                    "score": round(temp_score, 1), "weight": temp_weight})

    # --- Temperature rate of change ---
    rate_score = min(100.0, abs(sensor.temperature_rate) / 2.0 * 100)
    rate_weight = 0.10
    factors.append({"factor": "temperature_rate", "value": round(sensor.temperature_rate, 3),
                    "score": round(rate_score, 1), "weight": rate_weight})

    # --- Vibration ---
    # Normal < 2 mm/s; concerning > 5; critical > 10
    vib_score = min(100.0, sensor.vibration_mm_s / 10.0 * 100)
    vib_weight = 0.20 if is_tx else 0.30
    factors.append({"factor": "vibration_mm_s", "value": round(sensor.vibration_mm_s, 3),
                    "score": round(vib_score, 1), "weight": vib_weight})

    # --- Oil quality (only meaningful for tx-class) ---
    oil_score = max(0.0, 100.0 - sensor.oil_quality_pct)   # 100%=0 risk, 0%=100 risk
    oil_weight = 0.20 if is_tx else 0.05
    factors.append({"factor": "oil_quality_pct", "value": round(sensor.oil_quality_pct, 1),
                    "score": round(oil_score, 1), "weight": oil_weight})

    # Anomaly bonus
    anomaly_bonus = 20.0 if sensor.anomaly_active else 0.0

    total_weight = pd_weight + temp_weight + rate_weight + vib_weight + oil_weight
    score = sum(f["score"] * f["weight"] for f in factors) / total_weight + anomaly_bonus

    return min(100.0, score), factors


# ---------------------------------------------------------------------------
# Load risk sub-score (0-100)
# ---------------------------------------------------------------------------
def _load_risk(sensor: SensorSnapshot) -> tuple[float, dict]:
    load = sensor.load_pct
    if load < 70:
        score = load / 70 * 30
    elif load < 90:
        score = 30 + (load - 70) / 20 * 40
    else:
        score = 70 + (load - 90) / 20 * 30
    score = min(100.0, max(0.0, score))
    return score, {"factor": "load_pct", "value": round(load, 1),
                   "score": round(score, 1), "weight": 0.20}


# ---------------------------------------------------------------------------
# Age / maintenance risk sub-score (0-100)
# ---------------------------------------------------------------------------
def _age_risk(asset: dict) -> tuple[float, list[dict]]:
    age = asset.get("age_years", 10)
    last_maint = asset.get("last_maintenance_days_ago", 180)
    factors = []

    age_score = min(100.0, age / 30 * 70 + max(0.0, age - 20) * 2)
    factors.append({"factor": "age_years", "value": age,
                    "score": round(age_score, 1), "weight": 0.50})

    maint_score = min(100.0, last_maint / 365 * 60 + max(0.0, last_maint - 180) / 365 * 40)
    factors.append({"factor": "last_maintenance_days_ago", "value": last_maint,
                    "score": round(maint_score, 1), "weight": 0.50})

    combined = (age_score * 0.5 + maint_score * 0.5)
    return combined, factors


# ---------------------------------------------------------------------------
# Historical risk sub-score (0-100)
# ---------------------------------------------------------------------------
def _historical_risk(asset: dict) -> tuple[float, dict]:
    failures = asset.get("historical_failures_12mo", 0)
    score = min(100.0, failures / 6 * 100)
    return score, {"factor": "historical_failures_12mo", "value": failures,
                   "score": round(score, 1), "weight": 0.05}


# ---------------------------------------------------------------------------
# Recommendation generator
# ---------------------------------------------------------------------------
def _recommendation(risk_level: str, sensor: SensorSnapshot, asset: dict) -> tuple[str, int]:
    urgency_map = {"low": 720, "medium": 168, "high": 48, "critical": 4}
    urgency_h = urgency_map.get(risk_level, 72)

    if risk_level == "critical":
        action = (
            f"IMMEDIATE ACTION: Dispatch emergency crew to {asset['asset_name']}. "
            "Isolate if safe; prepare for controlled shutdown."
        )
    elif risk_level == "high":
        if sensor.anomaly_active:
            action = (
                f"Priority inspection required for {asset['asset_name']} — "
                f"active anomaly: {sensor.anomaly_type}. Schedule within 48 hours."
            )
        else:
            action = (
                f"Schedule priority maintenance for {asset['asset_name']} "
                "within 48 hours. Increase monitoring frequency."
            )
    elif risk_level == "medium":
        action = (
            f"Add {asset['asset_name']} to next maintenance cycle. "
            "Monitor daily. Verify oil quality and load levels."
        )
    else:
        action = (
            f"{asset['asset_name']} operating normally. "
            "Maintain standard monitoring schedule."
        )
    return action, urgency_h


# ---------------------------------------------------------------------------
# Main risk computation
# ---------------------------------------------------------------------------
def compute_asset_risk(
    asset: dict,
    sensor: SensorSnapshot,
    weather: Optional[WeatherSnapshot],
) -> AssetRiskResult:
    """Compute full risk result for a single asset."""
    ts = datetime.now(tz=timezone.utc).isoformat()
    atype = asset.get("asset_type", "transformer")
    is_tx = atype in ("transformer", "substation")

    # Component scores
    sensor_score, sensor_factors = _sensor_risk(sensor, atype)
    load_score, load_factor = _load_risk(sensor)
    age_score, age_factors = _age_risk(asset)
    hist_score, hist_factor = _historical_risk(asset)
    wx_score = weather.weather_risk_score * 100 if weather else 0.0
    wx_factor = {
        "factor": "weather_risk", "value": round(wx_score / 100, 3),
        "score": round(wx_score, 1), "weight": 0.10,
    }

    # Weighted combination — weights vary by asset type
    if is_tx:
        overall = (
            0.35 * sensor_score
            + 0.20 * load_score
            + 0.15 * age_score
            + 0.10 * hist_score
            + 0.10 * wx_score
            + 0.10 * age_score   # maintenance overdue sub-component already in age_score
        )
    else:
        overall = (
            0.30 * sensor_score
            + 0.25 * load_score
            + 0.20 * age_score
            + 0.10 * hist_score
            + 0.15 * wx_score
        )
    overall = round(min(100.0, max(0.0, overall)), 2)
    rl = _risk_level(overall)

    # Failure probability: non-linear mapping
    fail_prob = round(min(100.0, overall * 0.7 + (overall / 100) ** 2 * 30), 2)

    customers = asset.get("customers_served", 1000)
    criticality = asset.get("criticality", 0.5)
    grid_impact = round(fail_prob * customers * criticality / 1000, 2)  # normalized

    action, urgency = _recommendation(rl, sensor, asset)

    # Collect all contributing factors
    all_factors = sensor_factors + [load_factor] + age_factors + [hist_factor, wx_factor]
    all_factors.sort(key=lambda f: f["score"] * f["weight"], reverse=True)

    # Build explanation
    top = all_factors[:3]
    explanation_parts = []
    for f in top:
        if f["score"] > 30:
            explanation_parts.append(
                f"{f['factor'].replace('_', ' ')} at {f['value']} "
                f"(risk contribution: {f['score']:.0f}/100)"
            )
    if explanation_parts:
        explanation = (
            f"{asset['asset_name']} ({atype}) in {asset.get('district', 'Gujarat')} "
            f"has {rl.upper()} risk (score {overall:.0f}/100). "
            "Key drivers: " + "; ".join(explanation_parts) + "."
        )
    else:
        explanation = (
            f"{asset['asset_name']} operating within normal parameters. "
            f"Overall risk score: {overall:.0f}/100 ({rl})."
        )
    if sensor.anomaly_active:
        explanation += f" ⚠ Active anomaly detected: {sensor.anomaly_type}."

    return AssetRiskResult(
        asset_id=asset["asset_id"],
        timestamp=ts,
        sensor_risk_score=round(sensor_score, 2),
        weather_risk_score=round(wx_score, 2),
        historical_risk_score=round(hist_score, 2),
        load_risk_score=round(load_score, 2),
        age_risk_score=round(age_score, 2),
        overall_risk_score=overall,
        risk_level=rl,
        failure_probability=fail_prob,
        grid_impact_score=grid_impact,
        customers_at_risk=int(customers * fail_prob / 100),
        contributing_factors=all_factors,
        risk_explanation=explanation,
        recommended_action=action,
        action_urgency_hours=urgency,
    )


def compute_all_risks(
    assets: list[dict],
    sensors: dict[str, SensorSnapshot],
    weather_map: dict[str, WeatherSnapshot],
) -> dict[str, AssetRiskResult]:
    """Compute risk for all assets; returns dict keyed by asset_id."""
    results: dict[str, AssetRiskResult] = {}
    for asset in assets:
        aid = asset["asset_id"]
        sensor = sensors.get(aid)
        if sensor is None:
            continue
        wx = weather_map.get(asset.get("district", ""))
        try:
            results[aid] = compute_asset_risk(asset, sensor, wx)
        except Exception:
            pass
    return results
