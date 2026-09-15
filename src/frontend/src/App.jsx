import React, { useState, useCallback, useMemo } from 'react';
import LeafletRiskMap from './components/LeafletRiskMap.jsx';
import GujaratRiskMap from './components/GujaratRiskMap.jsx';
import RiskPanel from './components/RiskPanel.jsx';
import DispatchPlan from './components/DispatchPlan.jsx';
import KeyRiskMetrics from './components/KeyRiskMetrics.jsx';
import PredictiveAnalysis from './components/PredictiveAnalysis.jsx';
import DistrictRiskOverview from './components/DistrictRiskOverview.jsx';
import LiveStatusBar from './components/LiveStatusBar.jsx';
import AlertPanel from './components/AlertPanel.jsx';
import AssetDetailPanel from './components/AssetDetailPanel.jsx';
import RiskTrendChart from './components/RiskTrendChart.jsx';
import MaintenancePriorities from './components/MaintenancePriorities.jsx';
import CrewRecommendations from './components/CrewRecommendations.jsx';
import useWebSocket from './hooks/useWebSocket.js';
import useSensorStream from './hooks/useSensorStream.js';
import { getDispatchPlan, dataSourceIsMock } from './api';
import { keyRiskMetrics, predictiveSeries, aggregateByDistrict, districtRiskCounts, normalizeDistrictName } from './dashboardDerived';
import gujaratDistricts from './data/gujarat_districts.json';

// ── Small helpers ─────────────────────────────────────────────────────────────
function useClock() {
  const [now, setNow] = React.useState(new Date());
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function BoltIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
      <path d="M11 2 L4 11 h6 L9 18 l7-9 h-6 Z" fill="#22d377" strokeLinejoin="round" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <path d="M10 2a6 6 0 0 1 6 6v3l1.5 2.5H2.5L4 11V8a6 6 0 0 1 6-6z"
        stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
      <path d="M8 15.5a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="7" r="3.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 18c0-3.87 3.13-7 7-7s7 3.13 7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

const NAV_ITEMS = [
  {
    id: 'dashboard',
    label: 'Risk dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <path d="M2 10.5 10 3l8 7.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 9.5V17h12V9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    id: 'list',
    label: 'Ranked assets',
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <path d="M4 5h12M4 10h12M4 15h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'dispatch',
    label: 'Dispatch plan',
    icon: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <path d="M3 13V6a1 1 0 0 1 1-1h7v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M11 8h3.2l2.8 3v2h-6z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <circle cx="6.5" cy="14.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
        <circle cx="14" cy="14.5" r="1.5" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    ),
  },
];

// ── Skeleton / error states ───────────────────────────────────────────────────
function MapSkeleton() {
  return (
    <div className="state-block state-block--center" style={{ height: '100%' }}>
      <div className="skeleton" style={{ width: 180, height: 14 }} />
      <div className="state-block__desc">Loading grid asset telemetry…</div>
    </div>
  );
}

function ListSkeleton() {
  return (
    <div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skeleton skeleton-row" />
      ))}
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  // Live data via WebSocket / mock simulation
  const { data: wsData, connected, reconnecting, lastUpdate, isMock } = useWebSocket();
  const liveAssets = wsData?.assets ?? null;
  const liveAlerts = wsData?.alerts ?? [];
  // Real update ages from the backend system block (null in mock mode — LiveStatusBar falls back gracefully)
  const sensorAgeS  = wsData?.system?.sensor_update_age_s  ?? null;
  const weatherAgeS = wsData?.system?.weather_update_age_s ?? null;

  // Annotate assets with sensor-change metadata
  const annotatedAssets = useSensorStream(liveAssets);

  // Dispatch plan (loaded separately, not streamed)
  const [plan, setPlan] = useState(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState(null);

  const loadPlan = useCallback(async () => {
    setPlanLoading(true);
    setPlanError(null);
    try {
      const data = await getDispatchPlan();
      setPlan(data);
    } catch (err) {
      setPlanError(err.message || 'Unable to reach the dispatch-planning service.');
    } finally {
      setPlanLoading(false);
    }
  }, []);

  React.useEffect(() => { loadPlan(); }, [loadPlan]);

  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [view, setView] = useState('dashboard');
  const [alertsCollapsed, setAlertsCollapsed] = useState(false);
  const [mapError, setMapError] = useState(false);

  const clock = useClock();

  // Auto-select first asset once data arrives
  React.useEffect(() => {
    if (liveAssets && liveAssets.length > 0 && !selectedAssetId) {
      setSelectedAssetId(liveAssets[0].asset_id);
    }
  }, [liveAssets, selectedAssetId]);

  // Gujarat-scoped views — use all assets that have a lat/lon position
  // (all mock + backend assets are Gujarat; state filter was causing empty renders)
  const gujaratAssets = useMemo(
    () => {
      if (annotatedAssets.length === 0) return null;
      // Accept assets that have location.lat/lon OR flat latitude/longitude fields
      const located = annotatedAssets.filter((a) =>
        (a.location?.lat && a.location?.lon) || (a.latitude && a.longitude)
      );
      return located.length > 0 ? located : null;
    },
    [annotatedAssets]
  );
  const gujaratMetrics = useMemo(() => (gujaratAssets ? keyRiskMetrics(gujaratAssets) : null), [gujaratAssets]);
  const gujaratSeries  = useMemo(() => (gujaratAssets ? predictiveSeries(gujaratAssets) : null), [gujaratAssets]);

  const districtCounts = useMemo(() => {
    if (!gujaratAssets) return null;
    const byDistrict = aggregateByDistrict(gujaratAssets);
    const names = gujaratDistricts.features.map((f) => f.properties.NAME_2);
    return districtRiskCounts(names, byDistrict);
  }, [gujaratAssets]);

  const selectedAsset = useMemo(
    () => annotatedAssets.find((a) => a.asset_id === selectedAssetId) ?? null,
    [annotatedAssets, selectedAssetId]
  );

  const highRiskCount = liveAssets ? liveAssets.filter((a) => {
    const raw = a.risk_score ?? a.overall_risk_score ?? 0;
    return (raw > 1 ? raw / 100 : raw) > 0.75;
  }).length : null;

  // Map panel: relative container so AssetDetailPanel can overlay it
  const isLoading = !liveAssets;

  return (
    <div className="app">
      <header className="app__header" style={{ position: 'relative' }}>
        <div className="app__logo"><BoltIcon /></div>

        <div className="app__title-group">
          <h1 className="app__title">Grid Risk &amp; Outage Advisor</h1>
          <span className="app__subtitle">Gujarat · Power Grid Monitoring &amp; Risk Analysis</span>
        </div>

        <div className="app__header-actions">
          <div className="app__live-badge">
            <span className="app__live-dot" />
            {connected ? 'LIVE' : reconnecting ? 'RECONNECTING' : 'OFFLINE'}
          </div>

          {highRiskCount !== null && (
            <span
              className="app__status-item"
              style={{ color: 'var(--risk-high)', borderColor: 'var(--risk-high-bg)', background: 'var(--risk-high-bg)', fontWeight: 600 }}
            >
              ⚠ {highRiskCount} high-risk
            </span>
          )}

          <span className="app__status-item app__status-item--clock">
            {clock.toLocaleTimeString('en-IN', { hour12: false })}
          </span>

          <div className="app__notif-badge">
            <button type="button" className="app__icon-btn" aria-label="Notifications" title="Notifications">
              <BellIcon />
            </button>
          </div>

          <div className="app__avatar" title="Account"><UserIcon /></div>
        </div>
      </header>

      <div className="app__body">
        <nav className="app__nav">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`app__nav-item${view === item.id ? ' app__nav-item--active' : ''}`}
              onClick={() => setView(item.id)}
              aria-label={item.label}
              aria-pressed={view === item.id}
              title={item.label}
            >
              {item.icon}
            </button>
          ))}
        </nav>

        <main className="app__main">
          {/* Live status bar — always visible */}
          <LiveStatusBar
            connected={connected}
            reconnecting={reconnecting}
            lastUpdate={lastUpdate}
            sensorAgeS={sensorAgeS}
            weatherAgeS={weatherAgeS}
            isMock={isMock}
          />

          {/* ── Dashboard view ──────────────────────────────────────────────── */}
          {view === 'dashboard' && (
            <div className="dashboard" style={{ position: 'relative' }}>
              {/* Map cell */}
              <section className="dashboard__map-cell">
                <div className="panel" style={{ position: 'relative', overflow: 'hidden' }}>
                  <div className="panel__header">
                    <h2 className="panel__title">Asset risk map — Gujarat</h2>
                    <span className="panel__meta">{gujaratAssets ? `${gujaratAssets.length} assets` : '—'}</span>
                  </div>
                  <div className="panel__body panel__body--map" style={{ position: 'relative' }}>
                    {isLoading && <MapSkeleton />}
                    {!isLoading && gujaratAssets && !mapError && (
                      <React.Suspense fallback={<MapSkeleton />}>
                        <LeafletRiskMapWithFallback
                          assets={gujaratAssets}
                          selectedAssetId={selectedAssetId}
                          onSelectAsset={setSelectedAssetId}
                          onError={() => setMapError(true)}
                          fallbackAssets={gujaratAssets}
                        />
                      </React.Suspense>
                    )}
                    {!isLoading && gujaratAssets && mapError && (
                      <GujaratRiskMap
                        assets={gujaratAssets}
                        selectedAssetId={selectedAssetId}
                        onSelectAsset={setSelectedAssetId}
                      />
                    )}

                    {/* Asset detail panel overlays the map on the right */}
                    {selectedAsset && (
                      <AssetDetailPanel
                        asset={selectedAsset}
                        onClose={() => setSelectedAssetId(null)}
                      />
                    )}
                  </div>
                </div>
              </section>

              {/* Right sidebar */}
              <section className="dashboard__side-cell">
                {/* Key metrics */}
                <div className="panel">
                  <div className="panel__header">
                    <h2 className="panel__title">Key risk metrics — Gujarat</h2>
                  </div>
                  <div className="panel__body">
                    {isLoading && <ListSkeleton />}
                    {!isLoading && gujaratMetrics && <KeyRiskMetrics metrics={gujaratMetrics} />}
                  </div>
                </div>

                {/* District overview */}
                <div className="panel">
                  <div className="panel__header">
                    <h2 className="panel__title">District risk overview</h2>
                  </div>
                  <div className="panel__body">
                    {isLoading && <ListSkeleton />}
                    {!isLoading && districtCounts && <DistrictRiskOverview counts={districtCounts} />}
                  </div>
                </div>

                {/* Risk trend chart */}
                <div className="panel">
                  <div className="panel__header">
                    <h2 className="panel__title">Risk Trend</h2>
                    <span className="panel__meta">Rolling window</span>
                  </div>
                  <div className="panel__body">
                    <RiskTrendChart assets={gujaratAssets || []} />
                  </div>
                </div>
              </section>

              {/* Alert panel — full width below grid */}
              <section style={{ gridColumn: '1 / -1', marginTop: 0 }}>
                <AlertPanel
                  alerts={liveAlerts}
                  collapsed={alertsCollapsed}
                  onToggle={() => setAlertsCollapsed((c) => !c)}
                />
              </section>
            </div>
          )}

          {/* ── List / ranked assets view ─────────────────────────────────── */}
          {view === 'list' && (
            <section className="app__full-cell" style={{ position: 'relative' }}>
              <div className="panel">
                <div className="panel__header">
                  <h2 className="panel__title">Maintenance priorities — Gujarat</h2>
                  <span className="panel__meta">Top 10 by grid impact</span>
                </div>
                <div className="panel__body" style={{ padding: 0 }}>
                  {isLoading && <ListSkeleton />}
                  {!isLoading && (
                    <MaintenancePriorities
                      assets={annotatedAssets}
                      selectedAssetId={selectedAssetId}
                      onSelectAsset={setSelectedAssetId}
                      onGeneratePlan={() => { setView('dispatch'); loadPlan(); }}
                    />
                  )}
                </div>
              </div>

              {/* Slide-in detail panel */}
              {selectedAsset && (
                <AssetDetailPanel
                  asset={selectedAsset}
                  onClose={() => setSelectedAssetId(null)}
                />
              )}
            </section>
          )}

          {/* ── Dispatch view ─────────────────────────────────────────────── */}
          {view === 'dispatch' && (
            <section className="app__full-cell">
              {/* Crew recommendations */}
              <div className="panel" style={{ marginBottom: 12 }}>
                <div className="panel__header">
                  <h2 className="panel__title">Crew pre-positioning</h2>
                </div>
                <div className="panel__body">
                  <CrewRecommendations />
                </div>
              </div>

              {/* Dispatch plan */}
              <div className="panel">
                <div className="panel__header">
                  <h2 className="panel__title">Dispatch plan</h2>
                  <span className="panel__meta">{plan?.plan ? `${plan.plan.length} steps` : '—'}</span>
                </div>
                <div className="panel__body">
                  {planLoading && <ListSkeleton />}
                  {!planLoading && planError && (
                    <div style={{ color: '#ef4444', fontSize: 12, padding: 8 }}>{planError}</div>
                  )}
                  {!planLoading && !planError && plan?.plan && (
                    <>
                      {plan.summary && (
                        <div style={{
                          background: '#0f2a1a', border: '1px solid #22c55e44',
                          borderLeft: '3px solid #22c55e', borderRadius: 6,
                          padding: '10px 14px', marginBottom: 12,
                          fontSize: 13, color: '#86efac', lineHeight: 1.55,
                        }}>
                          <strong style={{ color: '#22c55e', marginRight: 6 }}>Bob:</strong>
                          {plan.summary}
                        </div>
                      )}
                      <DispatchPlan plan={plan.plan} assets={annotatedAssets} />
                    </>
                  )}
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

// ── Leaflet map with error boundary fallback ────────────────────────────────
class MapErrorBoundary extends React.Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch() { this.props.onError?.(); }
  render() {
    if (this.state.hasError) {
      return (
        <GujaratRiskMap
          assets={this.props.fallbackAssets}
          selectedAssetId={this.props.selectedAssetId}
          onSelectAsset={this.props.onSelectAsset}
        />
      );
    }
    return this.props.children;
  }
}

function LeafletRiskMapWithFallback({ assets, selectedAssetId, onSelectAsset, onError, fallbackAssets }) {
  return (
    <MapErrorBoundary
      onError={onError}
      fallbackAssets={fallbackAssets}
      selectedAssetId={selectedAssetId}
      onSelectAsset={onSelectAsset}
    >
      <LeafletRiskMap
        assets={assets}
        selectedAssetId={selectedAssetId}
        onSelectAsset={onSelectAsset}
      />
    </MapErrorBoundary>
  );
}
