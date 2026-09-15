"""
district_risk.py

District-level risk aggregation from per-asset risk results.

Public API:
    compute_district_risks(asset_risks, assets, weather_map)
        -> dict[district -> DistrictRisk]
"""

from __future__ import annotations

from dataclasses import dataclass, asdict
from datetime import datetime, timezone
from typing import Optional

from .risk_engine import AssetRiskResult
from ..data.weather_simulator import WeatherSnapshot


@dataclass
class DistrictRisk:
    district: str
    timestamp: str
    risk_score: float               # 0-100, highest asset risk in district
    risk_level: str
    total_assets: int
    critical_assets: int
    high_risk_assets: int
    medium_risk_assets: int
    low_risk_assets: int
    predicted_outage_probability: float  # 0-100
    customers_at_risk: int
    weather_risk: float             # 0-1
    top_asset_id: str
    top_asset_name: str

    def to_dict(self) -> dict:
        return asdict(self)


def _risk_level(score: float) -> str:
    if score <= 30:
        return "low"
    if score <= 60:
        return "medium"
    if score <= 80:
        return "high"
    return "critical"


def compute_district_risks(
    asset_risks: dict[str, AssetRiskResult],
    assets: list[dict],
    weather_map: dict[str, WeatherSnapshot],
) -> dict[str, DistrictRisk]:
    """
    Aggregate per-asset risk results into district-level summaries.

    Args:
        asset_risks: dict[asset_id -> AssetRiskResult]
        assets: list of asset dicts (containing 'district', 'asset_name')
        weather_map: dict[district -> WeatherSnapshot]

    Returns:
        dict[district -> DistrictRisk]
    """
    ts = datetime.now(tz=timezone.utc).isoformat()

    # Build a lookup from asset_id -> asset dict
    asset_by_id: dict[str, dict] = {a["asset_id"]: a for a in assets}

    # Group risk results by district
    district_results: dict[str, list[AssetRiskResult]] = {}
    for asset in assets:
        district = asset.get("district", "Unknown")
        district_results.setdefault(district, [])

    for aid, risk in asset_risks.items():
        asset = asset_by_id.get(aid)
        if asset is None:
            continue
        district = asset.get("district", "Unknown")
        district_results.setdefault(district, []).append(risk)

    output: dict[str, DistrictRisk] = {}

    for district, results in district_results.items():
        if not results:
            # District has assets but no risk results yet
            wx = weather_map.get(district)
            wx_risk = wx.weather_risk_score if wx else 0.0
            output[district] = DistrictRisk(
                district=district,
                timestamp=ts,
                risk_score=0.0,
                risk_level="low",
                total_assets=0,
                critical_assets=0,
                high_risk_assets=0,
                medium_risk_assets=0,
                low_risk_assets=0,
                predicted_outage_probability=0.0,
                customers_at_risk=0,
                weather_risk=round(wx_risk, 3),
                top_asset_id="",
                top_asset_name="",
            )
            continue

        # Highest-risk asset drives the district score
        top_result = max(results, key=lambda r: r.overall_risk_score)
        top_asset = asset_by_id.get(top_result.asset_id, {})

        levels = [r.risk_level for r in results]
        critical = levels.count("critical")
        high = levels.count("high")
        medium = levels.count("medium")
        low = levels.count("low")

        # District outage probability: blend of top asset and weather
        wx = weather_map.get(district)
        wx_risk = wx.weather_risk_score if wx else 0.0

        # Weighted: top asset failure prob * 0.6 + weighted average * 0.3 + weather * 0.1
        avg_fail = sum(r.failure_probability for r in results) / len(results)
        outage_prob = round(
            min(100.0,
                top_result.failure_probability * 0.60
                + avg_fail * 0.30
                + wx_risk * 100 * 0.10),
            2,
        )

        customers_at_risk = sum(r.customers_at_risk for r in results)
        district_score = round(top_result.overall_risk_score, 2)

        output[district] = DistrictRisk(
            district=district,
            timestamp=ts,
            risk_score=district_score,
            risk_level=_risk_level(district_score),
            total_assets=len(results),
            critical_assets=critical,
            high_risk_assets=high,
            medium_risk_assets=medium,
            low_risk_assets=low,
            predicted_outage_probability=outage_prob,
            customers_at_risk=customers_at_risk,
            weather_risk=round(wx_risk, 3),
            top_asset_id=top_result.asset_id,
            top_asset_name=top_asset.get("asset_name", top_result.asset_id),
        )

    return output
