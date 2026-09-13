"""
Owner: Person 3

Quick manual test — run this to verify bob_integration works end-to-end
before anyone else's real code is plugged in.

Run from src/backend/:
    python -m bob_integration.test_bob_integration
"""

from bob_integration.reasoning_engine import explain_risk, compare_assets
from bob_integration.maintenance_plan_generator import generate_plan

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

# Minimal asset missing most optional fields -- simulates real data from
# Person 1's pipeline before every field is guaranteed populated.
SPARSE_ASSET = {
    "asset_id": "SW-901",
    "asset_type": "switchgear",
}

if __name__ == "__main__":
    print("=" * 60)
    print("TEST 1: explain_risk for a single asset")
    print("=" * 60)
    print(explain_risk(MOCK_ASSETS[0]))

    print("\n" + "=" * 60)
    print("TEST 2: compare_assets")
    print("=" * 60)
    print(compare_assets(MOCK_ASSETS[0], MOCK_ASSETS[1]))

    print("\n" + "=" * 60)
    print("TEST 3: generate_plan for full ranked list")
    print("=" * 60)
    plan = generate_plan(MOCK_ASSETS, weather_forecast={"storm_expected_hours": 72})
    import json
    print(json.dumps(plan, indent=2))

    print("\n" + "=" * 60)
    print("TEST 4 (edge case): generate_plan with an EMPTY list")
    print("=" * 60)
    print(json.dumps(generate_plan([]), indent=2))

    print("\n" + "=" * 60)
    print("TEST 5 (edge case): explain_risk on a SPARSE asset (missing fields)")
    print("=" * 60)
    print(explain_risk(SPARSE_ASSET))

    print("\n" + "=" * 60)
    print("TEST 6 (edge case): generate_plan with a SPARSE asset in the list")
    print("=" * 60)
    print(json.dumps(generate_plan([SPARSE_ASSET]), indent=2))
