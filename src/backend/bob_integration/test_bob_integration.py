"""
Bob integration tests — importable by pytest and runnable as a script.

Run as pytest (from repo root):
    pytest src/backend/bob_integration/test_bob_integration.py -v

Run as a script (from src/backend/):
    python -m bob_integration.test_bob_integration
"""

import json
import sys
import os

# Allow direct script invocation from src/backend/
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', '..'))

from src.backend.bob_integration.reasoning_engine import explain_risk, compare_assets
from src.backend.bob_integration.maintenance_plan_generator import generate_plan

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------
MOCK_ASSETS = [
    {
        "asset_id": "TX-104",
        "location": {"lat": 22.56, "lon": 72.93, "name": "Anand Substation 4"},
        "asset_type": "transformer",
        "risk_score": 0.87,
        "risk_level": "high",
        "contributing_factors": [
            {"factor": "oil_quality", "value": "degraded", "weight": 0.4},
            {"factor": "vibration", "value": "above_threshold", "weight": 0.3},
            {"factor": "weather_forecast", "value": "storm_72h", "weight": 0.3},
        ],
        "predicted_days_to_failure": 9,
        "customers_affected_estimate": 4200,
    },
    {
        "asset_id": "TX-207",
        "location": {"lat": 22.60, "lon": 72.88, "name": "Petlad Substation 7"},
        "asset_type": "transformer",
        "risk_score": 0.52,
        "risk_level": "medium",
        "contributing_factors": [
            {"factor": "temperature", "value": "elevated", "weight": 0.6},
            {"factor": "vibration", "value": "normal", "weight": 0.1},
        ],
        "predicted_days_to_failure": 21,
        "customers_affected_estimate": 1800,
    },
]

# Minimal asset missing most optional fields — simulates real data from
# a pipeline before every field is guaranteed populated.
SPARSE_ASSET = {
    "asset_id": "SW-901",
    "asset_type": "switchgear",
}


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

def test_explain_risk_returns_string():
    result = explain_risk(MOCK_ASSETS[0])
    assert isinstance(result, str)
    assert len(result) > 10, "explanation should be non-trivial"


def test_explain_risk_sparse_asset():
    """explain_risk must not raise for a minimally-populated asset."""
    result = explain_risk(SPARSE_ASSET)
    assert isinstance(result, str)


def test_compare_assets_returns_string():
    result = compare_assets(MOCK_ASSETS[0], MOCK_ASSETS[1])
    assert isinstance(result, str)
    assert len(result) > 10


def test_generate_plan_structure():
    plan = generate_plan(MOCK_ASSETS, weather_forecast={"storm_expected_hours": 72})
    assert isinstance(plan, dict), "generate_plan must return a dict"
    assert "summary" in plan
    assert "plan" in plan
    assert isinstance(plan["plan"], list)
    assert len(plan["plan"]) > 0


def test_generate_plan_asset_ids_are_valid():
    plan = generate_plan(MOCK_ASSETS)
    valid_ids = {a["asset_id"] for a in MOCK_ASSETS}
    for step in plan["plan"]:
        assert step["asset_id"] in valid_ids, (
            f"Plan contains invented asset_id: {step['asset_id']}"
        )


def test_generate_plan_empty_list():
    plan = generate_plan([])
    assert plan["plan"] == []
    assert isinstance(plan["summary"], str)


def test_generate_plan_sparse_asset():
    """generate_plan must not raise for an asset missing optional fields."""
    plan = generate_plan([SPARSE_ASSET])
    assert isinstance(plan, dict)
    assert "plan" in plan


# ---------------------------------------------------------------------------
# Script entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    import pytest
    sys.exit(pytest.main([__file__, "-v"]))
