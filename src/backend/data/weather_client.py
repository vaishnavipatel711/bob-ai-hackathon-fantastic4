"""
weather_client.py

Generates synthetic WeatherForecast data for grid assets, keyed on
location (lat/lon) and, indirectly, on asset_id for determinism.

In a real system this would call an actual weather API (e.g. IBM
Environmental Intelligence / Bob weather data) keyed on lat/lon. For the
hackathon demo we synthesize plausible Gujarat monsoon-season-style
forecasts, with elevated storm/flood risk injected for "failure signature"
assets so those assets look genuinely threatened from multiple angles at
once (sensor + weather), which is what makes the demo's high-risk examples
compelling.
"""

from __future__ import annotations

import random
from dataclasses import dataclass


@dataclass
class WeatherForecast:
    storm_probability_72h: float  # 0-1
    high_wind_expected: bool
    flood_risk: bool


def _rng_for_asset(asset_id: str) -> random.Random:
    return random.Random(f"weather::{asset_id}")


def get_weather_forecast(
    asset_id: str,
    lat: float,
    lon: float,
    failure_signature: bool = False,
) -> WeatherForecast:
    """
    Generate a WeatherForecast for an asset's location.

    Args:
        asset_id: unique asset identifier, used to seed deterministic RNG.
        lat, lon: asset location (currently only used to keep the call
            signature realistic for a future real weather-API swap-in;
            not used to bias values, since our synthetic area is small).
        failure_signature: if True, injects elevated storm/flood risk to
            correlate with bad sensor readings for this asset.
    """
    rng = _rng_for_asset(asset_id)

    if failure_signature:
        storm_probability_72h = round(rng.uniform(0.55, 0.95), 3)
        high_wind_expected = rng.random() < 0.75
        flood_risk = rng.random() < 0.55
    else:
        storm_probability_72h = round(rng.uniform(0.02, 0.35), 3)
        high_wind_expected = rng.random() < 0.10
        flood_risk = rng.random() < 0.08

    return WeatherForecast(
        storm_probability_72h=storm_probability_72h,
        high_wind_expected=high_wind_expected,
        flood_risk=flood_risk,
    )