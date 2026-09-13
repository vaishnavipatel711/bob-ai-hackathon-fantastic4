import React, { useMemo, useState } from 'react';

const RISK_COLOR = {
  high: 'var(--risk-high)',
  medium: 'var(--risk-medium)',
  low: 'var(--risk-low)',
};

const PADDING_PCT = 12;

function buildProjector(assets) {
  const lats = assets.map((a) => a.location.lat);
  const lons = assets.map((a) => a.location.lon);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);

  // Guard against a degenerate (single-point or perfectly aligned) bounding box.
  const latSpan = maxLat - minLat || 1;
  const lonSpan = maxLon - minLon || 1;

  const usable = 100 - PADDING_PCT * 2;

  return (lat, lon) => {
    const xPct = PADDING_PCT + ((lon - minLon) / lonSpan) * usable;
    const yPct = PADDING_PCT + ((maxLat - lat) / latSpan) * usable;
    return { xPct, yPct };
  };
}

function radiusFor(customers) {
  // sqrt scale so area (not radius) tracks customer impact
  const r = 5 + Math.sqrt(customers) * 0.16;
  return Math.min(Math.max(r, 6), 22);
}

export default function RiskMap({ assets, selectedAssetId, onSelectAsset }) {
  const [hoveredId, setHoveredId] = useState(null);

  const project = useMemo(() => buildProjector(assets), [assets]);

  const positioned = useMemo(
    () =>
      assets.map((asset) => ({
        asset,
        ...project(asset.location.lat, asset.location.lon),
        r: radiusFor(asset.customers_affected_estimate),
      })),
    [assets, project]
  );

  const hovered = positioned.find((p) => p.asset.asset_id === hoveredId);

  return (
    <div className="riskmap">
      <svg
        className="riskmap__svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label="Grid asset risk map"
      >
        {/* range reticle, purely atmospheric — grounds the panel as an instrument view */}
        <g opacity="0.5">
          <circle cx="50" cy="50" r="42" fill="none" stroke="var(--hairline)" strokeWidth="0.15" />
          <circle cx="50" cy="50" r="28" fill="none" stroke="var(--hairline)" strokeWidth="0.15" />
          <circle cx="50" cy="50" r="14" fill="none" stroke="var(--hairline)" strokeWidth="0.15" />
        </g>

        {positioned.map(({ asset, xPct, yPct, r }) => {
          const isSelected = asset.asset_id === selectedAssetId;
          const color = RISK_COLOR[asset.risk_level] || 'var(--text-2)';
          return (
            <g
              key={asset.asset_id}
              className={`riskmap__marker${isSelected ? ' riskmap__marker--selected' : ''}`}
              transform={`translate(${xPct} ${yPct})`}
              onClick={() => onSelectAsset(asset.asset_id)}
              onMouseEnter={() => setHoveredId(asset.asset_id)}
              onMouseLeave={() => setHoveredId((id) => (id === asset.asset_id ? null : id))}
              tabIndex={0}
              role="button"
              aria-label={`${asset.location.name}, risk level ${asset.risk_level}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') onSelectAsset(asset.asset_id);
              }}
            >
              {(isSelected || asset.risk_level === 'high') && (
                <circle className="riskmap__marker-ring" r={r / 10 + 1.6} stroke={color} vectorEffect="non-scaling-stroke" />
              )}
              <circle className="riskmap__core" r={r / 10} fill={color} vectorEffect="non-scaling-stroke" />
              <text className="riskmap__label" x={r / 10 + 1.4} y="1" vectorEffect="non-scaling-stroke">
                {asset.asset_id}
              </text>
            </g>
          );
        })}
      </svg>

      {hovered && (
        <div
          className="riskmap__tooltip"
          style={{ left: `${hovered.xPct}%`, top: `${hovered.yPct}%`, marginTop: '-14px' }}
        >
          <div className="riskmap__tooltip-name">{hovered.asset.location.name}</div>
          <div className="riskmap__tooltip-row">
            <span>risk score</span>
            <span>{hovered.asset.risk_score.toFixed(2)}</span>
          </div>
          <div className="riskmap__tooltip-row">
            <span>days to failure</span>
            <span>{hovered.asset.predicted_days_to_failure}</span>
          </div>
          <div className="riskmap__tooltip-row">
            <span>customers</span>
            <span>{hovered.asset.customers_affected_estimate.toLocaleString()}</span>
          </div>
        </div>
      )}

      <div className="riskmap__legend">
        <div className="riskmap__legend-title">risk level</div>
        <span className="risk-badge risk-badge--high"><span className="risk-badge__dot" />high</span>
        <span className="risk-badge risk-badge--medium"><span className="risk-badge__dot" />medium</span>
        <span className="risk-badge risk-badge--low"><span className="risk-badge__dot" />low</span>
      </div>
    </div>
  );
}