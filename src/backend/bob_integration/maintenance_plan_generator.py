"""
Owner: Person 3

Generates a prioritized maintenance & crew pre-positioning plan across all
at-risk assets, and formats it to match the exact shape the frontend expects.
"""

from bob_integration.bob_client import ask_bob
from bob_integration.reasoning_engine import explain_risk, _safe


def generate_plan(ranked_assets: list, weather_forecast: dict = None) -> dict:
    """
    Given a list of ranked/scored assets (highest priority first), generate
    a full maintenance plan.

    Returns:
    {
      "plan": [
        {
          "asset_id": "TX-104",
          "explanation": "...",
          "plan_step": {
            "priority_rank": 1,
            "action": "...",
            "eta_hours": 24
          }
        },
        ...
      ],
      "summary": "..."
    }
    """
    if not ranked_assets:
        return {
            "plan": [],
            "summary": "No assets are currently flagged as at-risk. Grid is nominal.",
        }

    plan_items = []

    for rank, asset in enumerate(ranked_assets, start=1):
        explanation = explain_risk(asset)
        action = _generate_action(asset, rank)
        eta_hours = _eta_from_days(asset.get("predicted_days_to_failure"))

        plan_items.append({
            "asset_id": asset.get("asset_id"),
            "explanation": explanation,
            "plan_step": {
                "priority_rank": rank,
                "action": action,
                "eta_hours": eta_hours,
            },
        })

    summary = _generate_summary(ranked_assets, weather_forecast)

    return {
        "plan": plan_items,
        "summary": summary,
    }


def _generate_action(asset: dict, rank: int) -> str:
    asset_name = asset.get("location", {}).get("name", asset.get("asset_id", "Unknown asset"))
    prompt = (
        f"Asset: {asset_name}, priority rank {rank}, "
        f"risk_score={_safe(asset.get('risk_score'))}, "
        f"predicted_days_to_failure={_safe(asset.get('predicted_days_to_failure'))}, "
        f"customers_affected={_safe(asset.get('customers_affected_estimate'))}.\n\n"
        f"Write one concise, concrete crew action (inspection, repair dispatch, "
        f"or crew pre-positioning) an operations manager should take for this asset, "
        f"in one sentence."
    )
    return ask_bob(prompt, context=asset)


def _eta_from_days(days_to_failure) -> int:
    """Convert predicted days-to-failure into a recommended response window in hours."""
    if days_to_failure is None:
        return 72
    if days_to_failure <= 3:
        return 12
    if days_to_failure <= 7:
        return 24
    if days_to_failure <= 14:
        return 48
    return 72


def _generate_summary(ranked_assets: list, weather_forecast: dict = None) -> str:
    top_assets = ranked_assets[:3]
    names = ", ".join(
        a.get("location", {}).get("name", a.get("asset_id", "Unknown")) for a in top_assets
    )
    weather_note = f" Weather context: {weather_forecast}." if weather_forecast else ""

    prompt = (
        f"Write a 2-3 sentence executive summary for a grid operations manager, "
        f"covering the top priority assets ({names}) out of {len(ranked_assets)} "
        f"total flagged assets.{weather_note} "
        f"Keep it action-oriented and suitable for a live briefing."
    )
    return ask_bob(prompt, context={"ranked_assets": ranked_assets, "weather": weather_forecast})
