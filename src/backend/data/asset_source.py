"""
asset_source.py

The single source of truth for "asset" data consumed by the API layer
(src/backend/api/routes.py) and, downstream, the frontend + Bob
integration.

Responsibilities:
1. Generate a fixed set of ~15-20 synthetic grid assets across Gujarat,
   with realistic asset_type distribution and lat/lon/name.
2. For each asset, generate correlated SensorReading / WeatherForecast /
   IncidentHistory data (via sensor_data_generator, weather_client,
   incident_history_loader), injecting "failure signature" patterns into
   ~15-20% of assets.
3. Run each asset through risk_scoring_model.compute_risk_score(...) to
   get (risk_score, risk_level, contributing_factors).
4. Derive predicted_days_to_failure (via failure_predictor.py if it
   exposes a usable function, else a documented fallback formula) and
   customers_affected_estimate (per asset type).
5. Cache the fully-assembled asset list ONCE at import time, so risk
   scores / derived fields stay stable for the lifetime of the process
   (i.e. for a single demo run). Restarting the server reshuffles which
   assets are "failure signature" assets (unless you fix ASSET_SEED).
6. Expose get_all_assets() and get_asset_by_id(asset_id) in the exact
   dict shape the frontend/Bob integration expects.

NOTE ON risk_scoring_model / failure_predictor INTERFACES:
This file was written from the description of compute_risk_score's
expected inputs/outputs (sensors, weather, incidents) -> (risk_score,
risk_level, contributing_factors), and an *assumed* optional
failure_predictor.py exposing a days-to-failure helper. Both integration
points are wrapped defensively (see `_score_asset` and
`_predicted_days_to_failure`) so that if your teammate's actual function
signature or return shape differs slightly (e.g. dict vs dataclass vs
tuple), you only need to adjust the small extraction block noted below
with "ADJUST HERE" rather than rewrite this file.
"""

from __future__ import annotations

import random
from typing import Optional

from .sensor_data_generator import generate_sensor_reading
from .weather_client import get_weather_forecast
from .incident_history_loader import get_incident_history

# ---------------------------------------------------------------------------
# risk_scoring_model import
# ---------------------------------------------------------------------------
from ..models.risk_scoring_model import compute_risk_score

# ---------------------------------------------------------------------------
# Optional failure_predictor import (may not exist yet / may not expose the
# function we expect -- handled defensively below).
# ---------------------------------------------------------------------------
try:
    from ..models import failure_predictor as _failure_predictor
except ImportError:
    _failure_predictor = None


# A fixed seed so the *set of assets* (ids, locations, which ones are
# failure-signature) is stable across process restarts, which is nice for
# demo reproducibility. Change this if you want a different fixed demo set.
ASSET_SEED = "u1-hackathon-demo"

# Fraction of assets that get an injected "failure signature".
FAILURE_SIGNATURE_FRACTION = 0.18  # ~18%, within the requested 15-20%.

# Rough per-type customer impact ranges (illustrative, not real utility data).
_CUSTOMERS_AFFECTED_RANGES = {
    "substation": (3000, 9000),
    "transformer": (400, 4500),
    "switchgear": (200, 2500),
    "feeder": (150, 1800),
    "line": (50, 1200),
    "pole": (5, 150),
}

# Gujarat-area locations to draw from for realistic names/coords.
# (lat, lon, area name) -- coords are approximate town/city centers.
_GUJARAT_AREAS = [
    (22.5645, 72.9289, "Anand"),
    (22.3072, 73.1812, "Vadodara"),
    (23.0225, 72.5714, "Ahmedabad"),
    (21.1702, 72.8311, "Surat"),
    (22.4707, 70.0577, "Rajkot"),
    (23.2156, 72.6369, "Gandhinagar"),
    (22.9931, 70.4109, "Morbi"),
    (21.6417, 69.6293, "Junagadh"),
    (23.6238, 72.3693, "Mehsana"),
    (22.7196, 71.6369, "Botad"),
    (22.3039, 70.8022, "Jamnagar edge"),
    (21.7645, 72.1519, "Bharuch"),
]

_ASSET_TYPES = [
    "substation",
    "transformer",
    "switchgear",
    "feeder",
    "line",
    "pole",
]

# How many of each type to roughly generate out of ~15-20 total assets.
# (type, count)
_TYPE_PLAN = [
    ("substation", 3),
    ("transformer", 5),
    ("switchgear", 3),
    ("feeder", 3),
    ("line", 2),
    ("pole", 2),
]  # 18 assets total


def _build_asset_shells() -> list[dict]:
    """
    Build the static identity/location part of each asset (before any
    sensor/weather/risk data is attached): asset_id, location, asset_type.
    """
    rng = random.Random(ASSET_SEED)
    areas = list(_GUJARAT_AREAS)
    rng.shuffle(areas)

    shells = []
    type_counters = {t: 0 for t in _ASSET_TYPES}
    idx = 0
    for asset_type, count in _TYPE_PLAN:
        for _ in range(count):
            area_lat, area_lon, area_name = areas[idx % len(areas)]
            idx += 1
            type_counters[asset_type] += 1

            # Jitter coordinates a little so assets of the same area
            # don't all sit on the exact same point.
            lat = round(area_lat + rng.uniform(-0.06, 0.06), 4)
            lon = round(area_lon + rng.uniform(-0.06, 0.06), 4)

            prefix = {
                "substation": "SS",
                "transformer": "TX",
                "switchgear": "SW",
                "feeder": "FD",
                "line": "LN",
                "pole": "PL",
            }[asset_type]
            asset_id = f"{prefix}-{100 + type_counters[asset_type]}"

            display_name = (
                f"{area_name} {asset_type.capitalize()} "
                f"{type_counters[asset_type]}"
            )

            shells.append(
                {
                    "asset_id": asset_id,
                    "location": {
                        "lat": lat,
                        "lon": lon,
                        "name": display_name,
                    },
                    "asset_type": asset_type,
                }
            )
    return shells


def _pick_failure_signature_ids(asset_ids: list[str]) -> set[str]:
    """Deterministically choose ~15-20% of asset_ids as failure-signature."""
    rng = random.Random(f"{ASSET_SEED}::failure-signature")
    n = max(1, round(len(asset_ids) * FAILURE_SIGNATURE_FRACTION))
    return set(rng.sample(asset_ids, n))


def _score_asset(sensors, weather, incidents):
    """
    Call risk_scoring_model.compute_risk_score and normalize its return
    value into (risk_score: float, risk_level: str, contributing_factors: list).

    ADJUST HERE if your teammate's actual return shape differs. This
    handles the most likely shapes:
      - an object/dataclass with .risk_score / .risk_level / .contributing_factors
      - a dict with those same keys
      - a 3-tuple (risk_score, risk_level, contributing_factors)
    """
    result = compute_risk_score(sensors, weather, incidents)

    if isinstance(result, dict):
        return (
            result["risk_score"],
            result["risk_level"],
            result.get("contributing_factors", []),
        )
    if isinstance(result, (tuple, list)) and len(result) == 3:
        return result[0], result[1], result[2]
    # Fall back to attribute access (dataclass / namedtuple / plain object).
    raw_factors = list(getattr(result, "contributing_factors", []))
    factors = [
        f.to_dict() if hasattr(f, "to_dict") else f
        for f in raw_factors
    ]
    return (
        getattr(result, "risk_score"),
        getattr(result, "risk_level"),
        factors,
    )


def _fallback_predicted_days_to_failure(risk_score: float) -> int:
    """
    Fallback formula if failure_predictor.py isn't available or doesn't
    expose a usable function: higher risk -> fewer days to failure.

    risk_score 1.0  -> ~3 days
    risk_score 0.5  -> ~60 days
    risk_score 0.0  -> ~365 days (effectively "not predicted soon")
    Curve is intentionally non-linear (steeper near high risk) since
    that's the operationally interesting range for a demo.
    """
    risk_score = max(0.0, min(1.0, risk_score))
    days = 3 + (1 - risk_score) ** 2 * 362
    return max(1, round(days))


def _predicted_days_to_failure(risk_score: float, asset_id: str) -> int:
    """
    Use failure_predictor.py if it exposes a recognizable function;
    otherwise fall back to `_fallback_predicted_days_to_failure`.

    ADJUST HERE once failure_predictor.py's real function name/signature
    is known -- try the common candidate names below, and add yours if
    different.
    """
    if _failure_predictor is not None:
        for fn_name in (
            "predict_days_to_failure",
            "predicted_days_to_failure",
            "days_to_failure",
        ):
            fn = getattr(_failure_predictor, fn_name, None)
            if callable(fn):
                try:
                    return int(fn(risk_score))
                except TypeError:
                    # Some signatures might want (asset_id, risk_score).
                    try:
                        return int(fn(asset_id, risk_score))
                    except Exception:
                        pass
    return _fallback_predicted_days_to_failure(risk_score)


def _customers_affected_estimate(asset_type: str, asset_id: str, risk_score: float) -> int:
    """
    Plausible customer-impact estimate per asset type. Higher-risk assets
    get a slight upward nudge within their type's range, since a failing
    higher-criticality-feeling asset makes for a more compelling demo
    number (this is illustrative, not a load-flow calculation).
    """
    rng = random.Random(f"{ASSET_SEED}::customers::{asset_id}")
    lo, hi = _CUSTOMERS_AFFECTED_RANGES.get(asset_type, (100, 1000))
    base = rng.uniform(lo, hi)
    nudge = 1.0 + 0.15 * risk_score
    return max(1, round(base * nudge))


def _build_all_assets() -> list[dict]:
    shells = _build_asset_shells()
    asset_ids = [s["asset_id"] for s in shells]
    failure_signature_ids = _pick_failure_signature_ids(asset_ids)

    assets = []
    for shell in shells:
        asset_id = shell["asset_id"]
        asset_type = shell["asset_type"]
        lat = shell["location"]["lat"]
        lon = shell["location"]["lon"]
        is_failure_signature = asset_id in failure_signature_ids

        sensors = generate_sensor_reading(
            asset_id, asset_type, failure_signature=is_failure_signature
        )
        weather = get_weather_forecast(
            asset_id, lat, lon, failure_signature=is_failure_signature
        )
        incidents = get_incident_history(
            asset_id, failure_signature=is_failure_signature
        )

        risk_score, risk_level, contributing_factors = _score_asset(
            sensors, weather, incidents
        )

        predicted_days = _predicted_days_to_failure(risk_score, asset_id)
        customers_affected = _customers_affected_estimate(
            asset_type, asset_id, risk_score
        )

        assets.append(
            {
                "asset_id": asset_id,
                "location": shell["location"],
                "asset_type": asset_type,
                "risk_score": round(float(risk_score), 3),
                "risk_level": risk_level,
                "contributing_factors": contributing_factors,
                "predicted_days_to_failure": predicted_days,
                "customers_affected_estimate": customers_affected,
            }
        )

    return assets


# ---------------------------------------------------------------------------
# Module-level cache: generated ONCE at import time.
# ---------------------------------------------------------------------------
_ALL_ASSETS: list[dict] = _build_all_assets()
_ASSETS_BY_ID: dict[str, dict] = {a["asset_id"]: a for a in _ALL_ASSETS}


def get_all_assets() -> list[dict]:
    """Return all assets (list of dicts in the shared API shape)."""
    return _ALL_ASSETS


def get_asset_by_id(asset_id: str) -> Optional[dict]:
    """Return a single asset dict by id, or None if not found."""
    return _ASSETS_BY_ID.get(asset_id)