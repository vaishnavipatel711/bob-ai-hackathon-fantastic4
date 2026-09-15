"""Full pipeline smoke test — run from repo root: python smoke_test.py"""
import sys
sys.path.insert(0, '.')

from src.backend.data.gujarat_assets import GUJARAT_ASSETS, get_gujarat_asset_by_id
from src.backend.data.realtime_simulator import simulator
from src.backend.data.weather_simulator import weather_simulator
from src.backend.models.risk_engine import compute_all_risks
from src.backend.models.district_risk import compute_district_risks
from src.backend.models.crew_planner import generate_crew_recommendations
from src.backend.models.alert_engine import alert_engine

# Get live data
readings = simulator.get_current_readings()
weather = weather_simulator.get_all_weather()

# Compute all risks
risks = compute_all_risks(GUJARAT_ASSETS, readings, weather)

# Run alert engine
alert_engine.process_update(risks, readings, weather, GUJARAT_ASSETS)
alerts = alert_engine.get_active_alerts()

# District risks
district_risks = compute_district_risks(risks, GUJARAT_ASSETS, weather)

# Crew
crew = generate_crew_recommendations(district_risks, risks, GUJARAT_ASSETS)

# Verify risk score structure
sample = list(risks.values())[0]
assert hasattr(sample, 'overall_risk_score'), 'Missing overall_risk_score'
assert hasattr(sample, 'risk_level'), 'Missing risk_level'
assert hasattr(sample, 'contributing_factors'), 'Missing contributing_factors'
assert hasattr(sample, 'recommended_action'), 'Missing recommended_action'
assert hasattr(sample, 'grid_impact_score'), 'Missing grid_impact_score'

# Print summary
risk_levels = {}
for r in risks.values():
    risk_levels[r.risk_level] = risk_levels.get(r.risk_level, 0) + 1

print('=== PIPELINE SMOKE TEST ===')
print(f'Gujarat assets: {len(GUJARAT_ASSETS)}')
print(f'Sensor readings: {len(readings)} (all live)')
print(f'Risk scores computed: {len(risks)}')
print(f'Risk distribution: {risk_levels}')
print(f'Active alerts: {len(alerts)}')
print(f'Districts covered: {len(district_risks)}')
print(f'District names: {sorted(district_risks.keys())}')
print(f'Crew recommendations: {len(crew)}')

# Top 3 highest risk assets
top3 = sorted(risks.values(), key=lambda r: r.overall_risk_score, reverse=True)[:3]
print()
print('Top 3 at-risk assets:')
for r in top3:
    print(f'  {r.asset_id}: score={r.overall_risk_score:.1f} level={r.risk_level} factors={len(r.contributing_factors)}')

# Weather check
print()
sample_wx = list(weather.values())[0]
print(f'Weather districts: {len(weather)}')
print(f'Sample weather: {sample_wx.district} - {sample_wx.condition} risk={sample_wx.weather_risk_score:.2f}')

# WebSocket payload check
import asyncio
from src.backend.api.main import _build_live_payload
payload = asyncio.run(_build_live_payload())
assert payload['type'] == 'live_update'
assert 'data_label' in payload
assert payload['data_label'].startswith('DEMO DATA')
assert len(payload['assets']) == 25
print()
print('WebSocket payload:')
print(f'  type={payload["type"]}')
print(f'  assets={len(payload["assets"])}')
print(f'  alerts={len(payload["alerts"])}')
print(f'  districts={len(payload["district_risks"])}')
print(f'  data_label={payload["data_label"]}')
print()
print('ALL CHECKS PASSED')
