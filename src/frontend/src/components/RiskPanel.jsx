import React, { useState } from 'react';
import { getAssetExplanation } from '../api';

const RISK_COLOR = {
  high: 'var(--risk-high)',
  medium: 'var(--risk-medium)',
  low: 'var(--risk-low)',
};

function FactorRow({ factor }) {
  return (
    <div className="riskpanel__factor">
      <span>{factor.factor.replace(/_/g, ' ')}</span>
      <div className="riskpanel__factor-track">
        <div className="riskpanel__factor-fill" style={{ width: `${factor.weight * 100}%` }} />
      </div>
      <span>{Math.round(factor.weight * 100)}%</span>
    </div>
  );
}

export default function RiskPanel({ assets, selectedAssetId, onSelectAsset }) {
  const [expandedId, setExpandedId] = useState(null);
  const [explanations, setExplanations] = useState({});
  const [explainLoadingId, setExplainLoadingId] = useState(null);
  const [explainError, setExplainError] = useState(null);

  const sorted = [...assets].sort((a, b) => b.risk_score - a.risk_score);

  async function toggleRow(assetId) {
    if (expandedId === assetId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(assetId);
    onSelectAsset(assetId);
    setExplainError(null);

    if (explanations[assetId]) return;

    await fetchExplanation(assetId);
  }

  async function fetchExplanation(assetId) {
    setExplainLoadingId(assetId);
    setExplainError(null);
    try {
      const data = await getAssetExplanation(assetId);
      setExplanations((prev) => ({ ...prev, [assetId]: data }));
    } catch (err) {
      setExplainError(assetId);
    } finally {
      setExplainLoadingId(null);
    }
  }

  return (
    <div className="riskpanel">
      <ul className="riskpanel__list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {sorted.map((asset, idx) => {
          const isExpanded = expandedId === asset.asset_id;
          const isSelected = selectedAssetId === asset.asset_id;
          const color = RISK_COLOR[asset.risk_level] || 'var(--text-2)';
          return (
            <li
              key={asset.asset_id}
              className="riskpanel__row"
              style={isSelected ? { background: 'var(--bg-2)', borderLeft: `3px solid ${color}` } : { borderLeft: '3px solid transparent' }}
            >
              <button
                type="button"
                className="riskpanel__row-main"
                onClick={() => toggleRow(asset.asset_id)}
                aria-expanded={isExpanded}
              >
                <span className="riskpanel__rank">{String(idx + 1).padStart(2, '0')}</span>

                <span className="riskpanel__asset">
                  <span className="riskpanel__asset-name">{asset.location.name}</span>
                  <span className="riskpanel__asset-meta">
                    {asset.asset_id} · {asset.asset_type}
                  </span>
                </span>

                <span className="riskpanel__score-col">
                  <span className="riskpanel__score-num" style={{ color }}>{asset.risk_score.toFixed(2)}</span>
                  <span className="riskpanel__stat-label" style={{ color }}>{asset.risk_level}</span>
                  <span className="riskpanel__score-bar">
                    <span
                      className="riskpanel__score-fill"
                      style={{ width: `${asset.risk_score * 100}%`, background: color }}
                    />
                  </span>
                </span>

                <span className="riskpanel__stat">
                  {asset.predicted_days_to_failure}d
                  <span className="riskpanel__stat-label">to failure</span>
                </span>

                <svg
                  className={`riskpanel__chevron${isExpanded ? ' riskpanel__chevron--open' : ''}`}
                  width="14"
                  height="14"
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {isExpanded && (
                <div className="riskpanel__why">
                  {explainLoadingId === asset.asset_id && (
                    <div className="riskpanel__why-loading">fetching Bob's explanation…</div>
                  )}

                  {explainError === asset.asset_id && (
                    <div className="riskpanel__why-loading" style={{ color: 'var(--risk-high)' }}>
                      Couldn't load explanation.{' '}
                      <button
                        type="button"
                        className="btn"
                        style={{ marginLeft: 8, padding: '4px 10px' }}
                        onClick={() => fetchExplanation(asset.asset_id)}
                      >
                        Retry
                      </button>
                    </div>
                  )}

                  {explanations[asset.asset_id] && (
                    <>
                      <p className="riskpanel__why-text">{explanations[asset.asset_id].explanation}</p>
                      <div className="riskpanel__factors">
                        {asset.contributing_factors.map((f) => (
                          <FactorRow key={f.factor} factor={f} />
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}