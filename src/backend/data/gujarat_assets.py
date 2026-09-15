"""
gujarat_assets.py

25 realistic Gujarat power grid assets with full schema covering 15 districts.
Used by the real-time simulator pipeline (NOT the static asset_source pipeline).
"""

from __future__ import annotations

from typing import Optional

# ---------------------------------------------------------------------------
# 25 Gujarat grid assets across 15 districts with real approximate lat/lon
# ---------------------------------------------------------------------------
GUJARAT_ASSETS: list[dict] = [
    # Kutch
    {"asset_id": "TX-001", "asset_name": "Kutch EHV Substation Main Transformer",
     "asset_type": "transformer", "district": "Kutch",
     "latitude": 23.2420, "longitude": 69.6669,
     "age_years": 18, "rated_capacity_kw": 160000.0, "criticality": 0.92,
     "customers_served": 85000, "last_maintenance_days_ago": 210, "historical_failures_12mo": 2},
    {"asset_id": "SS-001", "asset_name": "Bhuj 220kV Substation",
     "asset_type": "substation", "district": "Kutch",
     "latitude": 23.2500, "longitude": 69.6700,
     "age_years": 22, "rated_capacity_kw": 220000.0, "criticality": 0.95,
     "customers_served": 120000, "last_maintenance_days_ago": 180, "historical_failures_12mo": 1},

    # Rajkot
    {"asset_id": "TX-002", "asset_name": "Rajkot City Transformer Bank A",
     "asset_type": "transformer", "district": "Rajkot",
     "latitude": 22.3039, "longitude": 70.8022,
     "age_years": 12, "rated_capacity_kw": 100000.0, "criticality": 0.88,
     "customers_served": 72000, "last_maintenance_days_ago": 95, "historical_failures_12mo": 0},
    {"asset_id": "FD-001", "asset_name": "Rajkot Industrial Feeder 7",
     "asset_type": "feeder", "district": "Rajkot",
     "latitude": 22.2965, "longitude": 70.7946,
     "age_years": 8, "rated_capacity_kw": 25000.0, "criticality": 0.65,
     "customers_served": 12000, "last_maintenance_days_ago": 60, "historical_failures_12mo": 1},

    # Ahmedabad
    {"asset_id": "SS-002", "asset_name": "Ahmedabad North 400kV GSS",
     "asset_type": "substation", "district": "Ahmedabad",
     "latitude": 23.0735, "longitude": 72.5273,
     "age_years": 15, "rated_capacity_kw": 400000.0, "criticality": 0.98,
     "customers_served": 350000, "last_maintenance_days_ago": 45, "historical_failures_12mo": 0},
    {"asset_id": "TX-003", "asset_name": "Naroda Industrial Transformer",
     "asset_type": "transformer", "district": "Ahmedabad",
     "latitude": 23.0905, "longitude": 72.6418,
     "age_years": 20, "rated_capacity_kw": 80000.0, "criticality": 0.82,
     "customers_served": 58000, "last_maintenance_days_ago": 320, "historical_failures_12mo": 3},
    {"asset_id": "SWG-001", "asset_name": "Vatva GIDC Switchgear Panel",
     "asset_type": "switchgear", "district": "Ahmedabad",
     "latitude": 22.9734, "longitude": 72.6413,
     "age_years": 14, "rated_capacity_kw": 40000.0, "criticality": 0.75,
     "customers_served": 28000, "last_maintenance_days_ago": 120, "historical_failures_12mo": 1},

    # Surat
    {"asset_id": "TX-004", "asset_name": "Surat Diamond Bourse Transformer",
     "asset_type": "transformer", "district": "Surat",
     "latitude": 21.2012, "longitude": 72.8315,
     "age_years": 6, "rated_capacity_kw": 120000.0, "criticality": 0.90,
     "customers_served": 95000, "last_maintenance_days_ago": 30, "historical_failures_12mo": 0},
    {"asset_id": "LN-001", "asset_name": "Surat Port Transmission Line",
     "asset_type": "line", "district": "Surat",
     "latitude": 21.1702, "longitude": 72.8311,
     "age_years": 25, "rated_capacity_kw": 60000.0, "criticality": 0.70,
     "customers_served": 42000, "last_maintenance_days_ago": 400, "historical_failures_12mo": 4},

    # Vadodara
    {"asset_id": "SS-003", "asset_name": "Vadodara Central 220kV Substation",
     "asset_type": "substation", "district": "Vadodara",
     "latitude": 22.3072, "longitude": 73.1812,
     "age_years": 18, "rated_capacity_kw": 220000.0, "criticality": 0.94,
     "customers_served": 160000, "last_maintenance_days_ago": 75, "historical_failures_12mo": 1},
    {"asset_id": "TX-005", "asset_name": "Petrochemical Zone Transformer",
     "asset_type": "transformer", "district": "Vadodara",
     "latitude": 22.2836, "longitude": 73.2175,
     "age_years": 16, "rated_capacity_kw": 90000.0, "criticality": 0.86,
     "customers_served": 46000, "last_maintenance_days_ago": 250, "historical_failures_12mo": 2},

    # Gandhinagar
    {"asset_id": "SS-004", "asset_name": "Gandhinagar Secretariat Grid Supply",
     "asset_type": "substation", "district": "Gandhinagar",
     "latitude": 23.2156, "longitude": 72.6369,
     "age_years": 10, "rated_capacity_kw": 150000.0, "criticality": 0.97,
     "customers_served": 105000, "last_maintenance_days_ago": 20, "historical_failures_12mo": 0},

    # Anand
    {"asset_id": "TX-006", "asset_name": "Anand Dairy Cooperative Transformer",
     "asset_type": "transformer", "district": "Anand",
     "latitude": 22.5645, "longitude": 72.9289,
     "age_years": 11, "rated_capacity_kw": 50000.0, "criticality": 0.72,
     "customers_served": 32000, "last_maintenance_days_ago": 88, "historical_failures_12mo": 1},

    # Bharuch
    {"asset_id": "TX-007", "asset_name": "Dahej SEZ Main Transformer",
     "asset_type": "transformer", "district": "Bharuch",
     "latitude": 21.7034, "longitude": 72.5371,
     "age_years": 9, "rated_capacity_kw": 200000.0, "criticality": 0.93,
     "customers_served": 78000, "last_maintenance_days_ago": 55, "historical_failures_12mo": 0},
    {"asset_id": "LN-002", "asset_name": "Bharuch ONGC Feeder Line",
     "asset_type": "line", "district": "Bharuch",
     "latitude": 21.7196, "longitude": 72.9865,
     "age_years": 28, "rated_capacity_kw": 45000.0, "criticality": 0.78,
     "customers_served": 30000, "last_maintenance_days_ago": 365, "historical_failures_12mo": 5},

    # Mehsana
    {"asset_id": "FD-002", "asset_name": "Mehsana GSPL Feeder North",
     "asset_type": "feeder", "district": "Mehsana",
     "latitude": 23.5880, "longitude": 72.3693,
     "age_years": 13, "rated_capacity_kw": 30000.0, "criticality": 0.68,
     "customers_served": 22000, "last_maintenance_days_ago": 145, "historical_failures_12mo": 2},

    # Banaskantha
    {"asset_id": "SS-005", "asset_name": "Palanpur 132kV Grid Substation",
     "asset_type": "substation", "district": "Banaskantha",
     "latitude": 24.1741, "longitude": 72.4320,
     "age_years": 24, "rated_capacity_kw": 132000.0, "criticality": 0.80,
     "customers_served": 68000, "last_maintenance_days_ago": 480, "historical_failures_12mo": 3},
    {"asset_id": "PL-001", "asset_name": "Deesa Rural Distribution Pole Set",
     "asset_type": "pole", "district": "Banaskantha",
     "latitude": 24.2626, "longitude": 72.1970,
     "age_years": 30, "rated_capacity_kw": 5000.0, "criticality": 0.45,
     "customers_served": 3500, "last_maintenance_days_ago": 720, "historical_failures_12mo": 6},

    # Jamnagar
    {"asset_id": "TX-008", "asset_name": "Reliance Refinery Transformer Bank",
     "asset_type": "transformer", "district": "Jamnagar",
     "latitude": 22.4707, "longitude": 70.0577,
     "age_years": 14, "rated_capacity_kw": 300000.0, "criticality": 0.96,
     "customers_served": 210000, "last_maintenance_days_ago": 40, "historical_failures_12mo": 0},

    # Junagadh
    {"asset_id": "FD-003", "asset_name": "Junagadh Agricultural Feeder 3",
     "asset_type": "feeder", "district": "Junagadh",
     "latitude": 21.5226, "longitude": 70.4579,
     "age_years": 17, "rated_capacity_kw": 15000.0, "criticality": 0.55,
     "customers_served": 9800, "last_maintenance_days_ago": 210, "historical_failures_12mo": 3},

    # Bhavnagar
    {"asset_id": "SWG-002", "asset_name": "Bhavnagar Port Switchgear",
     "asset_type": "switchgear", "district": "Bhavnagar",
     "latitude": 21.7645, "longitude": 72.1519,
     "age_years": 19, "rated_capacity_kw": 35000.0, "criticality": 0.77,
     "customers_served": 25000, "last_maintenance_days_ago": 290, "historical_failures_12mo": 2},
    {"asset_id": "TX-009", "asset_name": "Bhavnagar Alang Ship Breakers TX",
     "asset_type": "transformer", "district": "Bhavnagar",
     "latitude": 21.4026, "longitude": 72.1691,
     "age_years": 23, "rated_capacity_kw": 55000.0, "criticality": 0.73,
     "customers_served": 18000, "last_maintenance_days_ago": 350, "historical_failures_12mo": 4},

    # Navsari
    {"asset_id": "SS-006", "asset_name": "Navsari 110kV Distribution Sub",
     "asset_type": "substation", "district": "Navsari",
     "latitude": 20.9467, "longitude": 72.9520,
     "age_years": 16, "rated_capacity_kw": 110000.0, "criticality": 0.83,
     "customers_served": 74000, "last_maintenance_days_ago": 100, "historical_failures_12mo": 1},

    # Panchmahal
    {"asset_id": "TX-010", "asset_name": "Godhra Grid Transformer",
     "asset_type": "transformer", "district": "Panchmahal",
     "latitude": 22.7772, "longitude": 73.6193,
     "age_years": 21, "rated_capacity_kw": 70000.0, "criticality": 0.79,
     "customers_served": 48000, "last_maintenance_days_ago": 275, "historical_failures_12mo": 3},
    {"asset_id": "PL-002", "asset_name": "Halol Rural Pole Network",
     "asset_type": "pole", "district": "Panchmahal",
     "latitude": 22.5038, "longitude": 73.4744,
     "age_years": 27, "rated_capacity_kw": 4000.0, "criticality": 0.40,
     "customers_served": 2800, "last_maintenance_days_ago": 600, "historical_failures_12mo": 5},
]

# Index by asset_id for O(1) lookup
_BY_ID: dict[str, dict] = {a["asset_id"]: a for a in GUJARAT_ASSETS}


def get_all_gujarat_assets() -> list[dict]:
    """Return the full list of 25 Gujarat assets."""
    return GUJARAT_ASSETS


def get_gujarat_asset_by_id(asset_id: str) -> Optional[dict]:
    """Return a single asset dict by id, or None if not found."""
    return _BY_ID.get(asset_id)


# All distinct districts present in the dataset
GUJARAT_DISTRICTS: list[str] = sorted({a["district"] for a in GUJARAT_ASSETS})
