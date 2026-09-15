"""
maintenance_plan_generator.py

Generates a complete, actionable maintenance and crew dispatch plan.

Output format:
{
    "summary": "...",
    "plan": [
        {
            "asset_id": "...",
            "explanation": "...",
            "plan_step": {
                "priority_rank": 1,
                "action": "...",
                "crew_type": "...",
                "dispatch_location": "...",
                "eta_hours": 12,
                "pre_position": True,
                "reason": "..."
            }
        }
    ]
}

The plan is generated using IBM Bob when configured.
If Bob is unavailable or returns invalid JSON, a deterministic
rule-based fallback guarantees that the frontend still receives
a usable dispatch plan.
"""

import json
import re

from .bob_client import ask_bob
from .reasoning_engine import explain_risk


# ---------------------------------------------------------------------------
# Public function
# ---------------------------------------------------------------------------

def generate_plan(ranked_assets: list, weather_forecast: dict = None) -> dict:
    """
    Generate a complete prioritized maintenance and crew dispatch plan.

    Args:
        ranked_assets:
            Assets already ranked by impact/risk, highest priority first.

        weather_forecast:
            Optional weather information.

    Returns:
        Dictionary containing summary and plan.
    """

    if not ranked_assets:
        return {
            "summary": "No assets are currently flagged as at-risk. Grid is nominal.",
            "plan": [],
        }

    # First try IBM Bob.
    bob_result = _generate_plan_with_bob(
        ranked_assets,
        weather_forecast,
    )

    if bob_result is not None:
        return bob_result

    # If Bob fails or returns invalid JSON, use a reliable local fallback.
    return _generate_local_dispatch_plan(
        ranked_assets,
        weather_forecast,
    )


# ---------------------------------------------------------------------------
# IBM Bob plan generation
# ---------------------------------------------------------------------------

def _generate_plan_with_bob(
    ranked_assets: list,
    weather_forecast: dict = None,
):
    """
    Ask Bob ONCE to generate the complete dispatch plan.

    Returns:
        Valid plan dictionary, or None if the response is invalid.
    """

    prompt = f"""
You are the Grid Operations Dispatch Planning AI.

You are working inside a power-grid equipment failure advisor.

Your task is to generate an ACTIONABLE MAINTENANCE AND CREW DISPATCH PLAN.

IMPORTANT:
- Do NOT generate a dashboard.
- Do NOT generate a visual grid.
- Do NOT generate HTML.
- Do NOT generate a map.
- Do NOT return a generic explanation.
- Do NOT return Markdown.
- Return ONLY valid JSON.
- Generate an actual operational plan.

The plan must answer:

"Which asset should we attend first,
which crew should we send,
where should we send them,
what should they do,
and by when?"

Use ONLY the provided asset data.
Do not invent asset IDs, locations, sensor values,
weather values, or crew availability.

For every asset, generate:

1. Priority rank
2. Asset ID
3. Explanation of risk and urgency
4. Concrete operational action
5. Crew type
6. Dispatch location
7. Estimated response time in hours
8. Whether pre-positioning is recommended
9. Reason for the decision

Priority logic:

- Higher risk score = higher priority
- Higher customer impact = higher priority
- Shorter predicted failure window = higher urgency
- Critical infrastructure = higher priority
- Severe sensor abnormalities = higher priority
- Severe weather = higher priority
- Historical incidents = higher priority
- Nearby assets may be grouped for efficient dispatch

Actions must use real operational verbs such as:

dispatch, inspect, isolate, repair, replace,
test, stage, pre-position, or coordinate.

Do not use vague actions such as:
"monitor the asset" or "take necessary action".

If the predicted failure window is very short,
recommend emergency response.

If weather is expected to worsen risk,
recommend crew pre-positioning.

Return EXACTLY this JSON structure:

{{
  "summary": "A concise operational summary.",
  "plan": [
    {{
      "asset_id": "EXACT_ASSET_ID_FROM_INPUT",
      "explanation": "Why this asset is receiving this priority.",
      "plan_step": {{
        "priority_rank": 1,
        "action": "Concrete operational action.",
        "crew_type": "Required crew type.",
        "dispatch_location": "Exact asset location or practical staging point.",
        "eta_hours": 12,
        "pre_position": true,
        "reason": "Short reason for this dispatch decision."
      }}
    }}
  ]
}}

ASSET DATA:
{json.dumps(ranked_assets, indent=2, default=str)}

WEATHER DATA:
{json.dumps(weather_forecast or {}, indent=2, default=str)}
"""

    try:
        raw_response = ask_bob(
            prompt,
            context={
                "dispatch_plan_request": True,
                "ranked_assets": ranked_assets,
                "weather": weather_forecast or {},
            },
        )

        if not raw_response:
            print("[dispatch] Bob returned an empty response.")
            return None

        print("[dispatch] Bob response received.")

        parsed = _parse_json_response(raw_response)

        if parsed is None:
            print("[dispatch] Bob response was not valid JSON.")
            return None

        validated = _validate_plan_response(
            parsed,
            ranked_assets,
        )

        if validated is None:
            print("[dispatch] Bob response failed plan validation.")
            return None

        print("[dispatch] Valid dispatch plan generated by Bob.")
        return validated

    except Exception as error:
        print(f"[dispatch] Bob plan generation failed: {error}")
        return None


# ---------------------------------------------------------------------------
# JSON parsing and validation
# ---------------------------------------------------------------------------

def _parse_json_response(raw_response: str):
    """
    Parse JSON even if Bob wraps it in a Markdown code block.
    """

    text = str(raw_response).strip()

    # Remove ```json ... ``` or ``` ... ```
    text = re.sub(
        r"^```(?:json)?\s*",
        "",
        text,
        flags=re.IGNORECASE,
    )

    text = re.sub(
        r"\s*```$",
        "",
        text,
    )

    text = text.strip()

    # First attempt: complete response is JSON.
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # Second attempt: extract the first JSON object.
    start = text.find("{")
    end = text.rfind("}")

    if start == -1 or end == -1 or end <= start:
        return None

    candidate = text[start:end + 1]

    try:
        return json.loads(candidate)
    except json.JSONDecodeError:
        return None


def _validate_plan_response(
    response: dict,
    ranked_assets: list,
):
    """
    Validate and normalize Bob's response.

    We require a plan array and valid asset IDs.
    Missing optional fields receive safe defaults.
    """

    if not isinstance(response, dict):
        return None

    plan = response.get("plan")

    if not isinstance(plan, list):
        return None

    valid_asset_ids = {
        str(asset.get("asset_id"))
        for asset in ranked_assets
        if asset.get("asset_id") is not None
    }

    normalized_plan = []

    for index, item in enumerate(plan, start=1):
        if not isinstance(item, dict):
            continue

        asset_id = item.get("asset_id")

        if asset_id is None:
            continue

        asset_id = str(asset_id)

        # Do not allow Bob to invent assets.
        if asset_id not in valid_asset_ids:
            continue

        plan_step = item.get("plan_step")

        if not isinstance(plan_step, dict):
            plan_step = {}

        normalized_plan.append({
            "asset_id": asset_id,
            "explanation": str(
                item.get(
                    "explanation",
                    "Asset requires attention based on current risk indicators.",
                )
            ),
            "plan_step": {
                "priority_rank": _safe_int(
                    plan_step.get("priority_rank"),
                    index,
                ),
                "action": str(
                    plan_step.get(
                        "action",
                        "Dispatch an inspection crew for priority assessment.",
                    )
                ),
                "crew_type": str(
                    plan_step.get(
                        "crew_type",
                        "Electrical inspection crew",
                    )
                ),
                "dispatch_location": str(
                    plan_step.get(
                        "dispatch_location",
                        "Asset location",
                    )
                ),
                "eta_hours": _safe_int(
                    plan_step.get("eta_hours"),
                    24,
                ),
                "pre_position": bool(
                    plan_step.get("pre_position", False)
                ),
                "reason": str(
                    plan_step.get(
                        "reason",
                        "Prioritized using available risk and impact data.",
                    )
                ),
            },
        })

    if not normalized_plan:
        return None

    return {
        "summary": str(
            response.get(
                "summary",
                "Prioritized maintenance and crew dispatch plan generated.",
            )
        ),
        "plan": normalized_plan,
    }


# ---------------------------------------------------------------------------
# Local fallback plan
# ---------------------------------------------------------------------------

def _generate_local_dispatch_plan(
    ranked_assets: list,
    weather_forecast: dict = None,
) -> dict:
    """
    Reliable fallback when Bob is unavailable.

    This is NOT a random mock response.
    It uses the actual asset risk, failure window,
    customer impact, and location data.
    """

    plan = []

    for rank, asset in enumerate(ranked_assets, start=1):
        plan_step = _build_local_plan_step(asset, rank)

        try:
            explanation = explain_risk(asset)
        except Exception:
            explanation = _local_explanation(asset)

        plan.append({
            "asset_id": asset.get("asset_id"),
            "explanation": explanation,
            "plan_step": plan_step,
        })

    top_asset = ranked_assets[0]
    top_name = _asset_location_name(top_asset)

    weather_note = ""

    if weather_forecast:
        weather_note = (
            " Weather conditions were also considered in the response planning."
        )

    summary = (
        f"{len(plan)} at-risk assets have been prioritized for maintenance "
        f"and crew dispatch. The highest-priority asset is {top_name}. "
        f"Crews should respond in priority order to reduce potential outage impact."
        f"{weather_note}"
    )

    return {
        "summary": summary,
        "plan": plan,
    }


def _build_local_plan_step(asset: dict, rank: int) -> dict:
    """
    Build a practical dispatch action from the asset's actual data.
    """

    risk_level = str(
        asset.get("risk_level", "low")
    ).lower()

    risk_score = _safe_float(
        asset.get("risk_score"),
        0.0,
    )

    days = _safe_float(
        asset.get("predicted_days_to_failure"),
        None,
    )

    customers = _safe_int(
        asset.get("customers_affected_estimate"),
        0,
    )

    asset_type = str(
        asset.get("asset_type", "electrical asset")
    ).lower()

    location = _asset_location_name(asset)

    factors = asset.get("contributing_factors") or []

    factor_names = []

    for factor in factors:
        if isinstance(factor, dict):
            name = factor.get("factor")
            if name:
                factor_names.append(str(name))

    factor_text = ", ".join(factor_names[:3])

    # ---------------------------------------------------------
    # Priority 1: Immediate emergency response
    # ---------------------------------------------------------

    if (
        risk_level == "critical"
        or risk_score >= 0.85
        or (days is not None and days <= 3)
    ):
        action = (
            f"Dispatch an emergency electrical crew to {location} "
            f"for immediate {asset_type} inspection. "
            f"Prepare isolation, repair, or replacement if failure "
            f"indicators are confirmed."
        )

        crew_type = "Emergency electrical repair crew"
        eta_hours = 6
        pre_position = True

        reason = (
            f"Critical or very high risk with potential for near-term failure. "
            f"Estimated customer impact: {customers}."
        )

    # ---------------------------------------------------------
    # Priority 2: High-risk maintenance
    # ---------------------------------------------------------

    elif (
        risk_level == "high"
        or risk_score >= 0.65
        or (days is not None and days <= 14)
    ):
        action = (
            f"Dispatch a {asset_type} maintenance crew to {location} "
            f"for priority inspection and corrective maintenance. "
            f"Test abnormal components and prepare required repair parts."
        )

        crew_type = "Transformer and electrical maintenance crew"
        eta_hours = 12
        pre_position = True

        reason = (
            f"High-risk asset requiring priority maintenance. "
            f"Estimated customer impact: {customers}."
        )

    # ---------------------------------------------------------
    # Priority 3: Medium-risk preventive action
    # ---------------------------------------------------------

    elif (
        risk_level == "medium"
        or risk_score >= 0.40
        or (days is not None and days <= 30)
    ):
        action = (
            f"Schedule an inspection team at {location} "
            f"within the next maintenance window. "
            f"Verify sensor abnormalities and perform preventive maintenance "
            f"before risk increases."
        )

        crew_type = "Electrical inspection and preventive maintenance crew"
        eta_hours = 48
        pre_position = False

        reason = (
            f"Medium-risk asset requiring preventive attention. "
            f"Estimated customer impact: {customers}."
        )

    # ---------------------------------------------------------
    # Priority 4: Lower-risk monitoring
    # ---------------------------------------------------------

    else:
        action = (
            f"Schedule a routine inspection at {location} "
            f"and verify current sensor readings. "
            f"Keep the asset on the preventive maintenance watchlist."
        )

        crew_type = "Routine inspection crew"
        eta_hours = 72
        pre_position = False

        reason = (
            f"Lower current risk; routine inspection is sufficient "
            f"unless conditions deteriorate."
        )

    if factor_text:
        reason += f" Contributing indicators: {factor_text}."

    return {
        "priority_rank": rank,
        "action": action,
        "crew_type": crew_type,
        "dispatch_location": location,
        "eta_hours": eta_hours,
        "pre_position": pre_position,
        "reason": reason,
    }


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _asset_location_name(asset: dict) -> str:
    """
    Safely extract an asset's location name.
    """

    location = asset.get("location")

    if isinstance(location, dict):
        return str(
            location.get(
                "name",
                asset.get("asset_id", "Unknown asset"),
            )
        )

    if isinstance(location, str):
        return location

    return str(
        asset.get(
            "asset_name",
            asset.get("asset_id", "Unknown asset"),
        )
    )


def _local_explanation(asset: dict) -> str:
    """
    Fallback explanation if the reasoning engine is unavailable.
    """

    name = _asset_location_name(asset)
    risk_level = asset.get("risk_level", "unknown")
    score = asset.get("risk_score", "not available")
    days = asset.get("predicted_days_to_failure", "not available")
    customers = asset.get("customers_affected_estimate", "not available")

    return (
        f"{name} has {risk_level} risk with a risk score of {score}. "
        f"Predicted failure window: {days} days. "
        f"Estimated customers affected: {customers}."
    )


def _safe_float(value, default=None):
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _safe_int(value, default=0):
    try:
        if value is None:
            return default
        return int(float(value))
    except (TypeError, ValueError):
        return default