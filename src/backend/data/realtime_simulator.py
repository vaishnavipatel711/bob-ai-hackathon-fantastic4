"""
realtime_simulator.py

Real-time streaming sensor simulator for Gujarat grid assets.

Runs a background thread that updates sensor values every 5 seconds.
Introduces realistic correlated variations and occasional anomaly spikes.

Public API:
    get_current_readings()          -> dict[asset_id -> SensorSnapshot]
    get_sensor_history(asset_id, minutes=60) -> list[SensorSnapshot]
    subscribe(callback)             -> register push callback
    unsubscribe(callback)           -> deregister push callback
    start()                         -> start the background thread
    stop()                          -> stop the background thread
"""

from __future__ import annotations

import math
import random
import threading
import time
from collections import deque
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Callable, Optional

from .gujarat_assets import GUJARAT_ASSETS

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
UPDATE_INTERVAL_S = 5          # sensor update cadence
HISTORY_MINUTES = 60           # how many minutes of history to retain
MAX_HISTORY_SAMPLES = (HISTORY_MINUTES * 60) // UPDATE_INTERVAL_S  # 720 samples

# Anomaly settings
ANOMALY_COOLDOWN_S = 60        # min gap between anomalies on same asset
ANOMALY_MIN_DURATION_S = 120   # anomaly lasts at least 2 min
ANOMALY_MAX_DURATION_S = 480   # anomaly lasts at most 8 min
DEGRADING_ASSET_COUNT = 2      # always 2 assets in degrading state
ANOMALY_SPIKE_INTERVAL_MIN_S = 180   # spike every 3 min minimum
ANOMALY_SPIKE_INTERVAL_MAX_S = 300   # spike every 5 min maximum

# Seed for deterministic initial assignment of degrading/spike assets
_RNG_SEED = "realtime-sim-v1"


@dataclass
class SensorSnapshot:
    asset_id: str
    timestamp: str                  # ISO8601 UTC
    temperature_c: float
    temperature_rate: float         # °C/min rate of change
    vibration_mm_s: float
    partial_discharge_pc: float     # picocoulombs
    oil_quality_pct: float          # 100=new, 0=fully degraded
    oil_temperature_c: float
    load_pct: float                 # 0-100%
    voltage_kv: float
    current_a: float
    anomaly_active: bool
    anomaly_type: str               # "overheating"|"high_vibration"|"pd_spike"|"overload"|""

    def to_dict(self) -> dict:
        return asdict(self)


# ---------------------------------------------------------------------------
# Per-asset baseline derived from the static asset definition
# ---------------------------------------------------------------------------
def _asset_baseline(asset: dict) -> dict:
    """Compute normal operating ranges from asset properties."""
    age = asset["age_years"]
    criticality = asset["criticality"]
    atype = asset["asset_type"]

    # Transformers / substations run hotter and degrade more
    is_transformer_class = atype in ("transformer", "substation")

    base_temp = 45 + age * 0.8 + criticality * 10
    base_oil_quality = max(30.0, 100.0 - age * 2.5)
    base_load = 55 + criticality * 25
    base_vibration = 0.8 + age * 0.05 if is_transformer_class else 1.5 + age * 0.08
    base_pd = 5 + age * 0.3 if is_transformer_class else 2.0
    rated_kv = (
        400 if asset["rated_capacity_kw"] >= 300000
        else 220 if asset["rated_capacity_kw"] >= 100000
        else 132 if asset["rated_capacity_kw"] >= 50000
        else 33
    )
    base_current = (asset["rated_capacity_kw"] / (rated_kv * 1.732)) * (base_load / 100)

    return {
        "base_temp": base_temp,
        "base_oil_quality": base_oil_quality,
        "base_load": base_load,
        "base_vibration": base_vibration,
        "base_pd": base_pd,
        "rated_kv": float(rated_kv),
        "base_current": base_current,
    }


# ---------------------------------------------------------------------------
# Simulator core
# ---------------------------------------------------------------------------
class RealtimeSimulator:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self._rng = random.Random(_RNG_SEED)
        self._thread: Optional[threading.Thread] = None
        self._stop_event = threading.Event()
        self._callbacks: list[Callable] = []

        # Per-asset state
        self._baselines: dict[str, dict] = {}
        self._current: dict[str, SensorSnapshot] = {}
        self._history: dict[str, deque] = {}

        # Anomaly state per asset
        self._anomaly_end_time: dict[str, float] = {}     # 0 = no active anomaly
        self._anomaly_type: dict[str, str] = {}
        self._anomaly_cooldown_end: dict[str, float] = {}

        # Degrading assets cycle state
        self._degrading_ids: list[str] = []
        self._degrading_phase: dict[str, float] = {}      # 0.0 → 1.0 progress
        self._degrading_phase_start: dict[str, float] = {}
        self._degrading_phase_duration: dict[str, float] = {}  # seconds for one cycle

        # Next spike schedule
        self._next_spike_time: float = 0.0

        self._init_state()

    def _init_state(self) -> None:
        asset_ids = [a["asset_id"] for a in GUJARAT_ASSETS]

        for asset in GUJARAT_ASSETS:
            aid = asset["asset_id"]
            self._baselines[aid] = _asset_baseline(asset)
            self._history[aid] = deque(maxlen=MAX_HISTORY_SAMPLES)
            self._anomaly_end_time[aid] = 0.0
            self._anomaly_type[aid] = ""
            self._anomaly_cooldown_end[aid] = 0.0
            self._degrading_phase[aid] = 0.0
            self._degrading_phase_start[aid] = time.time()
            self._degrading_phase_duration[aid] = 900.0  # 15 min cycle

        # Pick the 2 always-degrading assets deterministically
        rng2 = random.Random(_RNG_SEED + ":degrading")
        self._degrading_ids = rng2.sample(asset_ids, DEGRADING_ASSET_COUNT)

        # Stagger their phases so they don't peak simultaneously
        for i, aid in enumerate(self._degrading_ids):
            self._degrading_phase[aid] = i * 0.33  # stagger by 1/3 cycle

        # Schedule first spike
        self._next_spike_time = time.time() + self._rng.uniform(
            ANOMALY_SPIKE_INTERVAL_MIN_S, ANOMALY_SPIKE_INTERVAL_MAX_S
        )

        # Generate initial readings
        for asset in GUJARAT_ASSETS:
            snap = self._compute_snapshot(asset, time.time())
            self._current[asset["asset_id"]] = snap
            self._history[asset["asset_id"]].append(snap)

    # ------------------------------------------------------------------
    # Snapshot computation
    # ------------------------------------------------------------------
    def _compute_snapshot(self, asset: dict, now: float) -> SensorSnapshot:
        aid = asset["asset_id"]
        bl = self._baselines[aid]
        ts = datetime.fromtimestamp(now, tz=timezone.utc).isoformat()

        # Phase angle for slow sinusoidal variation (load cycles, temp drift)
        phase = (now % 86400) / 86400 * 2 * math.pi  # daily cycle
        fast_phase = (now % 3600) / 3600 * 2 * math.pi  # hourly sub-cycle

        # --- Degrading asset multiplier ---
        degrade_factor = 0.0
        if aid in self._degrading_ids:
            elapsed = now - self._degrading_phase_start[aid]
            duration = self._degrading_phase_duration[aid]
            raw_phase = (self._degrading_phase[aid] + elapsed / duration) % 1.0
            # Triangle wave: 0→1→0 over one cycle
            if raw_phase < 0.5:
                degrade_factor = raw_phase * 2
            else:
                degrade_factor = (1.0 - raw_phase) * 2
            # Reset phase if a full cycle just completed
            if elapsed >= duration:
                self._degrading_phase_start[aid] = now
                self._degrading_phase[aid] = 0.0

        # --- Active anomaly multiplier ---
        anomaly_active = False
        anomaly_type = ""
        anomaly_factor = 0.0
        if self._anomaly_end_time[aid] > now:
            anomaly_active = True
            anomaly_type = self._anomaly_type[aid]
            # Smooth ramp-up / ramp-down: peak at mid-point
            total = self._anomaly_end_time[aid] - (
                self._anomaly_end_time[aid] - ANOMALY_MIN_DURATION_S
            )
            elapsed_anomaly = now - (self._anomaly_end_time[aid] - total)
            # Just use a fixed peak factor regardless of position for simplicity
            anomaly_factor = 1.0

        # --- Base sensor values with natural variation ---
        load_cycle = 0.12 * math.sin(phase) + 0.04 * math.sin(fast_phase * 3)
        load_pct = bl["base_load"] + load_cycle * 20

        temp_c = (
            bl["base_temp"]
            + 8 * math.sin(phase - 0.5)
            + 2 * math.sin(fast_phase)
            + self._rng.gauss(0, 0.3)
            + degrade_factor * 20
            + (anomaly_factor * 35 if anomaly_type == "overheating" else 0)
        )

        oil_temp_c = temp_c - 5 + self._rng.gauss(0, 0.2)

        vibration = (
            bl["base_vibration"]
            + 0.1 * math.sin(fast_phase * 7)
            + self._rng.gauss(0, 0.05)
            + degrade_factor * 3
            + (anomaly_factor * 8 if anomaly_type == "high_vibration" else 0)
        )

        pd_pc = (
            bl["base_pd"]
            + degrade_factor * 40
            + self._rng.gauss(0, 0.5)
            + (anomaly_factor * 120 if anomaly_type == "pd_spike" else 0)
        )

        oil_quality = max(
            0.0,
            min(100.0,
                bl["base_oil_quality"]
                - degrade_factor * 15
                + self._rng.gauss(0, 0.1)
                - (anomaly_factor * 5 if anomaly_type in ("overheating", "pd_spike") else 0)
            )
        )

        load_pct_final = min(
            110.0,
            max(0.0,
                load_pct
                + degrade_factor * 10
                + (anomaly_factor * 25 if anomaly_type == "overload" else 0)
                + self._rng.gauss(0, 0.5)
            )
        )

        voltage_kv = bl["rated_kv"] * (1.0 + 0.02 * math.sin(phase) + self._rng.gauss(0, 0.005))
        current_a = max(0.0, bl["base_current"] * (load_pct_final / 100) + self._rng.gauss(0, 2))

        # Temperature rate of change (°C/min): compare with last known value
        prev = self._current.get(aid)
        if prev is not None:
            temp_rate = (temp_c - prev.temperature_c) / (UPDATE_INTERVAL_S / 60)
        else:
            temp_rate = 0.0

        return SensorSnapshot(
            asset_id=aid,
            timestamp=ts,
            temperature_c=round(temp_c, 2),
            temperature_rate=round(temp_rate, 3),
            vibration_mm_s=round(max(0.0, vibration), 3),
            partial_discharge_pc=round(max(0.0, pd_pc), 2),
            oil_quality_pct=round(oil_quality, 2),
            oil_temperature_c=round(oil_temp_c, 2),
            load_pct=round(load_pct_final, 2),
            voltage_kv=round(voltage_kv, 3),
            current_a=round(current_a, 2),
            anomaly_active=anomaly_active,
            anomaly_type=anomaly_type,
        )

    # ------------------------------------------------------------------
    # Anomaly injection
    # ------------------------------------------------------------------
    def _maybe_inject_spike(self, now: float) -> None:
        """Randomly pick one non-cooling-down asset and inject an anomaly."""
        if now < self._next_spike_time:
            return

        candidates = [
            a["asset_id"] for a in GUJARAT_ASSETS
            if self._anomaly_cooldown_end[a["asset_id"]] < now
            and self._anomaly_end_time[a["asset_id"]] < now
        ]
        if not candidates:
            return

        target = self._rng.choice(candidates)
        atype = self._rng.choice(["overheating", "high_vibration", "pd_spike", "overload"])
        duration = self._rng.uniform(ANOMALY_MIN_DURATION_S, ANOMALY_MAX_DURATION_S)

        self._anomaly_end_time[target] = now + duration
        self._anomaly_type[target] = atype
        self._anomaly_cooldown_end[target] = now + duration + ANOMALY_COOLDOWN_S

        # Schedule next spike
        self._next_spike_time = now + self._rng.uniform(
            ANOMALY_SPIKE_INTERVAL_MIN_S, ANOMALY_SPIKE_INTERVAL_MAX_S
        )

    # ------------------------------------------------------------------
    # Background thread
    # ------------------------------------------------------------------
    def _run(self) -> None:
        while not self._stop_event.is_set():
            now = time.time()
            self._maybe_inject_spike(now)

            updated: dict[str, SensorSnapshot] = {}
            for asset in GUJARAT_ASSETS:
                snap = self._compute_snapshot(asset, now)
                updated[asset["asset_id"]] = snap

            with self._lock:
                for aid, snap in updated.items():
                    self._current[aid] = snap
                    self._history[aid].append(snap)

            # Notify subscribers
            callbacks = list(self._callbacks)
            for cb in callbacks:
                try:
                    cb(updated)
                except Exception:
                    pass

            self._stop_event.wait(timeout=UPDATE_INTERVAL_S)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def start(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return
        self._stop_event.clear()
        self._thread = threading.Thread(target=self._run, daemon=True, name="sensor-sim")
        self._thread.start()

    def stop(self) -> None:
        self._stop_event.set()
        if self._thread is not None:
            self._thread.join(timeout=10)

    def get_current_readings(self) -> dict[str, SensorSnapshot]:
        with self._lock:
            return dict(self._current)

    def get_sensor_history(self, asset_id: str, minutes: int = 60) -> list[SensorSnapshot]:
        max_samples = (minutes * 60) // UPDATE_INTERVAL_S
        with self._lock:
            hist = self._history.get(asset_id)
            if hist is None:
                return []
            samples = list(hist)
        return samples[-max_samples:]

    def subscribe(self, callback: Callable[[dict[str, SensorSnapshot]], None]) -> None:
        with self._lock:
            if callback not in self._callbacks:
                self._callbacks.append(callback)

    def unsubscribe(self, callback: Callable) -> None:
        with self._lock:
            self._callbacks = [c for c in self._callbacks if c is not callback]


# ---------------------------------------------------------------------------
# Module-level singleton
# ---------------------------------------------------------------------------
simulator = RealtimeSimulator()


def get_current_readings() -> dict[str, SensorSnapshot]:
    return simulator.get_current_readings()


def get_sensor_history(asset_id: str, minutes: int = 60) -> list[SensorSnapshot]:
    return simulator.get_sensor_history(asset_id, minutes)


def subscribe(callback: Callable) -> None:
    simulator.subscribe(callback)


def unsubscribe(callback: Callable) -> None:
    simulator.unsubscribe(callback)
