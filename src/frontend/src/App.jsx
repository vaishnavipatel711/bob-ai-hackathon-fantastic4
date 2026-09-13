import React, { useEffect, useState, useCallback } from 'react';
import RiskMap from './components/RiskMap.jsx';
import RiskPanel from './components/RiskPanel.jsx';
import DispatchPlan from './components/DispatchPlan.jsx';
import { getAssets, getDispatchPlan, dataSourceIsMock } from './api';

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

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

function ErrorState({ message, onRetry }) {
  return (
    <div className="state-block state-block--center state-block--error" style={{ height: '100%' }}>
      <div className="state-block__title">Signal lost</div>
      <div className="state-block__desc">{message}</div>
      <button type="button" className="btn btn--primary" onClick={onRetry}>
        Retry connection
      </button>
    </div>
  );
}

export default function App() {
  const [assets, setAssets] = useState(null);
  const [assetsError, setAssetsError] = useState(null);
  const [assetsLoading, setAssetsLoading] = useState(true);

  const [plan, setPlan] = useState(null);
  const [planError, setPlanError] = useState(null);
  const [planLoading, setPlanLoading] = useState(true);

  const [selectedAssetId, setSelectedAssetId] = useState(null);

  const clock = useClock();

  const loadAssets = useCallback(async () => {
    setAssetsLoading(true);
    setAssetsError(null);
    try {
      const data = await getAssets();
      setAssets(data);
      if (data.length > 0) setSelectedAssetId((prev) => prev ?? data[0].asset_id);
    } catch (err) {
      setAssetsError(err.message || 'Unable to reach the risk-scoring service.');
    } finally {
      setAssetsLoading(false);
    }
  }, []);

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

  useEffect(() => {
    loadAssets();
    loadPlan();
  }, [loadAssets, loadPlan]);

  const highRiskCount = assets ? assets.filter((a) => a.risk_level === 'high').length : null;

  return (
    <div className="app">
      <header className="app__header">
        <div className="app__title-group">
          <h1 className="app__title">Grid Risk &amp; Outage Advisor</h1>
          <span className="app__subtitle">Power outage prediction &amp; equipment failure — Bob AI</span>
        </div>
        <div className="app__status">
          <span className="app__status-item">
            <span className="app__status-dot" />
            {dataSourceIsMock ? 'mock data' : 'live backend'}
          </span>
          {highRiskCount !== null && (
            <span className="app__status-item" style={{ color: 'var(--risk-high)' }}>
              {highRiskCount} high-risk asset{highRiskCount === 1 ? '' : 's'}
            </span>
          )}
          <span className="app__status-item">{clock.toLocaleTimeString('en-IN', { hour12: false })}</span>
        </div>
      </header>

      <main className="app__main">
        <section className="app__map-cell">
          <div className="panel">
            <div className="panel__header">
              <h2 className="panel__title">Asset risk map</h2>
              <span className="panel__meta">{assets ? `${assets.length} assets` : '—'}</span>
            </div>
            <div className="panel__body">
              {assetsLoading && <MapSkeleton />}
              {!assetsLoading && assetsError && <ErrorState message={assetsError} onRetry={loadAssets} />}
              {!assetsLoading && !assetsError && assets && (
                <RiskMap assets={assets} selectedAssetId={selectedAssetId} onSelectAsset={setSelectedAssetId} />
              )}
            </div>
          </div>
        </section>

        <section className="app__panel-cell">
          <div className="panel">
            <div className="panel__header">
              <h2 className="panel__title">Ranked at-risk assets</h2>
              <span className="panel__meta">by risk score</span>
            </div>
            <div className="panel__body">
              {assetsLoading && <ListSkeleton />}
              {!assetsLoading && assetsError && <ErrorState message={assetsError} onRetry={loadAssets} />}
              {!assetsLoading && !assetsError && assets && (
                <RiskPanel assets={assets} selectedAssetId={selectedAssetId} onSelectAsset={setSelectedAssetId} />
              )}
            </div>
          </div>
        </section>

        <section className="app__dispatch-cell">
          <div className="panel">
            <div className="panel__header">
              <h2 className="panel__title">Dispatch plan</h2>
              <span className="panel__meta">{plan ? `${plan.length} steps` : '—'}</span>
            </div>
            <div className="panel__body">
              {planLoading && <ListSkeleton />}
              {!planLoading && planError && <ErrorState message={planError} onRetry={loadPlan} />}
              {!planLoading && !planError && plan && assets && (
                <DispatchPlan plan={plan} assets={assets} />
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}