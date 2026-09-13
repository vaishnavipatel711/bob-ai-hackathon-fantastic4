// Mock data — shape must stay identical to the real backend contract.
// Do not rename fields; teammates' code (and the live backend swap) depends on this shape.

export const MOCK_ASSETS = [
  {
    asset_id: 'TX-104',
    location: { lat: 22.56, lon: 72.93, name: 'Anand Substation 4' },
    asset_type: 'transformer',
    risk_score: 0.87,
    risk_level: 'high',
    contributing_factors: [
      { factor: 'oil_quality', value: 'degraded', weight: 0.4 },
      { factor: 'vibration', value: 'above_threshold', weight: 0.3 },
      { factor: 'weather_forecast', value: 'storm_72h', weight: 0.3 },
    ],
    predicted_days_to_failure: 9,
    customers_affected_estimate: 4200,
  },
  {
    asset_id: 'FD-221',
    location: { lat: 23.03, lon: 72.58, name: 'Naranpura Feeder 2' },
    asset_type: 'feeder',
    risk_score: 0.79,
    risk_level: 'high',
    contributing_factors: [
      { factor: 'load_overcurrent', value: 'sustained_peak', weight: 0.45 },
      { factor: 'age', value: '28_years', weight: 0.25 },
      { factor: 'weather_forecast', value: 'heat_wave', weight: 0.3 },
    ],
    predicted_days_to_failure: 14,
    customers_affected_estimate: 6800,
  },
  {
    asset_id: 'TX-088',
    location: { lat: 21.17, lon: 72.83, name: 'Surat East Substation' },
    asset_type: 'transformer',
    risk_score: 0.61,
    risk_level: 'medium',
    contributing_factors: [
      { factor: 'oil_quality', value: 'moderate', weight: 0.3 },
      { factor: 'maintenance_overdue', value: '46_days', weight: 0.4 },
      { factor: 'vibration', value: 'nominal', weight: 0.1 },
    ],
    predicted_days_to_failure: 26,
    customers_affected_estimate: 3100,
  },
  {
    asset_id: 'BR-317',
    location: { lat: 22.31, lon: 73.19, name: 'Vadodara Ring Breaker 3' },
    asset_type: 'breaker',
    risk_score: 0.58,
    risk_level: 'medium',
    contributing_factors: [
      { factor: 'switch_cycle_count', value: 'high', weight: 0.35 },
      { factor: 'corrosion', value: 'visible', weight: 0.35 },
      { factor: 'weather_forecast', value: 'monsoon_humidity', weight: 0.2 },
    ],
    predicted_days_to_failure: 31,
    customers_affected_estimate: 2450,
  },
  {
    asset_id: 'PL-542',
    location: { lat: 23.22, lon: 72.65, name: 'Gandhinagar Pole Line 5' },
    asset_type: 'pole',
    risk_score: 0.34,
    risk_level: 'low',
    contributing_factors: [
      { factor: 'wood_decay_index', value: 'low', weight: 0.5 },
      { factor: 'lean_angle', value: 'within_spec', weight: 0.2 },
      { factor: 'weather_forecast', value: 'clear', weight: 0.1 },
    ],
    predicted_days_to_failure: 96,
    customers_affected_estimate: 640,
  },
  {
    asset_id: 'TX-019',
    location: { lat: 22.99, lon: 72.5, name: 'Ahmedabad North Substation' },
    asset_type: 'transformer',
    risk_score: 0.22,
    risk_level: 'low',
    contributing_factors: [
      { factor: 'oil_quality', value: 'good', weight: 0.4 },
      { factor: 'vibration', value: 'nominal', weight: 0.3 },
      { factor: 'maintenance_overdue', value: 'none', weight: 0.1 },
    ],
    predicted_days_to_failure: 140,
    customers_affected_estimate: 5100,
  },
  {
    asset_id: 'FD-146',
    location: { lat: 21.7, lon: 72.46, name: 'Bharuch Feeder 1' },
    asset_type: 'feeder',
    risk_score: 0.71,
    risk_level: 'high',
    contributing_factors: [
      { factor: 'load_overcurrent', value: 'peak_exceeded', weight: 0.4 },
      { factor: 'vegetation_contact_risk', value: 'elevated', weight: 0.3 },
      { factor: 'weather_forecast', value: 'storm_72h', weight: 0.3 },
    ],
    predicted_days_to_failure: 11,
    customers_affected_estimate: 5300,
  },
];

const EXPLANATIONS = {
  'TX-104': 'Substation 4 is high priority because oil quality has degraded alongside rising vibration, with a storm forecast within 72 hours.',
  'FD-221': 'Naranpura Feeder 2 is running sustained overcurrent on aging 28-year conductors, and a heat wave will keep peak load elevated through the week.',
  'TX-088': 'Surat East is a medium-priority watch item: routine maintenance is 46 days overdue and oil quality has softened, though vibration remains nominal.',
  'BR-317': 'Ring Breaker 3 shows a high switch-cycle count and visible corrosion on contacts, compounded by incoming monsoon humidity.',
  'PL-542': 'Pole Line 5 is currently low risk — decay index and lean angle are both within spec and the forecast is clear.',
  'TX-019': 'Ahmedabad North is in good standing across oil quality, vibration, and maintenance history — no near-term action required.',
  'FD-146': 'Bharuch Feeder 1 is exceeding peak load capacity with elevated vegetation contact risk, and a storm is forecast within 72 hours.',
};

const PLAN_STEPS = {
  'TX-104': { priority_rank: 1, action: 'Dispatch inspection crew within 24 hours; pre-position repair crew near Anand Substation 4 ahead of the forecasted storm.', eta_hours: 24 },
  'FD-146': { priority_rank: 2, action: 'Schedule load-shedding review and vegetation clearance along Bharuch Feeder 1 before the storm front arrives.', eta_hours: 36 },
  'FD-221': { priority_rank: 3, action: 'Deploy thermal inspection to Naranpura Feeder 2 and prepare a temporary load-transfer plan for the heat wave peak.', eta_hours: 48 },
  'BR-317': { priority_rank: 4, action: 'Queue contact cleaning and corrosion treatment for Ring Breaker 3 ahead of monsoon humidity onset.', eta_hours: 72 },
  'TX-088': { priority_rank: 5, action: 'Assign routine maintenance crew to clear the overdue service window at Surat East Substation.', eta_hours: 120 },
};

export function mockExplain(assetId) {
  const asset = MOCK_ASSETS.find((a) => a.asset_id === assetId);
  const plan_step = PLAN_STEPS[assetId] || {
    priority_rank: null,
    action: 'No immediate dispatch action required; continue routine monitoring.',
    eta_hours: null,
  };
  return {
    asset_id: assetId,
    explanation: EXPLANATIONS[assetId] || (asset ? `${asset.location.name} has a risk score of ${asset.risk_score}.` : 'No explanation available.'),
    plan_step,
  };
}

export function mockDispatchPlan() {
  return Object.keys(PLAN_STEPS)
    .map((assetId) => mockExplain(assetId))
    .sort((a, b) => a.plan_step.priority_rank - b.plan_step.priority_rank);
}

export function mockAsk(question) {
  const q = question.toLowerCase();
  const topAsset = [...MOCK_ASSETS].sort((a, b) => b.risk_score - a.risk_score)[0];
  if (q.includes('highest') || q.includes('top') || q.includes('worst')) {
    return `${topAsset.location.name} (${topAsset.asset_id}) is the highest-priority asset right now, with a risk score of ${topAsset.risk_score} and an estimated ${topAsset.predicted_days_to_failure} days to failure, affecting roughly ${topAsset.customers_affected_estimate.toLocaleString()} customers.`;
  }
  if (q.includes('storm') || q.includes('weather')) {
    const stormAssets = MOCK_ASSETS.filter((a) => a.contributing_factors.some((f) => String(f.value).includes('storm')));
    const names = stormAssets.map((a) => a.location.name).join(', ');
    return `Assets currently flagged against the incoming storm window: ${names}. Recommend pre-positioning repair crews near these sites within the next 24–48 hours.`;
  }
  if (q.includes('customer')) {
    const total = MOCK_ASSETS.reduce((sum, a) => sum + a.customers_affected_estimate, 0);
    return `Across all tracked assets, roughly ${total.toLocaleString()} customers fall within the estimated impact radius if no preventive action is taken.`;
  }
  return `Based on current telemetry, ${topAsset.location.name} remains the top concern (risk score ${topAsset.risk_score}). Ask me about a specific asset ID, the storm-exposed sites, or total customer impact for more detail.`;
}