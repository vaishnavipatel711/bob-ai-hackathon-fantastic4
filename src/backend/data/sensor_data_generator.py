"""
sensor_data_generator.py

Generates synthetic SensorReading data for grid assets.

Design notes:
- Each asset gets ONE SensorReading, generated deterministically per-asset
  (seeded by asset_id) so repeated calls within a process are stable, but
  different assets look different.
- ~15-20% of assets are flagged as "failure signature" assets: these get
  correlated bad readings (high oil_quality_index degradation, high
  vibration, high temperature relative to rated max, high load relative to
  rated capacity). The rest are generated to look healthy with normal noise.
- oil_quality_index is modeled as a DEGRADATION index in [0, 1], where
  higher = worse oil condition (more contaminated / degraded). This matches
  "high oil_quality_index + high vibration_mm_s" being called a bad
  combination in the failure-signature description.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Optional


@dataclass
class SensorReading:
    oil_quality_index: float  # 0-1, higher = more degraded/worse
    vibration_mm_s: float
    temperature_c: float
    load_kw: float
    rated_capacity_kw: float
    vibration_threshold_mm_s: float = 4.5
    rated_max_temp_c: float = 95.0


def _rng_for_asset(asset_id: str) -> random.Random:
    """Deterministic RNG per asset so values are stable within a run."""
    return random.Random(f"sensor::{asset_id}")


def generate_sensor_reading(
    asset_id: str,
    asset_type: str,
    failure_signature: bool = False,
) -> SensorReading:
    """
    Generate a single SensorReading for an asset.

    Args:
        asset_id: unique asset identifier, used to seed deterministic RNG.
        asset_type: one of substation/transformer/switchgear/feeder/line/pole.
            Used to pick a realistic rated_capacity_kw range.
        failure_signature: if True, injects correlated "about to fail"
            readings (degraded oil, high vibration, high temp/load).
    """
    rng = _rng_for_asset(asset_id)

    # Rated capacity varies by asset type (rough, illustrative ranges).
    capacity_ranges = {
        "substation": (8000, 25000),
        "transformer": (500, 5000),
        "switchgear": (300, 3000),
        "feeder": (200, 2000),
        "line": (100, 1500),
        "pole": (20, 150),
    }
    lo, hi = capacity_ranges.get(asset_type, (200, 2000))
    rated_capacity_kw = round(rng.uniform(lo, hi), 1)

    rated_max_temp_c = 95.0
    vibration_threshold_mm_s = 4.5

    if failure_signature:
        # Correlated bad readings: degraded oil, high vibration,
        # near/over-temp, near/over-rated load.
        oil_quality_index = round(rng.uniform(0.70, 0.97), 3)
        vibration_mm_s = round(rng.uniform(4.3, 7.5), 2)
        temperature_c = round(rng.uniform(rated_max_temp_c * 0.92, rated_max_temp_c * 1.15), 1)
        load_kw = round(rated_capacity_kw * rng.uniform(0.90, 1.08), 1)
    else:
        # Healthy-looking readings with normal noise.
        oil_quality_index = round(rng.uniform(0.03, 0.35), 3)
        vibration_mm_s = round(rng.uniform(0.4, 3.2), 2)
        temperature_c = round(rng.uniform(35, rated_max_temp_c * 0.75), 1)
        load_kw = round(rated_capacity_kw * rng.uniform(0.30, 0.75), 1)

    return SensorReading(
        oil_quality_index=oil_quality_index,
        vibration_mm_s=vibration_mm_s,
        vibration_threshold_mm_s=vibration_threshold_mm_s,
        temperature_c=temperature_c,
        rated_max_temp_c=rated_max_temp_c,
        load_kw=load_kw,
        rated_capacity_kw=rated_capacity_kw,
    )