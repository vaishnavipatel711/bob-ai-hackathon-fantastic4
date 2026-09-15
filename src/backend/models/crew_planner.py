"""
crew_planner.py

Crew pre-positioning recommendations based on district risk + asset priorities.

Public API:
    generate_crew_recommendations(district_risks, asset_risks, assets)
        -> list[CrewRecommendation]
"""

from __future__ import annotations

from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from typing import Optional

from .district_risk import DistrictRisk
from .risk_engine import AssetRiskResult

# ---------------------------------------------------------------------------
# Static crew definitions (demo: 6 crews at various depots across Gujarat)
# ---------------------------------------------------------------------------
_CREWS = [
    {"crew_id": "CREW-01", "home": "Ahmedabad"},
    {"crew_id": "CREW-02", "home": "Surat"},
    {"crew_id": "CREW-03", "home": "Rajkot"},
    {"crew_id": "CREW-04", "home": "Vadodara"},
    {"crew_id": "CREW-05", "home": "Bhavnagar"},
    {"crew_id": "CREW-06", "home": "Kutch"},
]

# Rough adjacency / proximity clusters for routing (demo heuristic)
_DISTRICT_NEIGHBORS: dict[str, list[str]] = {
    "Ahmedabad":  ["Gandhinagar", "Anand", "Mehsana", "Vadodara"],
    "Gandhinagar":["Ahmedabad", "Mehsana", "Sabarkantha"],
    "Surat":      ["Navsari", "Bharuch", "Tapi"],
    "Vadodara":   ["Anand", "Bharuch", "Panchmahal", "Ahmedabad"],
    "Rajkot":     ["Jamnagar", "Bhavnagar", "Morbi", "Kutch"],
    "Anand":      ["Ahmedabad", "Vadodara", "Kheda"],
    "Bharuch":    ["Surat", "Vadodara", "Narmada"],
    "Mehsana":    ["Ahmedabad", "Gandhinagar", "Banaskantha"],
    "Banaskantha":["Mehsana", "Sabarkantha", "Patan"],
    "Jamnagar":   ["Rajkot", "Porbandar", "Kutch"],
    "Junagadh":   ["Rajkot", "Porbandar", "Amreli"],
    "Bhavnagar":  ["Rajkot", "Ahmedabad", "Amreli"],
    "Navsari":    ["Surat", "Valsad", "Dang"],
    "Panchmahal": ["Vadodara", "Anand", "Dahod"],
    "Kutch":      ["Rajkot", "Jamnagar"],
}


@dataclass
class CrewRecommendation:
    crew_id: str
    current_location: str
    recommended_position: str
    reason: str
    priority_assets: list[str] = field(default_factory=list)
    estimated_customers_protected: int = 0
    urgency: str = "within_24h"     # "immediate"|"within_6h"|"within_24h"

    def to_dict(self) -> dict:
        return asdict(self)


def _urgency_from_level(risk_level: str) -> str:
    return {"critical": "immediate", "high": "within_6h"}.get(risk_level, "within_24h")


def generate_crew_recommendations(
    district_risks: dict[str, DistrictRisk],
    asset_risks: dict[str, AssetRiskResult],
    assets: list[dict],
) -> list[CrewRecommendation]:
    """
    Generate crew pre-positioning recommendations.

    Strategy:
    1. Sort districts by risk score descending.
    2. For the top-N highest-risk districts, assign the geographically nearest
       available crew.
    3. Remaining crews stay at their home depot (standard readiness).

    Args:
        district_risks: dict[district -> DistrictRisk]
        asset_risks: dict[asset_id -> AssetRiskResult]
        assets: list of asset dicts

    Returns:
        list[CrewRecommendation], one per crew
    """
    ts = datetime.now(tz=timezone.utc).isoformat()
    asset_by_id: dict[str, dict] = {a["asset_id"]: a for a in assets}

    # Sort districts by risk
    priority_districts = sorted(
        district_risks.values(),
        key=lambda d: d.risk_score,
        reverse=True,
    )

    # Build per-district priority asset list (critical/high only, sorted by impact)
    def _priority_assets_for_district(district: str) -> list[str]:
        district_asset_ids = [
            a["asset_id"] for a in assets if a.get("district") == district
        ]
        ranked = sorted(
            [asset_risks[aid] for aid in district_asset_ids if aid in asset_risks],
            key=lambda r: r.grid_impact_score,
            reverse=True,
        )
        return [r.asset_id for r in ranked if r.risk_level in ("critical", "high")][:3]

    # Assign crews to top-risk districts
    crews_available = list(_CREWS)
    assignments: dict[str, str] = {}   # crew_id -> district
    assigned_districts: set[str] = set()

    for dr in priority_districts:
        if dr.risk_level not in ("critical", "high"):
            break
        if not crews_available:
            break
        if dr.district in assigned_districts:
            continue

        # Find the nearest crew: prefer crews whose home is in the district's
        # neighbor list, else just pick the first available
        neighbors = _DISTRICT_NEIGHBORS.get(dr.district, [])
        chosen = None
        for crew in crews_available:
            if crew["home"] in neighbors or crew["home"] == dr.district:
                chosen = crew
                break
        if chosen is None:
            chosen = crews_available[0]

        assignments[chosen["crew_id"]] = dr.district
        assigned_districts.add(dr.district)
        crews_available.remove(chosen)

    # Build recommendations
    recommendations: list[CrewRecommendation] = []

    for crew_def in _CREWS:
        cid = crew_def["crew_id"]
        home = crew_def["home"]

        if cid in assignments:
            target = assignments[cid]
            dr = district_risks.get(target)
            prio_assets = _priority_assets_for_district(target)
            customers_protected = sum(
                asset_risks[aid].customers_at_risk
                for aid in prio_assets if aid in asset_risks
            )
            urgency = _urgency_from_level(dr.risk_level if dr else "medium")
            reason = (
                f"District {target} has {dr.risk_level.upper()} risk "
                f"(score {dr.risk_score:.0f}/100). "
                f"{dr.critical_assets} critical, {dr.high_risk_assets} high-risk assets. "
                f"Outage probability: {dr.predicted_outage_probability:.0f}%."
            ) if dr else f"Pre-position to {target} for elevated risk coverage."

            recommendations.append(CrewRecommendation(
                crew_id=cid,
                current_location=home,
                recommended_position=target,
                reason=reason,
                priority_assets=prio_assets,
                estimated_customers_protected=customers_protected,
                urgency=urgency,
            ))
        else:
            # Crew stays at home but is on standby
            recommendations.append(CrewRecommendation(
                crew_id=cid,
                current_location=home,
                recommended_position=home,
                reason=f"No high-risk districts near {home} at this time. Remain on standby.",
                priority_assets=[],
                estimated_customers_protected=0,
                urgency="within_24h",
            ))

    return recommendations
