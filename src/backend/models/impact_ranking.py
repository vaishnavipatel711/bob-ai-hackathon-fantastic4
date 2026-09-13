"""
impact_ranking.py

Ranks assets by grid IMPACT severity, not raw risk probability alone.

impact_score = f(risk_score, customers_affected, asset_criticality)

Rationale: a high-risk asset feeding 50 customers may matter less to grid
operators than a medium-risk substation feeding 10,000 -- impact ranking
is what should drive the /plan (maintenance prioritization) endpoint.

Explainability: impact_score is a documented weighted sum of three
normalized [0,1] components, each independently visible on the result
object (risk_component, customer_component, criticality_component) so the
ranking can be justified the same way risk_score is.
"""

from dataclasses import dataclass
from typing import List, Optional

# Weights for the three impact components. Must sum to 1.0.
IMPACT_WEIGHTS = {
    "risk": 0.45,
    "customers_affected": 0.35,
    "criticality": 0.20,
}
assert abs(sum(IMPACT_WEIGHTS.values()) - 1.0) < 1e-9, "IMPACT_WEIGHTS must sum to 1.0"

# Asset-type criticality priors (0-1): how central this asset type is to
# grid stability / how many downstream assets depend on it. Tune freely.
ASSET_CRITICALITY = {
    "substation": 1.0,
    "transformer": 0.8,
    "switchgear": 0.7,
    "feeder": 0.6,
    "line": 0.5,
    "pole": 0.3,
}
DEFAULT_CRITICALITY = 0.5

# Used to normalize customers_affected into [0,1]. Any asset at/above this
# many affected customers is treated as maximally severe on that axis.
CUSTOMERS_AFFECTED_CAP = 10000


@dataclass
class ImpactResult:
    asset_id: str
    impact_score: float
    risk_component: float
    customer_component: float
    criticality_component: float

    def to_dict(self) -> dict:
        return {
            "asset_id": self.asset_id,
            "impact_score": self.impact_score,
            "risk_component": self.risk_component,
            "customer_component": self.customer_component,
            "criticality_component": self.criticality_component,
        }


def compute_impact_score(
    asset_id: str,
    risk_score: float,
    customers_affected: int,
    asset_type: str,
) -> ImpactResult:
    """Compute a single asset's impact score and its component breakdown."""
    risk_component = max(0.0, min(1.0, risk_score))
    customer_component = max(0.0, min(1.0, customers_affected / CUSTOMERS_AFFECTED_CAP))
    criticality_component = ASSET_CRITICALITY.get(asset_type, DEFAULT_CRITICALITY)

    impact_score = round(
        IMPACT_WEIGHTS["risk"] * risk_component
        + IMPACT_WEIGHTS["customers_affected"] * customer_component
        + IMPACT_WEIGHTS["criticality"] * criticality_component,
        4,
    )

    return ImpactResult(
        asset_id=asset_id,
        impact_score=impact_score,
        risk_component=round(risk_component, 2),
        customer_component=round(customer_component, 2),
        criticality_component=round(criticality_component, 2),
    )


def rank_assets_by_impact(assets: List[dict]) -> List[dict]:
    """
    Given a list of asset dicts (matching the shared asset shape --
    must contain asset_id, risk_score, customers_affected_estimate,
    asset_type), return the same dicts augmented with an "impact" block
    and sorted descending by impact_score.

    Does not mutate the input list; returns new dicts.
    """
    ranked = []
    for asset in assets:
        result = compute_impact_score(
            asset_id=asset["asset_id"],
            risk_score=asset["risk_score"],
            customers_affected=asset.get("customers_affected_estimate", 0),
            asset_type=asset.get("asset_type", ""),
        )
        enriched = dict(asset)
        enriched["impact"] = result.to_dict()
        ranked.append(enriched)

    ranked.sort(key=lambda a: a["impact"]["impact_score"], reverse=True)
    return ranked


if __name__ == "__main__":
    sample = [
        {"asset_id": "TX-104", "risk_score": 0.87, "customers_affected_estimate": 4200, "asset_type": "transformer"},
        {"asset_id": "SUB-02", "risk_score": 0.55, "customers_affected_estimate": 9800, "asset_type": "substation"},
        {"asset_id": "POLE-9", "risk_score": 0.92, "customers_affected_estimate": 60, "asset_type": "pole"},
    ]
    import json
    print(json.dumps(rank_assets_by_impact(sample), indent=2))