import React, { useMemo, useState } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import indiaStates from '../data/india_states.json';
import { aggregateByState, normalizeStateName, criticalAlerts } from '../dashboardDerived';

const RISK_FILL = {
  high: '#5a2320',
  medium: '#4a3a17',
  low: '#1c3a2c',
};
const RISK_STROKE = {
  high: 'var(--risk-high)',
  medium: 'var(--risk-medium)',
  low: 'var(--risk-low)',
};
const NO_DATA_FILL = '#1a222d';

const WIDTH = 480;
const HEIGHT = 520;

const KIND_ICON = {
  weather: '\u26C8',
  overload: '\u26A1',
  critical: '\u2757',
  watch: '\u26A0',
};

export default function IndiaRiskMap({ assets, selectedAssetId, onSelectAsset }) {
  const [zoom, setZoom] = useState(1);
  const [hoveredState, setHoveredState] = useState(null);
  const [alertsOpen, setAlertsOpen] = useState(true);
  const [advisorOpen, setAdvisorOpen] = useState(true);

  const stateRisk = useMemo(() => aggregateByState(assets), [assets]);
  const alerts = useMemo(() => criticalAlerts(assets, 3), [assets]);
  const topAsset = useMemo(
    () => [...assets].sort((a, b) => b.risk_score - a.risk_score)[0],
    [assets]
  );

  const projection = useMemo(
    () => geoMercator().fitExtent([[14, 14], [WIDTH - 14, HEIGHT - 14]], indiaStates),
    []
  );
  const pathGen = useMemo(() => geoPath(projection), [projection]);

  const markers = useMemo(() => {
    const sorted = [...assets].sort((a, b) => b.risk_score - a.risk_score);
    return sorted.slice(0, 6).map((asset) => {
      const [x, y] = projection([asset.location.lon, asset.location.lat]);
      return { asset, x, y };
    });
  }, [assets, projection]);

  function riskFor(feature) {
    const name = normalizeStateName(feature.properties.NAME_1);
    return stateRisk.get(name);
  }

  return (
    <div className="indiamap">
      <svg
        className="indiamap__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="India grid risk map by state"
      >
        <g style={{ transform: `scale(${zoom})`, transformOrigin: '50% 50%' }}>
          {indiaStates.features.map((feature, i) => {
            const risk = riskFor(feature);
            const level = risk?.riskLevel;
            const isHovered = hoveredState === feature.properties.NAME_1;
            return (
              <path
                key={feature.properties.NAME_1 + i}
                d={pathGen(feature)}
                fill={level ? RISK_FILL[level] : NO_DATA_FILL}
                stroke={isHovered && level ? RISK_STROKE[level] : 'var(--hairline)'}
                strokeWidth={isHovered ? 1.4 : 0.6}
                className="indiamap__state"
                onMouseEnter={() => setHoveredState(feature.properties.NAME_1)}
                onMouseLeave={() => setHoveredState((s) => (s === feature.properties.NAME_1 ? null : s))}
              />
            );
          })}

          {markers.map(({ asset, x, y }) => {
            const isSelected = asset.asset_id === selectedAssetId;
            const color = RISK_STROKE[asset.risk_level] || 'var(--text-2)';
            return (
              <g
                key={asset.asset_id}
                transform={`translate(${x} ${y})`}
                className="indiamap__marker"
                onClick={() => onSelectAsset(asset.asset_id)}
                tabIndex={0}
                role="button"
                aria-label={`${asset.location.name}, risk level ${asset.risk_level}`}
              >
                {isSelected && <circle r="9" fill="none" stroke={color} strokeWidth="1.5" opacity="0.6" />}
                <circle r="5.5" fill={color} stroke="var(--bg-1)" strokeWidth="1.5" />
                <text y="1.5" textAnchor="middle" className="indiamap__marker-text">
                  {asset.risk_level === 'high' ? '!' : ''}
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {hoveredState && riskFor({ properties: { NAME_1: hoveredState } }) && (
        <div className="indiamap__state-tooltip">
          <div className="indiamap__state-tooltip-name">{normalizeStateName(hoveredState)}</div>
          <div className="indiamap__state-tooltip-row">
            <span className={`risk-badge risk-badge--${riskFor({ properties: { NAME_1: hoveredState } }).riskLevel}`}>
              <span className="risk-badge__dot" />
              {riskFor({ properties: { NAME_1: hoveredState } }).riskLevel}
            </span>
            <span>{riskFor({ properties: { NAME_1: hoveredState } }).assetCount} tracked asset(s)</span>
          </div>
        </div>
      )}

      <div className="indiamap__zoom">
        <button type="button" onClick={() => setZoom((z) => Math.min(z + 0.25, 2.5))} aria-label="Zoom in">+</button>
        <button type="button" onClick={() => setZoom((z) => Math.max(z - 0.25, 1))} aria-label="Zoom out">&minus;</button>
      </div>

      <div className="indiamap__legend">
        <div className="riskmap__legend-title">risk level</div>
        <span className="risk-badge risk-badge--high"><span className="risk-badge__dot" />high</span>
        <span className="risk-badge risk-badge--medium"><span className="risk-badge__dot" />medium</span>
        <span className="risk-badge risk-badge--low"><span className="risk-badge__dot" />low</span>
        <div className="riskmap__legend-note">shaded by worst-case asset per state · markers = top 6 by risk</div>
      </div>

      {alertsOpen && (
        <div className="floatcard floatcard--alerts">
          <div className="floatcard__header">
            <span>Critical alerts</span>
            <button type="button" className="floatcard__close" onClick={() => setAlertsOpen(false)} aria-label="Dismiss critical alerts">
              &times;
            </button>
          </div>
          <ul className="floatcard__list">
            {alerts.map((alert) => (
              <li key={alert.id} className={`floatcard__alert floatcard__alert--${alert.severity}`}>
                <span className="floatcard__alert-icon">{KIND_ICON[alert.kind]}</span>
                <span className="floatcard__alert-text">
                  <strong>{alert.label}</strong>
                  <span>{alert.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {advisorOpen && topAsset && (
        <div className="floatcard floatcard--advisor">
          <div className="floatcard__header">
            <span>Outage impact advisor</span>
            <button type="button" className="floatcard__close" onClick={() => setAdvisorOpen(false)} aria-label="Dismiss outage impact advisor">
              &times;
            </button>
          </div>
          <div className="floatcard__body">
            <div className="floatcard__row">
              <span>Estimated duration</span>
              <span>{Math.max(1, Math.round(topAsset.predicted_days_to_failure / 4))} hours</span>
            </div>
            <div className="floatcard__row">
              <span>Affected customers</span>
              <span>{topAsset.customers_affected_estimate.toLocaleString()}</span>
            </div>
            <div className="floatcard__recommend">Recommended actions</div>
            <ul className="floatcard__recommend-list">
              <li>Dispatch inspection crew to {topAsset.location.name}</li>
              <li>Pre-stage mobile generator in {topAsset.location.state}</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
