"""
risk_scoring_model.py

Explainable, weighted risk-scoring engine.

Design intent (judges reward explainability over black-box ML):
  - Every input signal maps to a named "factor" with a fixed, documented
    weight (RISK_WEIGHTS below). Weights are visible constants, not
    learned coefficients hidden inside a model object.
  - risk_score = sum(weight[factor] * normalized_sub_score[factor])
    for every factor that fires (sub_score > 0).
  - contributing_factors lists exactly which factors fired, their raw
    value, and their contribution weight -- this is what powers the
    /assets/{id}/explain endpoint and any "why is this risky" UI.

This is intentionally NOT a black-box model. It's a transparent, tunable
weighted-sum scorer (the hackathon prompt explicitly allows "a weighted
scoring approach or a simple interpretable model").

Swap plan (Day 2): none needed here -- this module is data-source agnostic.
It only needs SensorReading / WeatherForecast / IncidentHistory / AssetMeta
objects, however they're produced (mock today, teammate's data pipeline
tomorrow).
"""

from dataclasses import dataclass, field
from typing import Optional


# ---------------------------------------------------------------------------
# Fixed, documented weights. Must sum to 1.0 -- enforced by a self-test below.
# Tune these during the hackathon; keep them visible and named for judges.
# ---------------------------------------------------------------------------
RISK_WEIGHTS = {
    "oil_quality": 0.25,       # transformer oil dielectric / contamination state
    "vibration": 0.20,         # vibration sensor vs. threshold
    "temperature": 0.15,       # operating temperature vs. rated max
    "load_factor": 0.15,       # sustained load vs. rated capacity
    "weather_forecast": 0.15,  # storm / extreme-weather exposure in next N hours
    "incident_history": 0.10,  # prior faults / repairs on this asset
}

assert abs(sum(RISK_WEIGHTS.values()) - 1.0) < 1e-9, "RISK_WEIGHTS must sum to 1.0"

# Minimum *contribution* (weight × sub_score) for a factor to appear in
# contributing_factors.  Guarding on sub_score alone would include a
# low-weight factor (e.g. incident_history weight=0.10) whenever its
# raw sub_score exceeds 0.15, even if its actual contribution to the total
# risk score is only 0.015 — noise rather than signal.
CONTRIBUTION_THRESHOLD = 0.03   # contribution = weight * sub_score

HIGH_RISK_THRESHOLD = 0.70
MEDIUM_RISK_THRESHOLD = 0.40


# ---------------------------------------------------------------------------
# Input data shapes. These are the "raw" signals the model consumes.
# The data-generation teammate's pipeline should produce these (or dicts
# with these fields) per asset.
# ---------------------------------------------------------------------------
@dataclass
class SensorReading:
    oil_quality_index: Optional[float] = None   # 0 (pristine) - 1 (fully degraded)
    vibration_mm_s: Optional[float] = None       # measured vibration, mm/s
    vibration_threshold_mm_s: float = 4.5        # asset-type rated threshold
    temperature_c: Optional[float] = None
    rated_max_temp_c: float = 95.0
    load_kw: Optional[float] = None
    rated_capacity_kw: Optional[float] = None


@dataclass
class WeatherForecast:
    storm_probability_72h: float = 0.0   # 0-1
    high_wind_expected: bool = False
    flood_risk: bool = False


@dataclass
class IncidentHistory:
    incidents_last_12mo: int = 0
    last_incident_days_ago: Optional[int] = None


@dataclass
class AssetMeta:
    asset_id: str
    asset_type: str  # e.g. "transformer", "substation", "feeder", "pole"


@dataclass
class ContributingFactor:
    factor: str
    value: str
    weight: float

    def to_dict(self) -> dict:
        return {"factor": self.factor, "value": self.value, "weight": self.weight}


@dataclass
class RiskResult:
    risk_score: float
    risk_level: str
    contributing_factors: list

    def to_dict(self) -> dict:
        return {
            "risk_score": self.risk_score,
            "risk_level": self.risk_level,
            "contributing_factors": [f.to_dict() for f in self.contributing_factors],
        }


# ---------------------------------------------------------------------------
# Per-factor sub-score extraction. Each returns (sub_score in [0,1], label).
# Kept as small pure functions so each is independently testable/explainable.
# ---------------------------------------------------------------------------
def _score_oil_quality(sensors: SensorReading):
    if sensors.oil_quality_index is None:
        return 0.0, "unknown"
    idx = max(0.0, min(1.0, sensors.oil_quality_index))
    label = "degraded" if idx >= 0.6 else ("marginal" if idx >= 0.3 else "good")
    return idx, label


def _score_vibration(sensors: SensorReading):
    if sensors.vibration_mm_s is None or sensors.vibration_threshold_mm_s <= 0:
        return 0.0, "unknown"
    ratio = sensors.vibration_mm_s / sensors.vibration_threshold_mm_s
    sub_score = max(0.0, min(1.0, (ratio - 0.5) / 1.0))  # ramps up starting ~50% of threshold
    label = "above_threshold" if ratio >= 1.0 else ("elevated" if ratio >= 0.75 else "normal")
    return sub_score, label


def _score_temperature(sensors: SensorReading):
    if sensors.temperature_c is None or sensors.rated_max_temp_c <= 0:
        return 0.0, "unknown"
    ratio = sensors.temperature_c / sensors.rated_max_temp_c
    sub_score = max(0.0, min(1.0, (ratio - 0.6) / 0.5))
    label = "overheating" if ratio >= 1.0 else ("elevated" if ratio >= 0.85 else "normal")
    return sub_score, label


def _score_load_factor(sensors: SensorReading):
    if not sensors.load_kw or not sensors.rated_capacity_kw:
        return 0.0, "unknown"
    ratio = sensors.load_kw / sensors.rated_capacity_kw
    sub_score = max(0.0, min(1.0, (ratio - 0.7) / 0.4))
    label = "overloaded" if ratio >= 1.0 else ("high_load" if ratio >= 0.85 else "normal")
    return sub_score, label


def _score_weather(weather: WeatherForecast):
    sub_score = max(0.0, min(1.0, weather.storm_probability_72h))
    if weather.high_wind_expected:
        sub_score = min(1.0, sub_score + 0.2)
    if weather.flood_risk:
        sub_score = min(1.0, sub_score + 0.2)
    if sub_score >= 0.6:
        label = "storm_72h"
    elif sub_score >= 0.3:
        label = "unsettled_72h"
    else:
        label = "clear"
    return sub_score, label


def _score_incident_history(incidents: IncidentHistory):
    sub_score = min(1.0, incidents.incidents_last_12mo / 4.0)
    if incidents.last_incident_days_ago is not None and incidents.last_incident_days_ago <= 30:
        sub_score = min(1.0, sub_score + 0.25)
    label = f"{incidents.incidents_last_12mo}_incidents_12mo"
    return sub_score, label


_FACTOR_SCORERS = {
    "oil_quality": lambda s, w, i: _score_oil_quality(s),
    "vibration": lambda s, w, i: _score_vibration(s),
    "temperature": lambda s, w, i: _score_temperature(s),
    "load_factor": lambda s, w, i: _score_load_factor(s),
    "weather_forecast": lambda s, w, i: _score_weather(w),
    "incident_history": lambda s, w, i: _score_incident_history(i),
}


def compute_risk_score(
    sensors: SensorReading,
    weather: WeatherForecast,
    incidents: IncidentHistory,
) -> RiskResult:
    """
    Combine sensor readings + weather forecast + incident history into a
    single explainable risk score in [0, 1].

    Returns a RiskResult with risk_score, risk_level, and contributing_factors
    sorted by contribution weight (largest first) -- ready to serialize
    directly into the API response shape.
    """
    contributing_factors = []
    total = 0.0

    for factor_name, weight in RISK_WEIGHTS.items():
        sub_score, label = _FACTOR_SCORERS[factor_name](sensors, weather, incidents)
        contribution = round(weight * sub_score, 4)
        total += contribution
        if contribution >= CONTRIBUTION_THRESHOLD:
            contributing_factors.append(
                ContributingFactor(factor=factor_name, value=label, weight=round(contribution, 2))
            )

    risk_score = round(min(1.0, total), 2)

    if risk_score >= HIGH_RISK_THRESHOLD:
        risk_level = "high"
    elif risk_score >= MEDIUM_RISK_THRESHOLD:
        risk_level = "medium"
    else:
        risk_level = "low"

    contributing_factors.sort(key=lambda f: f.weight, reverse=True)

    return RiskResult(risk_score=risk_score, risk_level=risk_level, contributing_factors=contributing_factors)


if __name__ == "__main__":
    # Quick manual sanity check
    result = compute_risk_score(
        sensors=SensorReading(oil_quality_index=0.8, vibration_mm_s=5.5, temperature_c=70),
        weather=WeatherForecast(storm_probability_72h=0.75, high_wind_expected=True),
        incidents=IncidentHistory(incidents_last_12mo=2, last_incident_days_ago=20),
    )
    import json
    print(json.dumps(result.to_dict(), indent=2))