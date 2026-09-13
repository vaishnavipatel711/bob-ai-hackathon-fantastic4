"""
failure_predictor.py

Predicts a rough "days to failure" window for high-risk assets.

Explainability note: this is a simple, transparent heuristic on top of the
risk score and contributing factors from risk_scoring_model.py -- not a
separate black-box model. It maps:

  base_lifespan_days(asset_type)  ->  scaled down by risk_score
                                   ->  nudged further by "urgency" factors
                                       (e.g. an imminent storm accelerates
                                       failure independent of raw risk).

This keeps the reasoning inspectable: every adjustment is a named,
commented step, so it can be explained the same way risk_score is.
"""

from typing import Iterable, Optional

# Typical operating "runway" (days) for a healthy asset of this type before
# a failure would be expected under sustained stress at risk_score -> 1.0.
# These are rough hackathon-grade priors, easy to tune.
BASE_LIFESPAN_DAYS = {
    "transformer": 60,
    "substation": 90,
    "feeder": 45,
    "pole": 120,
    "switchgear": 50,
    "line": 75,
}
DEFAULT_BASE_LIFESPAN_DAYS = 60

MIN_DAYS_TO_FAILURE = 1
MAX_DAYS_TO_FAILURE = 180

# Factors that indicate an acute, near-term trigger (as opposed to slow
# degradation) shave additional days off the estimate when present.
URGENCY_FACTORS = {
    "weather_forecast": 0.5,   # storm imminent -> can precipitate failure fast
    "vibration": 0.3,          # active mechanical stress
    "temperature": 0.3,        # active thermal stress
}


def predict_days_to_failure(
    risk_score: float,
    asset_type: str,
    contributing_factors: Optional[Iterable[dict]] = None,
) -> int:
    """
    Estimate days until failure, given a risk_score in [0, 1] and the
    asset's contributing_factors (as produced by risk_scoring_model).

    Lower risk_score -> longer runway. High urgency factors (storm,
    active vibration/thermal stress) compress the window further.
    """
    risk_score = max(0.0, min(1.0, risk_score))
    base_days = BASE_LIFESPAN_DAYS.get(asset_type, DEFAULT_BASE_LIFESPAN_DAYS)

    # Core relationship: linear decay of remaining runway as risk climbs.
    # At risk_score = 0 -> full base_days. At risk_score = 1 -> near-minimum.
    days = base_days * (1.0 - 0.9 * risk_score)

    # Apply urgency adjustment: for each present high-weight urgency factor,
    # compress the estimate proportionally to how strongly it contributed.
    if contributing_factors:
        urgency_pressure = 0.0
        for factor in contributing_factors:
            name = factor.get("factor") if isinstance(factor, dict) else getattr(factor, "factor", None)
            weight = factor.get("weight") if isinstance(factor, dict) else getattr(factor, "weight", 0.0)
            if name in URGENCY_FACTORS and weight:
                urgency_pressure += weight * URGENCY_FACTORS[name]
        days *= max(0.4, 1.0 - urgency_pressure)  # never compress below 40% of base estimate

    days = max(MIN_DAYS_TO_FAILURE, min(MAX_DAYS_TO_FAILURE, round(days)))
    return int(days)


if __name__ == "__main__":
    factors = [
        {"factor": "oil_quality", "value": "degraded", "weight": 0.25},
        {"factor": "vibration", "value": "above_threshold", "weight": 0.20},
        {"factor": "weather_forecast", "value": "storm_72h", "weight": 0.15},
    ]
    print(predict_days_to_failure(0.87, "transformer", factors))