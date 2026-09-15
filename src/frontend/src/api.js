// Data-fetching layer.
//
// Day 1 (no backend yet): VITE_API_BASE_URL is unset -> every call resolves
// against the mock fixtures in mockData.js, with a simulated network delay
// so loading states are exercised honestly during rehearsal.
//
// Day 2 (real backend): set VITE_API_BASE_URL in .env to the backend URL.
// That's the one-line change — every function below switches to real
// fetch() calls automatically, same response shape, nothing else to edit.

import { MOCK_ASSETS, mockExplain, mockDispatchPlan, mockAsk } from './mockData';

const BASE_URL = import.meta.env.VITE_API_BASE_URL;
const USE_MOCK = !BASE_URL;

const MOCK_DELAY_MS = 500;

// WebSocket URL — null in mock mode
export const WS_URL = BASE_URL
  ? `ws://${new URL(BASE_URL).host}/ws/live`
  : null;

// Append ?fail=1 to the page URL during rehearsal to force the error state
// on demand, without touching code.
function shouldSimulateFailure() {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('fail') === '1';
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function request(path, options) {
  const res = await fetch(`${BASE_URL}${path}`, options);
  if (!res.ok) {
    throw new Error(`Request to ${path} failed with status ${res.status}`);
  }
  return res.json();
}

// ── Existing endpoints ────────────────────────────────────────────────────────

export async function getAssets() {
  if (USE_MOCK) {
    await delay(MOCK_DELAY_MS);
    if (shouldSimulateFailure()) throw new Error('Simulated network failure (mock mode)');
    return MOCK_ASSETS;
  }
  return request('/assets');
}

export async function getAssetExplanation(assetId) {
  if (USE_MOCK) {
    await delay(350);
    if (shouldSimulateFailure()) throw new Error('Simulated network failure (mock mode)');
    return mockExplain(assetId);
  }
  return request(`/assets/${encodeURIComponent(assetId)}/explain`);
}

export async function getDispatchPlan() {
  if (USE_MOCK) {
    await delay(600);
    if (shouldSimulateFailure()) throw new Error('Simulated network failure (mock mode)');
    // Wrap mock array in the same {summary, plan} shape the backend returns
    const planSteps = mockDispatchPlan();
    return {
      summary: `${planSteps.length} assets prioritised for maintenance and crew dispatch. Crews should respond in priority order to minimise customer impact.`,
      plan: planSteps,
    };
  }
  // Backend returns { summary: string, plan: [...] }
  return request('/plan');
}

export async function askBob(question) {
  if (USE_MOCK) {
    await delay(700);
    if (shouldSimulateFailure()) throw new Error('Simulated network failure (mock mode)');
    return { answer: mockAsk(question) };
  }
  return request('/ask', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question }),
  });
}

// ── New endpoints ─────────────────────────────────────────────────────────────

// GET /api/assets — full asset list with latest sensor readings
export async function getFullAssets() {
  if (USE_MOCK) {
    await delay(MOCK_DELAY_MS);
    return MOCK_ASSETS;
  }
  return request('/api/assets');
}

// GET /api/assets/{id}/history — last-N sensor readings for sparklines
export async function getAssetHistory(id) {
  if (USE_MOCK) {
    await delay(300);
    const asset = MOCK_ASSETS.find((a) => a.asset_id === id);
    if (!asset) return [];
    // Simulate 12 historical readings (one per 5 min)
    return Array.from({ length: 12 }, (_, i) => ({
      timestamp: new Date(Date.now() - (11 - i) * 5 * 60 * 1000).toISOString(),
      risk_score: Math.max(0, Math.min(1, asset.risk_score + (Math.random() - 0.5) * 0.08)),
      temperature_c: asset.sensor.temperature_c + (Math.random() - 0.5) * 4,
    }));
  }
  return request(`/api/assets/${encodeURIComponent(id)}/history`);
}

// GET /api/risk — current risk scores for all assets
export async function getRiskScores() {
  if (USE_MOCK) {
    await delay(300);
    return MOCK_ASSETS.map((a) => ({
      asset_id: a.asset_id,
      risk_score: a.risk_score,
      risk_level: a.risk_level,
    }));
  }
  return request('/api/risk');
}

// GET /api/districts/risk — per-district aggregated risk
export async function getDistrictRisks() {
  if (USE_MOCK) {
    await delay(300);
    const map = {};
    MOCK_ASSETS.filter((a) => a.location.district).forEach((a) => {
      const d = a.location.district;
      if (!map[d]) map[d] = { district: d, assets: 0, max_risk: 0, total_customers: 0 };
      map[d].assets += 1;
      map[d].max_risk = Math.max(map[d].max_risk, a.risk_score);
      map[d].total_customers += a.customers_affected_estimate;
    });
    return Object.values(map).map((d) => ({
      ...d,
      risk_level: d.max_risk > 0.75 ? 'critical' : d.max_risk > 0.5 ? 'high' : d.max_risk > 0.3 ? 'medium' : 'low',
    }));
  }
  return request('/api/districts/risk');
}

// GET /api/alerts — active alerts
export async function getAlerts() {
  if (USE_MOCK) {
    await delay(300);
    return MOCK_ASSETS
      .filter((a) => a.risk_score > 0.6)
      .map((a, i) => ({
        id: `alert-${i}`,
        asset_id: a.asset_id,
        asset_name: a.location.name,
        district: a.location.district || a.location.state,
        severity: a.risk_score > 0.8 ? 'critical' : 'warning',
        message: `Risk ${Math.round(a.risk_score * 100)}%: ${a.contributing_factors
          .slice(0, 2)
          .map((f) => f.factor.replace(/_/g, ' '))
          .join(' + ')}`,
        previous_risk: Math.round((a.risk_score - 0.08) * 100),
        current_risk: Math.round(a.risk_score * 100),
        timestamp: new Date(Date.now() - i * 90000).toISOString(),
      }));
  }
  return request('/api/alerts');
}

// GET /api/maintenance/priorities — ranked maintenance list
export async function getMaintenancePlan() {
  if (USE_MOCK) {
    await delay(400);
    return MOCK_ASSETS
      .filter((a) => a.location.state === 'Gujarat')
      .sort((a, b) => b.risk_score - a.risk_score)
      .slice(0, 10)
      .map((a, i) => ({
        rank: i + 1,
        asset_id: a.asset_id,
        asset_name: a.location.name,
        district: a.location.district,
        asset_type: a.asset_type,
        risk_score: a.risk_score,
        risk_level: a.risk_level,
        customers_affected: a.customers_affected_estimate,
        grid_impact_score: Math.round((a.risk_score * 0.7 + (a.customers_affected_estimate / 10000) * 0.3) * 100),
        recommended_action: a.risk_score > 0.8
          ? 'Immediate inspection'
          : a.risk_score > 0.6
          ? 'Inspect within 6h'
          : a.risk_score > 0.4
          ? 'Inspect within 24h'
          : 'Routine monitoring',
        priority: a.risk_score > 0.8 ? 'immediate' : a.risk_score > 0.6 ? '6h' : a.risk_score > 0.4 ? '24h' : 'routine',
      }));
  }
  return request('/api/maintenance/priorities');
}

// GET /api/crew/recommendations — crew pre-positioning
export async function getCrewRecommendations() {
  if (USE_MOCK) {
    await delay(400);
    return [
      {
        crew_id: 'C-01',
        current_location: 'Ahmedabad',
        recommended_location: 'Kutch',
        reason: '3 critical assets, 12,600 customers at risk (heat wave + overload)',
        urgency: 'immediate',
        assets_covered: ['FD-268'],
      },
      {
        crew_id: 'C-02',
        current_location: 'Surat',
        recommended_location: 'Anand',
        reason: '2 high-risk transformers, storm approaching within 72h',
        urgency: 'immediate',
        assets_covered: ['TX-104'],
      },
      {
        crew_id: 'C-03',
        current_location: 'Vadodara',
        recommended_location: 'Rajkot',
        reason: '7 high-risk assets, 125,000 customers at risk from approaching storm',
        urgency: '6h',
        assets_covered: ['TX-330', 'TX-810'],
      },
      {
        crew_id: 'C-04',
        current_location: 'Gandhinagar',
        recommended_location: 'Bharuch',
        reason: 'Vegetation contact risk elevated, storm forecast within 72h',
        urgency: '6h',
        assets_covered: ['FD-146'],
      },
    ];
  }
  const data = await request('/api/crew/recommendations');
  // Backend wraps the array: { recommendations: [...], data_label, timestamp }
  return Array.isArray(data) ? data : (data.recommendations ?? data);
}

// GET /api/weather — latest weather conditions
export async function getWeather() {
  if (USE_MOCK) {
    await delay(200);
    return {
      updated_at: new Date().toISOString(),
      conditions: [
        { district: 'Kutch', condition: 'Heat Wave', temp_c: 42, wind_kmh: 45, storm_probability: 15 },
        { district: 'Anand', condition: 'Storm Warning', temp_c: 31, wind_kmh: 68, storm_probability: 75 },
        { district: 'Rajkot', condition: 'Unplanned Outage', temp_c: 33, wind_kmh: 55, storm_probability: 65 },
        { district: 'Ahmedabad', condition: 'Heat Wave', temp_c: 41, wind_kmh: 38, storm_probability: 10 },
        { district: 'Surat', condition: 'Storm Approaching', temp_c: 30, wind_kmh: 62, storm_probability: 70 },
      ],
    };
  }
  return request('/api/weather');
}

// GET /api/system/health — overall system health
export async function getSystemHealth() {
  if (USE_MOCK) {
    await delay(150);
    const high = MOCK_ASSETS.filter((a) => a.risk_score > 0.75).length;
    const med = MOCK_ASSETS.filter((a) => a.risk_score > 0.4 && a.risk_score <= 0.75).length;
    const low = MOCK_ASSETS.filter((a) => a.risk_score <= 0.4).length;
    return {
      total_assets: MOCK_ASSETS.length,
      high_risk: high,
      medium_risk: med,
      low_risk: low,
      last_prediction_run: new Date().toISOString(),
      sensor_feed_ok: true,
      weather_feed_ok: true,
    };
  }
  return request('/api/system/health');
}

export const dataSourceIsMock = USE_MOCK;
