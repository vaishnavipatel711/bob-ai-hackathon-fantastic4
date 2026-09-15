"""
weather_simulator.py

Real-time weather simulator for 15 Gujarat districts.
Updates every 30 seconds. Weather changes gradually; storms build over 5-10 minutes.

Public API:
    get_all_weather()                   -> dict[district -> WeatherSnapshot]
    get_weather_for_district(district)  -> WeatherSnapshot | None
    start()                             -> start background thread
    stop()                              -> stop background thread
"""

from __future__ import annotations

import math
import random
import threading
import time
from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Optional

from .gujarat_assets import GUJARAT_DISTRICTS

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
UPDATE_INTERVAL_S = 30

# Seasonal baseline: Gujarat is hot and humid; monsoon June-September
# This simulator uses time-of-day variation only (demo environment)
_RNG_SEED = "weather-sim-v1"

# District-level climate offsets (relative to base Gujarat climate)
# (temp_offset, humidity_offset, coastal)
_DISTRICT_CLIMATE: dict[str, tuple[float, float, bool]] = {
    "Kutch":       (2.0, -15.0, True),
    "Rajkot":      (1.0, -5.0, False),
    "Ahmedabad":   (0.0,  0.0, False),
    "Surat":       (-1.0, 12.0, True),
    "Vadodara":    (-0.5,  3.0, False),
    "Gandhinagar": (0.0,  0.0, False),
    "Anand":       (-0.5,  5.0, False),
    "Bharuch":     (-1.0, 10.0, True),
    "Mehsana":     (1.5, -8.0, False),
    "Banaskantha": (3.0, -12.0, False),
    "Jamnagar":    (0.5,  8.0, True),
    "Junagadh":    (0.0,  5.0, False),
    "Bhavnagar":   (-0.5,  9.0, True),
    "Navsari":     (-1.5, 14.0, True),
    "Panchmahal":  (0.5, -2.0, False),
}

_CONDITIONS = ["Clear", "Monsoon", "Storm", "Heat Wave", "Dust Storm"]


@dataclass
class WeatherSnapshot:
    district: str
    timestamp: str
    temperature_c: float
    humidity_pct: float
    wind_speed_kmh: float
    rainfall_mm_h: float
    storm_probability: float        # 0-1
    lightning_probability: float    # 0-1
    condition: str
    weather_risk_score: float       # 0-1

    def to_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# Per-district state for gradual transitions
# ---------------------------------------------------------------------------
@dataclass
class _DistrictState:
    district: str
    # Current "climate mode": 0=clear, 1=building_storm, 2=storm, 3=clearing
    mode: int = 0
    mode_start: float = 0.0
    mode_duration: float = 3600.0   # seconds in current mode
    storm_peak_prob: float = 0.0    # max storm probability for this event
    # Smoothed values (updated every cycle)
    storm_prob: float = 0.0
    lightning_prob: float = 0.0
    rainfall: float = 0.0
    wind_speed: float = 10.0


class WeatherSimulator:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._rng = random.Random(_RNG_SEED)
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._current: dict[str, WeatherSnapshot] = {}
        self._states: dict[str, _DistrictState] = {}

        self._init_state()

    def _init_state(self) -> None:
        now = time.time()
        for district in GUJARAT_DISTRICTS:
            st = _DistrictState(
                district=district,
                mode=0,
                mode_start=now,
                mode_duration=self._rng.uniform(1800, 7200),
                storm_peak_prob=0.0,
                storm_prob=0.0,
                lightning_prob=0.0,
                rainfall=0.0,
                wind_speed=self._rng.uniform(8, 22),
            )
            self._states[district] = st
            self._current[district] = self._build_snapshot(district, st, now)

    # ------------------------------------------------------------------
    # Mode transitions
    # ------------------------------------------------------------------
    def _advance_mode(self, st: _DistrictState, now: float) -> None:
        """Check if it's time to transition to the next mode."""
        elapsed = now - st.mode_start
        if elapsed < st.mode_duration:
            return

        st.mode_start = now

        if st.mode == 0:  # clear → maybe build storm
            if self._rng.random() < 0.25:  # 25% chance to build a storm
                st.mode = 1  # building
                st.mode_duration = self._rng.uniform(300, 600)   # 5-10 min build
                st.storm_peak_prob = self._rng.uniform(0.55, 0.95)
            else:
                st.mode_duration = self._rng.uniform(1800, 5400)  # stay clear
        elif st.mode == 1:  # building → storm
            st.mode = 2
            st.mode_duration = self._rng.uniform(600, 2400)
        elif st.mode == 2:  # storm → clearing
            st.mode = 3
            st.mode_duration = self._rng.uniform(300, 900)
        elif st.mode == 3:  # clearing → clear
            st.mode = 0
            st.storm_peak_prob = 0.0
            st.mode_duration = self._rng.uniform(1800, 5400)

    def _compute_storm_target(self, st: _DistrictState, now: float) -> float:
        """Target storm probability for current mode/phase."""
        elapsed = now - st.mode_start
        frac = min(1.0, elapsed / max(1.0, st.mode_duration))

        if st.mode == 0:
            return 0.02 + self._rng.gauss(0, 0.005)
        elif st.mode == 1:
            # Ramp up
            return st.storm_peak_prob * frac
        elif st.mode == 2:
            # Hold near peak with minor fluctuation
            return st.storm_peak_prob + self._rng.gauss(0, 0.03)
        else:  # mode == 3
            # Ramp down
            return st.storm_peak_prob * (1.0 - frac)

    # ------------------------------------------------------------------
    # Snapshot construction
    # ------------------------------------------------------------------
    def _build_snapshot(self, district: str, st: _DistrictState, now: float) -> WeatherSnapshot:
        climate = _DISTRICT_CLIMATE.get(district, (0.0, 0.0, False))
        temp_offset, hum_offset, is_coastal = climate

        # Daily temperature cycle: hottest ~14:00, coolest ~05:00
        phase = (now % 86400) / 86400 * 2 * math.pi
        hour_of_day = (now % 86400) / 3600
        temp_daily = 12 * math.sin(phase - math.pi / 2)  # ±12°C swing

        base_temp = 35 + temp_offset + temp_daily + self._rng.gauss(0, 0.5)
        base_humidity = 65 + hum_offset + 5 * math.sin(phase + 1) + self._rng.gauss(0, 1)

        # Rain/wind scale with storm probability
        sp = st.storm_prob
        lp = min(1.0, sp * 0.8 + (0.05 if is_coastal else 0))
        rainfall = max(0.0, sp * 45 + self._rng.gauss(0, 1)) if sp > 0.2 else 0.0
        wind = st.wind_speed + sp * 40 + self._rng.gauss(0, 1)
        wind = max(0.0, min(120.0, wind))
        humidity = min(100.0, max(20.0, base_humidity + sp * 20))
        temp = base_temp - sp * 5  # storms cool the air

        # Condition label
        if sp > 0.7:
            condition = "Storm"
        elif sp > 0.3:
            condition = "Monsoon"
        elif temp > 42:
            condition = "Heat Wave"
        elif wind > 55 and rainfall < 1:
            condition = "Dust Storm"
        else:
            condition = "Clear"

        # Weather risk: combination of storm, lightning, high temp, high wind
        risk = (
            0.40 * sp
            + 0.25 * lp
            + 0.15 * max(0.0, (temp - 38) / 12)
            + 0.10 * min(1.0, wind / 80)
            + 0.10 * min(1.0, rainfall / 30)
        )
        risk = max(0.0, min(1.0, risk))

        ts = datetime.fromtimestamp(now, tz=timezone.utc).isoformat()
        return WeatherSnapshot(
            district=district,
            timestamp=ts,
            temperature_c=round(temp, 1),
            humidity_pct=round(humidity, 1),
            wind_speed_kmh=round(wind, 1),
            rainfall_mm_h=round(rainfall, 2),
            storm_probability=round(sp, 3),
            lightning_probability=round(lp, 3),
            condition=condition,
            weather_risk_score=round(risk, 3),
        )

    # ------------------------------------------------------------------
    # Background thread
    # ------------------------------------------------------------------
    def _run(self) -> None:
        while not self._stop_event.is_set():
            now = time.time()
            updated: dict[str, WeatherSnapshot] = {}

            for district in GUJARAT_DISTRICTS:
                st = self._states[district]
                self._advance_mode(st, now)

                # Smoothly move storm_prob toward target
                target = max(0.0, min(1.0, self._compute_storm_target(st, now)))
                alpha = 0.15  # smoothing factor per 30s update
                st.storm_prob = st.storm_prob * (1 - alpha) + target * alpha
                st.lightning_prob = min(1.0, st.storm_prob * 0.85)

                # Gradually change wind speed
                wind_target = 10 + st.storm_prob * 50 + self._rng.gauss(0, 3)
                st.wind_speed = st.wind_speed * 0.8 + wind_target * 0.2

                snap = self._build_snapshot(district, st, now)
                updated[district] = snap

            with self._lock:
                self._current.update(updated)

            self._stop_event.wait(timeout=UPDATE_INTERVAL_S)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, daemon=True, name="weather-sim")
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=10)

    def get_all_weather(self) -> dict[str, WeatherSnapshot]:
        with self._lock:
            return dict(self._current)

    def get_weather_for_district(self, district: str) -> Optional[WeatherSnapshot]:
        with self._lock:
            return self._current.get(district)


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------
weather_simulator = WeatherSimulator()


def get_all_weather() -> dict[str, WeatherSnapshot]:
    return weather_simulator.get_all_weather()


def get_weather_for_district(district: str) -> Optional[WeatherSnapshot]:
    return weather_simulator.get_weather_for_district(district)
