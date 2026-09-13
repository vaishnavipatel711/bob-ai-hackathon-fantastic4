"""
incident_history_loader.py

Generates synthetic IncidentHistory data for grid assets.

In a real system this would query a maintenance/outage ticketing system
(e.g. Maximo, which IBM often pairs with Bob-style advisors) for an
asset's incident record. For the hackathon demo we synthesize plausible
histories, with "failure signature" assets getting a worse recent-incident
pattern (more incidents in the last 12 months, and a more recent last
incident) so their overall risk story is coherent across sensors, weather,
and history.
"""

from __future__ import annotations

import random
from dataclasses import dataclass
from typing import Optional


@dataclass
class IncidentHistory:
    incidents_last_12mo: int
    last_incident_days_ago: Optional[int]  # None if no incident on record


def _rng_for_asset(asset_id: str) -> random.Random:
    return random.Random(f"incident::{asset_id}")


def get_incident_history(
    asset_id: str,
    failure_signature: bool = False,
) -> IncidentHistory:
    """
    Generate an IncidentHistory for an asset.

    Args:
        asset_id: unique asset identifier, used to seed deterministic RNG.
        failure_signature: if True, injects a worse recent incident
            pattern (more incidents, more recent last incident).
    """
    rng = _rng_for_asset(asset_id)

    if failure_signature:
        incidents_last_12mo = rng.randint(2, 6)
        last_incident_days_ago = rng.randint(3, 45)
    else:
        # Most healthy assets have 0-1 minor incidents in the last year.
        incidents_last_12mo = rng.choices([0, 1, 2], weights=[70, 22, 8])[0]
        if incidents_last_12mo == 0:
            # Either no incident on record, or something further back.
            last_incident_days_ago = rng.choice(
                [None, rng.randint(200, 700)]
            )
        else:
            last_incident_days_ago = rng.randint(60, 360)

    return IncidentHistory(
        incidents_last_12mo=incidents_last_12mo,
        last_incident_days_ago=last_incident_days_ago,
    )