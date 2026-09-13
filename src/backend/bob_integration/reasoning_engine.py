"""
Owner: Person 3

Turns a scored asset (from the risk model) into a natural-language
explanation, and supports live follow-up questions during the demo.
"""

from .bob_client import ask_bob


def _safe(value, fallback="unknown"):
    """Render a possibly-missing field for display without leaking Python's None."""
    return fallback if value is None else value


def explain_risk(asset: dict) -> str:
    """
    Given a scored asset dict (see shape below), return a natural-language
    explanation of why it's high risk.

    Expected asset shape:
    {
      "asset_id": "TX-104",
      "location": {"lat": 22.56, "lon": 72.93, "name": "Anand Substation 4"},
      "asset_type": "transformer",
      "risk_score": 0.87,
      "risk_level": "high",
      "contributing_factors": [
        {"factor": "oil_quality", "value": "degraded", "weight": 0.4},
        {"factor": "vibration", "value": "above_threshold", "weight": 0.3},
        {"factor": "weather_forecast", "value": "storm_72h", "weight": 0.3}
      ],
      "predicted_days_to_failure": 9,
      "customers_affected_estimate": 4200
    }
    """
    asset_name = asset.get("location", {}).get("name", asset.get("asset_id", "Unknown asset"))
    factors = asset.get("contributing_factors", [])
    factor_lines = "\n".join(
        f"- {f.get('factor')}: {f.get('value')} (weight {f.get('weight')})" for f in factors
    )

    prompt = (
        f"Asset: {asset_name}\n"
        f"Risk score: {_safe(asset.get('risk_score'))}\n"
        f"Predicted days to failure: {_safe(asset.get('predicted_days_to_failure'))}\n"
        f"Customers affected if it fails: {_safe(asset.get('customers_affected_estimate'))}\n"
        f"Contributing factors:\n{factor_lines or '- none reported'}\n\n"
        f"Explain in 2-3 sentences, in plain language for a grid operations manager, "
        f"why this asset is high priority and what could happen if it's not addressed soon."
    )

    return ask_bob(prompt, context=asset)


def answer_followup(question: str, context: dict) -> str:
    """
    Answer a free-form follow-up question during the live demo, using the
    current risk context (a single asset, or a list of ranked assets).

    `context` can be a single asset dict OR a dict like:
    {"ranked_assets": [asset1, asset2, ...]}
    """
    prompt = f"Question: {question}\n\nUse the following data to answer concisely:\n{context}"
    return ask_bob(prompt, context=context)


def compare_assets(asset_a: dict, asset_b: dict) -> str:
    """
    Convenience helper for the common demo question:
    'Why is Asset A higher priority than Asset B?'
    """
    name_a = asset_a.get("location", {}).get("name", asset_a.get("asset_id"))
    name_b = asset_b.get("location", {}).get("name", asset_b.get("asset_id"))

    prompt = (
        f"Compare these two grid assets and explain in 2-3 sentences why one is "
        f"higher priority than the other:\n\n"
        f"{name_a}: risk_score={asset_a.get('risk_score')}, "
        f"factors={asset_a.get('contributing_factors')}\n\n"
        f"{name_b}: risk_score={asset_b.get('risk_score')}, "
        f"factors={asset_b.get('contributing_factors')}"
    )

    return ask_bob(prompt, context={"asset_a": asset_a, "asset_b": asset_b})
