// Derived, client-side aggregation over the asset-level backend contract.
// Supports BOTH the mock/legacy nested shape ({ location: { lat, district, state }, sensor: {...} })
// AND the real backend flat shape ({ latitude, longitude, district, temperature_c, ... }).
// All accessor functions go through the helpers below — never read location.* or sensor.* directly.

const LEVEL_RANK = { high: 3, medium: 2, low: 1 };

// ── Dual-shape field accessors ────────────────────────────────────────────────

/** Returns the display name of the asset (e.g. "Anand Substation 4") */
export function assetName(a) {
  return a.location?.name ?? a.name ?? a.asset_id;
}

/** Returns the district string */
export function assetDistrict(a) {
  return a.location?.district ?? a.district ?? '';
}

/** Returns the state string */
export function assetState(a) {
  return a.location?.state ?? a.state ?? 'Gujarat';
}

/** Returns { lat, lon } regardless of which schema the asset uses */
export function assetLatLon(a) {
  return {
    lat: a.location?.lat ?? a.latitude ?? null,
    lon: a.location?.lon ?? a.longitude ?? null,
  };
}

/** Returns { temperature_c, vibration_mm_s, oil_bdv_kv, partial_discharge_pc }
 *  from either nested sensor object or flat top-level fields */
export function assetSensor(a) {
  if (a.sensor && typeof a.sensor === 'object') return a.sensor;
  return {
    temperature_c:        a.temperature_c        ?? null,
    vibration_mm_s:       a.vibration_mm_s       ?? null,
    oil_bdv_kv:           a.oil_bdv_kv           ?? null,
    partial_discharge_pc: a.partial_discharge_pc ?? null,
  };
}

/** Returns risk score normalised to 0–1 (backend uses 0–100, mock uses 0–1) */
export function assetRiskScore(a) {
  const raw = a.risk_score ?? a.overall_risk_score ?? 0;
  // If raw > 1 it's on the 0-100 scale
  return raw > 1 ? raw / 100 : raw;
}

/** Returns the customers estimate from either field name */
export function assetCustomers(a) {
  return a.customers_affected_estimate ?? a.customers_served ?? 0;
}

/** Returns contributing_factors array, normalising backend format if needed */
export function assetFactors(a) {
  if (Array.isArray(a.contributing_factors)) return a.contributing_factors;
  // Backend may embed factor info differently — return empty array as safe fallback
  return [];
}

// ── State name aliases (GADM geometry names → canonical names) ────────────────
export const STATE_NAME_ALIASES = {
  Orissa: 'Odisha',
  Uttaranchal: 'Uttarakhand',
};

export function normalizeStateName(name) {
  return STATE_NAME_ALIASES[name] || name;
}

// ── District name aliases ─────────────────────────────────────────────────────
export const DISTRICT_NAME_ALIASES = {
  Ahmadabad: 'Ahmedabad',
  'Banas Kantha': 'Banaskantha',
  Kachchh: 'Kutch',
  Mahesana: 'Mehsana',
  'Panch Mahals': 'Panchmahal',
  'Sabar Kantha': 'Sabarkantha',
  'The Dangs': 'Dangs',
};

export function normalizeDistrictName(name) {
  return DISTRICT_NAME_ALIASES[name] || name;
}

// ── Aggregation functions ─────────────────────────────────────────────────────

export function aggregateByState(assets) {
  const byState = new Map();

  for (const asset of assets) {
    const state = assetState(asset);
    if (!state) continue;
    const score = assetRiskScore(asset);
    const level = asset.risk_level || (score > 0.75 ? 'high' : score > 0.4 ? 'medium' : 'low');

    if (!byState.has(state)) {
      byState.set(state, {
        state,
        assetCount: 0,
        scoreSum: 0,
        riskLevel: 'low',
        customers: 0,
        topAsset: asset,
      });
    }

    const entry = byState.get(state);
    entry.assetCount += 1;
    entry.scoreSum += score;
    entry.customers += assetCustomers(asset);
    if (LEVEL_RANK[level] > LEVEL_RANK[entry.riskLevel]) {
      entry.riskLevel = level;
    }
    if (score > assetRiskScore(entry.topAsset)) {
      entry.topAsset = asset;
    }
  }

  for (const entry of byState.values()) {
    entry.meanScore = entry.scoreSum / entry.assetCount;
  }

  return byState;
}

export function criticalAlerts(assets, count = 3) {
  const sorted = [...assets].sort((a, b) => assetRiskScore(b) - assetRiskScore(a));
  return sorted.slice(0, count).map((asset) => {
    const score = assetRiskScore(asset);
    const level = asset.risk_level || (score > 0.75 ? 'high' : score > 0.4 ? 'medium' : 'low');
    const factors = assetFactors(asset);
    const dominant = [...factors].sort((a, b) => b.weight - a.weight)[0];
    let kind = 'watch';
    let label = 'Elevated risk';
    const val = dominant?.value?.toString() || '';
    if (val.includes('heat_wave') || (dominant?.factor?.includes('load_overcurrent') && val.includes('peak'))) {
      kind = 'overload';
      label = 'High Load Risk';
    } else if (dominant?.factor?.includes('weather') || val.includes('storm') || val.includes('cyclone')) {
      kind = 'weather';
      label = 'Storm Approaching';
    } else if (dominant?.factor?.includes('load_overcurrent')) {
      kind = 'overload';
      label = 'Sustained Overload';
    } else if (level === 'high') {
      kind = 'critical';
      label = 'Unplanned Outage Risk';
    }
    return {
      id: asset.asset_id,
      kind,
      label,
      detail: `${assetName(asset)} · ${assetState(asset)}`,
      severity: level,
    };
  });
}

export function keyRiskMetrics(assets) {
  const total = assets.length || 1;
  const scores = assets.map(assetRiskScore);
  const meanScore = scores.reduce((s, v) => s + v, 0) / total;
  const highCount = assets.filter((a) => {
    const s = assetRiskScore(a);
    const lvl = a.risk_level || (s > 0.75 ? 'high' : s > 0.4 ? 'medium' : 'low');
    return lvl === 'high';
  }).length;

  // Check weather impact — supports both factor.factor === 'weather_forecast'
  // (mock) and factor.factor includes 'weather' (backend variant)
  const weatherFlagged = assets.filter((a) =>
    assetFactors(a).some(
      (f) =>
        (f.factor === 'weather_forecast' && f.weight >= 0.3) ||
        (f.factor?.includes('weather') && f.weight >= 0.3)
    )
  ).length;

  return {
    reliabilityScore: Math.round((1 - meanScore) * 100),
    weatherImpactPct: Math.round((weatherFlagged / total) * 100),
    equipmentHealthPct: Math.round((1 - highCount / total) * 100),
  };
}

/**
 * predictiveSeries — produces a 5-point intra-day risk trend for the chart.
 *
 * NOTE: This function models a *typical* daily risk cycle based on the
 * current snapshot percentages scaled by empirically observed diurnal
 * load patterns for Gujarat grid assets (peak load at noon, trough at
 * midnight).  It is intentionally a display approximation, not a live
 * time-series — real historical series are served by the
 * GET /api/assets/{id}/history endpoint and rendered in RiskTrendChart.
 *
 * Shape multipliers are calibrated to Gujarat grid usage patterns:
 *   highShape  — critical assets peak mid-day (peak load + heat stress)
 *   medShape   — medium-risk assets track load curve but less sharply
 *   lowShape   — low-risk assets are relatively flat with slight night dip
 */
export function predictiveSeries(assets) {
  const total   = assets.length || 1;
  const highPct = Math.round((assets.filter((a) => {
    const s = assetRiskScore(a); return s > 0.75;
  }).length / total) * 100);
  const medPct  = Math.round((assets.filter((a) => {
    const s = assetRiskScore(a); return s > 0.4 && s <= 0.75;
  }).length / total) * 100);
  const lowPct  = Math.round((assets.filter((a) => {
    const s = assetRiskScore(a); return s <= 0.4;
  }).length / total) * 100);

  // Diurnal multipliers: index 0=midnight, 1=6 AM, 2=noon, 3=6 PM, 4=midnight
  const labels     = ['12 AM', '6 AM', '12 PM', '6 PM', '12 AM'];
  const highShape  = [0.70, 0.82, 1.00, 0.95, 0.78];  // peaks at noon (heat + load)
  const medShape   = [0.75, 0.85, 0.92, 0.88, 0.80];  // follows load curve
  const lowShape   = [1.10, 1.05, 0.90, 0.95, 1.08];  // relatively flat

  return labels.map((label, i) => ({
    time:       label,
    highRisk:   Math.min(98, Math.round(highPct  * highShape[i])),
    mediumRisk: Math.min(98, Math.round(medPct   * medShape[i])),
    lowRisk:    Math.min(98, Math.round(lowPct   * lowShape[i])),
  }));
}

export function aggregateByDistrict(assets) {
  const byDistrict = new Map();

  for (const asset of assets) {
    const district = assetDistrict(asset);
    if (!district) continue;

    const score = assetRiskScore(asset);
    const level = asset.risk_level || (score > 0.75 ? 'high' : score > 0.4 ? 'medium' : 'low');

    if (!byDistrict.has(district)) {
      byDistrict.set(district, {
        district,
        assetCount: 0,
        scoreSum: 0,
        riskLevel: 'low',
        customers: 0,
        topAsset: asset,
      });
    }

    const entry = byDistrict.get(district);
    entry.assetCount += 1;
    entry.scoreSum += score;
    entry.customers += assetCustomers(asset);
    if (LEVEL_RANK[level] > LEVEL_RANK[entry.riskLevel]) {
      entry.riskLevel = level;
    }
    if (score > assetRiskScore(entry.topAsset)) {
      entry.topAsset = asset;
    }
  }

  for (const entry of byDistrict.values()) {
    entry.meanScore = entry.scoreSum / entry.assetCount;
  }

  return byDistrict;
}

export function districtRiskCounts(districtNames, byDistrict) {
  const counts = { high: 0, medium: 0, low: 0 };
  for (const rawName of districtNames) {
    const name = normalizeDistrictName(rawName);
    const level = byDistrict.get(name)?.riskLevel || 'low';
    counts[level] += 1;
  }
  return counts;
}
