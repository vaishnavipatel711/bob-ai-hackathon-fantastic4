"""
mock_data.py

Day-1 stand-in for the teammate's data-generation pipeline.

Two things live here:
  1. Raw per-asset inputs (location, asset_type, sensor readings, weather
     forecast, incident history, customers_affected_estimate) for 5
     representative assets.
  2. build_mock_assets(), which runs those raw inputs through the REAL
     risk_scoring_model / failure_predictor / impact_ranking pipeline so
     the mocks are produced the same way real data will be on Day 2 --
     not just copy-pasted fake numbers.

The output of build_mock_assets() matches the shared asset schema exactly:

{
  "asset_id": str,
  "location": {"lat": float, "lon": float, "name": str},
  "asset_type": str,
  "risk_score": float,
  "risk_level": str,
  "contributing_factors": [{"factor": str, "value": str, "weight": float}, ...],
  "predicted_days_to_failure": int,
  "customers_affected_estimate": int
}

IMPORTANT: field names above are relied on by other teammates. Do not
rename them here or anywhere downstream.
"""

from typing import List

from ..models.risk_scoring_model import (
    SensorReading,
    WeatherForecast,
    IncidentHistory,
    compute_risk_score,
)
from ..models.failure_predictor import predict_days_to_failure


# ---------------------------------------------------------------------------
# Raw per-asset inputs. Five assets spanning risk levels / asset types.
# ---------------------------------------------------------------------------
_RAW_ASSETS = [
    {
        "asset_id": "TX-104",
        "location": {"lat": 22.56, "lon": 72.93, "name": "Anand Substation 4"},
        "asset_type": "transformer",
        "customers_affected_estimate": 4200,
        "sensors": SensorReading(
            oil_quality_index=0.9,
            vibration_mm_s=7.5,
            vibration_threshold_mm_s=4.5,
            temperature_c=88,
            rated_max_temp_c=95,
            load_kw=950,
            rated_capacity_kw=1000,
        ),
        "weather": WeatherForecast(storm_probability_72h=0.85, high_wind_expected=True),
        "incidents": IncidentHistory(incidents_last_12mo=2, last_incident_days_ago=25),
    },
    {
        "asset_id": "SUB-02",
        "location": {"lat": 22.30, "lon": 73.19, "name": "Vadodara Central Substation"},
        "asset_type": "substation",
        "customers_affected_estimate": 9800,
        "sensors": SensorReading(
            oil_quality_index=0.35,
            vibration_mm_s=2.5,
            vibration_threshold_mm_s=4.5,
            temperature_c=68,
            rated_max_temp_c=95,
            load_kw=7200,
            rated_capacity_kw=8000,
        ),
        "weather": WeatherForecast(storm_probability_72h=0.2),
        "incidents": IncidentHistory(incidents_last_12mo=0, last_incident_days_ago=None),
    },
    {
        "asset_id": "POLE-77",
        "location": {"lat": 22.48, "lon": 73.05, "name": "Makarpura Feeder Line 7"},
        "asset_type": "pole",
        "customers_affected_estimate": 340,
        "sensors": SensorReading(
            oil_quality_index=None,
            vibration_mm_s=1.2,
            vibration_threshold_mm_s=3.0,
            temperature_c=None,
        ),
        "weather": WeatherForecast(storm_probability_72h=0.75, high_wind_expected=True, flood_risk=True),
        "incidents": IncidentHistory(incidents_last_12mo=3, last_incident_days_ago=15),
    },
    {
        "asset_id": "FDR-21",
        "location": {"lat": 22.31, "lon": 73.22, "name": "Gorwa Industrial Feeder"},
        "asset_type": "feeder",
        "customers_affected_estimate": 1600,
        "sensors": SensorReading(
            oil_quality_index=0.15,
            vibration_mm_s=1.0,
            vibration_threshold_mm_s=3.5,
            temperature_c=55,
            rated_max_temp_c=90,
            load_kw=3100,
            rated_capacity_kw=3200,
        ),
        "weather": WeatherForecast(storm_probability_72h=0.1),
        "incidents": IncidentHistory(incidents_last_12mo=0, last_incident_days_ago=None),
    },
    {
        "asset_id": "SWG-15",
        "location": {"lat": 22.29, "lon": 73.15, "name": "Akota Switchgear Unit 15"},
        "asset_type": "switchgear",
        "customers_affected_estimate": 2500,
        "sensors": SensorReading(
            oil_quality_index=0.55,
            vibration_mm_s=4.8,
            vibration_threshold_mm_s=4.0,
            temperature_c=88,
            rated_max_temp_c=90,
            load_kw=1900,
            rated_capacity_kw=2000,
        ),
        "weather": WeatherForecast(storm_probability_72h=0.4),
        "incidents": IncidentHistory(incidents_last_12mo=2, last_incident_days_ago=45),
    },
]


def build_mock_assets() -> List[dict]:
    """Run raw mock inputs through the real risk/failure pipeline."""
    assets = []
    for raw in _RAW_ASSETS:
        risk_result = compute_risk_score(
            sensors=raw["sensors"],
            weather=raw["weather"],
            incidents=raw["incidents"],
        )
        days_to_failure = predict_days_to_failure(
            risk_score=risk_result.risk_score,
            asset_type=raw["asset_type"],
            contributing_factors=[f.to_dict() for f in risk_result.contributing_factors],
        )
        assets.append(
            {
                "asset_id": raw["asset_id"],
                "location": raw["location"],
                "asset_type": raw["asset_type"],
                "risk_score": risk_result.risk_score,
                "risk_level": risk_result.risk_level,
                "contributing_factors": [f.to_dict() for f in risk_result.contributing_factors],
                "predicted_days_to_failure": days_to_failure,
                "customers_affected_estimate": raw["customers_affected_estimate"],
            }
        )
    return assets


# Built once at import time -- cheap, deterministic, fine for hackathon scope.
MOCK_ASSETS: List[dict] = build_mock_assets()


def get_all_assets() -> List[dict]:
    """Mock implementation of the data-source contract. See asset_source.py."""
    return MOCK_ASSETS


def get_asset_by_id(asset_id: str):
    """Mock implementation of the data-source contract. See asset_source.py."""
    for asset in MOCK_ASSETS:
        if asset["asset_id"] == asset_id:
            return asset
    return None