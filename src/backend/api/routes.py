"""
routes.py

Endpoints:
  GET  /assets                -> all assets, enriched with impact ranking
  GET  /assets/{id}           -> single asset by id (404 if not found)
  GET  /assets/{id}/explain   -> natural-language explanation, proxied to
                                  a teammate's Bob integration when
                                  available, else a local fallback built
                                  from contributing_factors
  GET  /plan                  -> top-N prioritized maintenance plan,
                                  ranked by grid impact (not raw risk)
  POST /ask                   -> free-text Q&A over current asset state
                                  (simple rule-based answer for Day 1;
                                  swappable for a real LLM/Bob call later)

All asset data comes from data.asset_source.get_all_assets() /
get_asset_by_id() -- the single swap point for Day 2's real data.
"""

from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from ..data.asset_source import get_all_assets, get_asset_by_id
from ..models.impact_ranking import rank_assets_by_impact
from .bob_integration import get_bob_explanation, BobUnavailable

router = APIRouter()


# ---------------------------------------------------------------------------
# GET /assets
# ---------------------------------------------------------------------------
@router.get("/assets")
def list_assets(
    risk_level: Optional[str] = Query(
        default=None, description="Filter by risk_level: low | medium | high"
    )
):
    """Return all assets, enriched with an impact ranking (highest impact first)."""
    assets = get_all_assets()
    if risk_level:
        assets = [a for a in assets if a.get("risk_level") == risk_level]
    ranked = rank_assets_by_impact(assets)
    return {"count": len(ranked), "assets": ranked}


# ---------------------------------------------------------------------------
# GET /assets/{asset_id}
# ---------------------------------------------------------------------------
@router.get("/assets/{asset_id}")
def get_asset(asset_id: str):
    """Return a single asset by id."""
    asset = get_asset_by_id(asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail=f"Asset '{asset_id}' not found")
    return asset


# ---------------------------------------------------------------------------
# GET /assets/{asset_id}/explain
# ---------------------------------------------------------------------------
def _local_explanation(asset: dict) -> dict:
    """
    Fallback explanation built directly from contributing_factors, used
    whenever the Bob integration isn't available. Deterministic and
    fully derived from the same explainable model output the frontend
    already has -- no separate source of truth to keep in sync.
    """
    factors = asset.get("contributing_factors", [])
    if not factors:
        summary = (
            f"{asset['asset_id']} has risk_score {asset['risk_score']} "
            f"({asset['risk_level']}) with no strongly contributing factors detected."
        )
    else:
        parts = [f"{f['factor'].replace('_', ' ')} ({f['value']}, weight {f['weight']})" for f in factors]
        summary = (
            f"{asset['asset_id']} is at {asset['risk_level'].upper()} risk "
            f"(score {asset['risk_score']}), driven mainly by: " + "; ".join(parts) + ". "
            f"Estimated {asset['predicted_days_to_failure']} days to failure, "
            f"affecting roughly {asset['customers_affected_estimate']} customers if it fails."
        )
    return {"summary": summary, "source": "local_fallback"}


@router.get("/assets/{asset_id}/explain")
def explain_asset(asset_id: str):
    """
    Explain why an asset has its current risk score. Tries the teammate's
    Bob integration first; falls back to a local, contributing-factors-based
    explanation if Bob isn't wired up yet (always true on Day 1).
    """
    asset = get_asset_by_id(asset_id)
    if asset is None:
        raise HTTPException(status_code=404, detail=f"Asset '{asset_id}' not found")

    try:
        bob_result = get_bob_explanation(asset)
        if bob_result:
            return bob_result
    except BobUnavailable:
        pass

    return _local_explanation(asset)


# ---------------------------------------------------------------------------
# GET /plan
# ---------------------------------------------------------------------------
@router.get("/plan")
def get_plan(top_n: int = Query(default=5, ge=1, le=50)):
    """
    Prioritized maintenance plan: top-N assets by grid IMPACT (not raw
    risk), so operators tackle what matters most to overall grid stability.
    """
    assets = get_all_assets()
    ranked = rank_assets_by_impact(assets)
    top = ranked[:top_n]
    return {
        "generated_from": "impact_ranking",
        "top_n": top_n,
        "plan": [
            {
                "priority": i + 1,
                "asset_id": a["asset_id"],
                "location": a["location"],
                "risk_level": a["risk_level"],
                "risk_score": a["risk_score"],
                "impact_score": a["impact"]["impact_score"],
                "predicted_days_to_failure": a["predicted_days_to_failure"],
                "customers_affected_estimate": a["customers_affected_estimate"],
                "recommended_action": _recommend_action(a),
            }
            for i, a in enumerate(top)
        ],
    }


def _recommend_action(asset: dict) -> str:
    """Small deterministic rule mapping risk/days-to-failure to an action label."""
    days = asset["predicted_days_to_failure"]
    level = asset["risk_level"]
    if level == "high" and days <= 14:
        return "Schedule emergency inspection within 48 hours"
    if level == "high":
        return "Schedule priority maintenance this week"
    if level == "medium":
        return "Add to next maintenance cycle"
    return "Monitor -- no action needed"


# ---------------------------------------------------------------------------
# POST /ask
# ---------------------------------------------------------------------------
class AskRequest(BaseModel):
    question: str
    asset_id: Optional[str] = None  # optional: scope the question to one asset


class AskResponse(BaseModel):
    answer: str
    matched_assets: list


@router.post("/ask", response_model=AskResponse)
def ask(payload: AskRequest):
    """
    Free-text Q&A over current asset state.

    Day 1: simple rule-based matching over asset_id / risk_level /
    asset_type keywords in the question, plus optional asset_id scoping.
    This keeps /ask usable end-to-end today; swap the body for a real
    LLM/Bob call later without changing the request/response shape.
    """
    assets = get_all_assets()
    question_lower = payload.question.lower()

    if payload.asset_id:
        scoped = get_asset_by_id(payload.asset_id)
        matches = [scoped] if scoped else []
    else:
        matches = [
            a
            for a in assets
            if a["asset_id"].lower() in question_lower
            or a["risk_level"] in question_lower
            or a["asset_type"] in question_lower
        ]
        if not matches and ("high" in question_lower or "risk" in question_lower):
            matches = [a for a in assets if a["risk_level"] == "high"]

    if not matches:
        return AskResponse(
            answer=(
                "I couldn't match your question to a specific asset. Try including an "
                "asset id (e.g. TX-104), a risk level (low/medium/high), or an asset type."
            ),
            matched_assets=[],
        )

    lines = []
    for a in matches:
        lines.append(
            f"{a['asset_id']} ({a['asset_type']}): {a['risk_level']} risk "
            f"(score {a['risk_score']}), ~{a['predicted_days_to_failure']} days to failure, "
            f"~{a['customers_affected_estimate']} customers affected."
        )

    return AskResponse(answer=" ".join(lines), matched_assets=[a["asset_id"] for a in matches])