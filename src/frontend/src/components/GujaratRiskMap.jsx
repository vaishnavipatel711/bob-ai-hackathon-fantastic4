import React, { useMemo, useState, useRef, useCallback } from 'react';
import { geoMercator, geoPath } from 'd3-geo';
import gujaratDistricts from '../data/gujarat_districts.json';
import {
  aggregateByDistrict,
  normalizeDistrictName,
  criticalAlerts,
} from '../dashboardDerived';

// Vibrant risk fills matching the reference image color palette
const RISK_FILL = {
  high:   '#c0392b',   // saturated red
  medium: '#d4a017',   // golden yellow
  low:    '#27ae60',   // vibrant green
};
const RISK_FILL_HOVER = {
  high:   '#e74c3c',
  medium: '#f0b429',
  low:    '#2ecc71',
};
const RISK_STROKE = {
  high:   '#ff6b6b',
  medium: '#ffd166',
  low:    '#06d6a0',
};
const NO_DATA_FILL         = '#1e3a2a';
const NO_DATA_FILL_HOVER   = '#254830';

const WIDTH  = 640;
const HEIGHT = 560;

// Substation positions for transmission line overlay
// Key Gujarat substations and their approximate [lon, lat]
const SUBSTATIONS = [
  { id: 'S-KUT', name: 'Bhuj (Kutch)',     lon: 69.67, lat: 23.24 },
  { id: 'S-JAM', name: 'Jamnagar',          lon: 70.06, lat: 22.47 },
  { id: 'S-RJK', name: 'Rajkot',            lon: 70.80, lat: 22.30 },
  { id: 'S-JUN', name: 'Junagadh',          lon: 70.46, lat: 21.52 },
  { id: 'S-BHV', name: 'Bhavnagar',         lon: 71.97, lat: 21.76 },
  { id: 'S-AMD', name: 'Ahmedabad',         lon: 72.58, lat: 23.03 },
  { id: 'S-GAN', name: 'Gandhinagar',       lon: 72.65, lat: 23.22 },
  { id: 'S-BHR', name: 'Bharuch',           lon: 72.46, lat: 21.70 },
  { id: 'S-SUR', name: 'Surat',             lon: 72.83, lat: 21.17 },
  { id: 'S-VAD', name: 'Vadodara',          lon: 73.19, lat: 22.31 },
  { id: 'S-AND', name: 'Anand',             lon: 72.93, lat: 22.56 },
  { id: 'S-MEH', name: 'Mehsana',           lon: 72.97, lat: 23.59 },
  { id: 'S-BAN', name: 'Banaskantha',       lon: 72.43, lat: 24.18 },
];

// Transmission line connections between substation pairs
const TRANSMISSION_LINES = [
  ['S-KUT', 'S-JAM'],
  ['S-JAM', 'S-RJK'],
  ['S-RJK', 'S-JUN'],
  ['S-JUN', 'S-BHV'],
  ['S-RJK', 'S-AMD'],
  ['S-AMD', 'S-GAN'],
  ['S-AMD', 'S-MEH'],
  ['S-MEH', 'S-BAN'],
  ['S-AMD', 'S-AND'],
  ['S-AND', 'S-VAD'],
  ['S-AMD', 'S-BHR'],
  ['S-BHR', 'S-SUR'],
  ['S-BHV', 'S-BHR'],
  ['S-VAD', 'S-SUR'],
];

// Alert icons matching reference (emoji-free SVG paths)
function AlertIcon({ kind, size = 14 }) {
  if (kind === 'weather' || kind === 'critical') {
    // Warning triangle
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <path d="M8 1.5 L15 14 H1 Z" fill="#f04d44" stroke="#f04d44" strokeWidth="0.5" strokeLinejoin="round" />
        <text x="8" y="12" textAnchor="middle" fontSize="8" fontWeight="bold" fill="white">!</text>
      </svg>
    );
  }
  if (kind === 'overload') {
    return (
      <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
        <path d="M8 1.5 L15 14 H1 Z" fill="#f59e0b" stroke="#f59e0b" strokeWidth="0.5" strokeLinejoin="round" />
        <text x="8" y="12" textAnchor="middle" fontSize="8" fontWeight="bold" fill="white">!</text>
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0 }}>
      <path d="M8 1.5 L15 14 H1 Z" fill="#f59e0b" stroke="#f59e0b" strokeWidth="0.5" strokeLinejoin="round" />
      <text x="8" y="12" textAnchor="middle" fontSize="8" fontWeight="bold" fill="white">!</text>
    </svg>
  );
}

export default function GujaratRiskMap({ assets, selectedAssetId, onSelectAsset, highlightedDistrict }) {
  const [hoveredDistrict, setHoveredDistrict] = useState(null);
  const [alertsOpen, setAlertsOpen]           = useState(true);
  const svgRef                                = useRef(null);

  // Use all assets that have a position — both nested (mock) and flat (backend) shapes
  const gujaratAssets = useMemo(
    () => assets.filter((a) =>
      (a.location?.lat && a.location?.lon) || (a.latitude && a.longitude)
    ),
    [assets]
  );

  const byDistrict = useMemo(() => aggregateByDistrict(gujaratAssets), [gujaratAssets]);
  const alerts     = useMemo(() => criticalAlerts(gujaratAssets, 4), [gujaratAssets]);
  const topAsset   = useMemo(() => {
    if (gujaratAssets.length === 0) return null;
    return [...gujaratAssets].sort((a, b) => {
      const sa = (a.risk_score ?? a.overall_risk_score ?? 0);
      const sb = (b.risk_score ?? b.overall_risk_score ?? 0);
      return (sb > 1 ? sb / 100 : sb) - (sa > 1 ? sa / 100 : sa);
    })[0];
  }, [gujaratAssets]);

  const projection = useMemo(
    () => geoMercator().fitExtent([[20, 20], [WIDTH - 20, HEIGHT - 80]], gujaratDistricts),
    []
  );
  const pathGen = useMemo(() => geoPath(projection), [projection]);

  // District labels — only for large-enough districts
  const labelPositions = useMemo(() => {
    return gujaratDistricts.features
      .map((feature) => {
        const area      = pathGen.area(feature);
        const [x, y]    = pathGen.centroid(feature);
        return { feature, area, x, y };
      })
      .filter((d) => d.area > 220 && Number.isFinite(d.x) && Number.isFinite(d.y));
  }, [pathGen]);

  // High-risk flag centroids for warning triangle markers on map
  const highRiskCentroids = useMemo(() => {
    return gujaratDistricts.features
      .map((f) => {
        const name = normalizeDistrictName(f.properties.NAME_2);
        const risk = byDistrict.get(name);
        if (!risk || risk.riskLevel !== 'high') return null;
        const [x, y] = pathGen.centroid(f);
        return { name, x, y };
      })
      .filter(Boolean);
  }, [byDistrict, pathGen]);

  // Project substation coordinates to SVG pixels
  const substationPx = useMemo(() => {
    return SUBSTATIONS.map((s) => {
      const [x, y] = projection([s.lon, s.lat]);
      return { ...s, x, y };
    });
  }, [projection]);

  const substationMap = useMemo(() => {
    const m = {};
    for (const s of substationPx) m[s.id] = s;
    return m;
  }, [substationPx]);

  function riskFor(districtName) {
    return byDistrict.get(normalizeDistrictName(districtName));
  }

  // Relative time label for alerts (static offsets based on risk score)
  function alertTime(i) {
    const offsets = ['1 hour ago', '2 hours ago', '4 hours ago', '6 hours ago'];
    return offsets[i] || '1 hour ago';
  }

  const alertDetail = useCallback((alert, asset) => {
    if (!asset) return alert.detail;
    const w = asset.weather;
    if (w?.condition) return `${w.condition} · ${alertTime(alerts.indexOf(alert))}`;
    return alert.detail;
  }, [alerts]);

  return (
    <div className="gujaratmap-wrap">
      <svg
        ref={svgRef}
        className="gujaratmap__svg"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Gujarat district grid risk map"
      >
        <defs>
          <filter id="glow-high" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* District fills */}
        <g>
          {gujaratDistricts.features.map((feature, i) => {
            const rawName    = feature.properties.NAME_2;
            const name       = normalizeDistrictName(rawName);
            const risk       = riskFor(rawName);
            const level      = risk?.riskLevel;
            const isHovered  = hoveredDistrict === rawName;
            const isHighlighted = highlightedDistrict && highlightedDistrict === name;
            const fill       = level
              ? (isHovered ? RISK_FILL_HOVER[level] : RISK_FILL[level])
              : (isHovered ? NO_DATA_FILL_HOVER : NO_DATA_FILL);
            return (
              <path
                key={rawName + i}
                d={pathGen(feature)}
                fill={fill}
                stroke={isHighlighted ? '#60a5fa' : '#0d1f14'}
                strokeWidth={isHighlighted ? 2.2 : 0.7}
                className="gujaratmap__district"
                style={{ transition: 'fill 0.18s' }}
                onMouseEnter={() => setHoveredDistrict(rawName)}
                onMouseLeave={() => setHoveredDistrict((s) => (s === rawName ? null : s))}
              />
            );
          })}
        </g>

        {/* Transmission lines */}
        <g className="gujaratmap__txlines">
          {TRANSMISSION_LINES.map(([aId, bId], i) => {
            const a = substationMap[aId];
            const b = substationMap[bId];
            if (!a || !b) return null;
            return (
              <line
                key={i}
                x1={a.x} y1={a.y}
                x2={b.x} y2={b.y}
                className="gujaratmap__txline"
              />
            );
          })}
        </g>

        {/* Substation circles */}
        <g className="gujaratmap__substations">
          {substationPx.map((s) => (
            <circle
              key={s.id}
              cx={s.x} cy={s.y} r={3.5}
              className="gujaratmap__substation"
            />
          ))}
        </g>

        {/* District labels */}
        {labelPositions.map(({ feature, x, y }, i) => (
          <text key={`lbl-${i}`} x={x} y={y} className="gujaratmap__district-label">
            {normalizeDistrictName(feature.properties.NAME_2)}
          </text>
        ))}

        {/* High-risk warning triangles */}
        {highRiskCentroids.map(({ name, x, y }) => (
          <g key={name} transform={`translate(${x} ${y - 6})`} className="gujaratmap__flag">
            <polygon
              points="0,-11 9.5,5.5 -9.5,5.5"
              fill="#c0392b"
              stroke="#ff6b6b"
              strokeWidth="1.2"
              strokeLinejoin="round"
              style={{ filter: 'drop-shadow(0 0 4px rgba(240,77,68,0.7))' }}
            />
            <text y="3.5" textAnchor="middle" className="gujaratmap__flag-text">!</text>
          </g>
        ))}

        {/* Asset dots */}
        {gujaratAssets.map((asset) => {
          const lon = asset.location?.lon ?? asset.longitude;
          const lat = asset.location?.lat ?? asset.latitude;
          if (!lon || !lat) return null;
          const [x, y]    = projection([lon, lat]);
          const rawScore   = asset.risk_score ?? asset.overall_risk_score ?? 0;
          const score      = rawScore > 1 ? rawScore / 100 : rawScore;
          const level      = asset.risk_level || (score > 0.75 ? 'high' : score > 0.4 ? 'medium' : 'low');
          const isSelected = asset.asset_id === selectedAssetId;
          const color      = RISK_STROKE[level] || '#8899aa';
          const aname      = asset.location?.name ?? asset.name ?? asset.asset_id;
          return (
            <g
              key={asset.asset_id}
              transform={`translate(${x} ${y})`}
              className="indiamap__marker"
              onClick={() => onSelectAsset(asset.asset_id)}
              tabIndex={0}
              role="button"
              aria-label={`${aname}, risk level ${level}`}
            >
              {isSelected && (
                <circle r={10} fill="none" stroke={color} strokeWidth={1.6} opacity={0.65} />
              )}
              <circle r={4.5} fill="#0d1520" stroke={color} strokeWidth={2} />
            </g>
          );
        })}

        {/* Compass rose */}
        <g transform={`translate(${WIDTH - 44} 42)`}>
          <circle r={18} fill="rgba(10,18,28,0.88)" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
          <path d="M0 -12 L3.5 3 L0 0 L-3.5 3 Z" fill="white" opacity="0.9" />
          <text y="-16" textAnchor="middle" className="gujaratmap__compass-label">N</text>
        </g>

        {/* Scale bar */}
        <g transform={`translate(24 ${HEIGHT - 28})`}>
          <rect x={0} y={-3} width={120} height={6} fill="none" />
          <line x1="0" y1="0" x2="120" y2="0" stroke="rgba(255,255,255,0.45)" strokeWidth={1.5} />
          {[0, 30, 60, 90, 120].map((tick) => (
            <line key={tick} x1={tick} y1="-4" x2={tick} y2="4" stroke="rgba(255,255,255,0.45)" strokeWidth={1} />
          ))}
          {['0', '50', '100', '150', '200 km'].map((label, i) => (
            <text key={label} x={i * 30} y="16" className="gujaratmap__scale-label" textAnchor="middle">
              {label}
            </text>
          ))}
        </g>
      </svg>

      {/* Hover tooltip */}
      {hoveredDistrict && (() => {
        const risk = riskFor(hoveredDistrict);
        return (
          <div className="gmap__tooltip">
            <div className="gmap__tooltip-name">{normalizeDistrictName(hoveredDistrict)}</div>
            {risk ? (
              <>
                <div className="gmap__tooltip-row">
                  <span className={`risk-badge risk-badge--${risk.riskLevel}`}>
                    <span className="risk-badge__dot" />
                    {risk.riskLevel} risk
                  </span>
                  <span>{risk.assetCount} asset(s)</span>
                </div>
                {risk.topAsset && (
                  <div className="gmap__tooltip-meta">
                    {risk.topAsset.location?.name ?? risk.topAsset.name ?? risk.topAsset.asset_id} · score {Math.round((() => { const r = risk.topAsset.risk_score ?? risk.topAsset.overall_risk_score ?? 0; return r > 1 ? r : r * 100; })())}
                  </div>
                )}
              </>
            ) : (
              <div className="gmap__tooltip-row">
                <span className="risk-badge"><span className="risk-badge__dot" style={{ background: 'var(--text-2)' }} />no tracked assets</span>
              </div>
            )}
          </div>
        );
      })()}

      {/* Map legend */}
      <div className="gmap__legend">
        <div className="gmap__legend-title">Grid Risk Level</div>
        <div className="gmap__legend-rows">
          <span className="gmap__legend-item">
            <span className="gmap__legend-dot" style={{ background: RISK_FILL.low }} />Low Risk
          </span>
          <span className="gmap__legend-item">
            <span className="gmap__legend-dot" style={{ background: RISK_FILL.medium }} />Medium Risk
          </span>
          <span className="gmap__legend-item">
            <span className="gmap__legend-dot" style={{ background: RISK_FILL.high }} />High Risk
          </span>
        </div>
        <div className="gmap__legend-rows" style={{ marginTop: 6 }}>
          <span className="gmap__legend-item">
            <span className="gmap__legend-line" />Transmission Line
          </span>
          <span className="gmap__legend-item">
            <span className="gmap__legend-circle" />Substation
          </span>
          <span className="gmap__legend-item">
            <span className="gmap__legend-tri" />Potential Outage
          </span>
        </div>
      </div>

      {/* Critical alerts float card */}
      {alertsOpen && (
        <div className="gmap__alerts">
          <div className="gmap__alerts-header">
            <span className="gmap__alerts-title">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none" style={{ marginRight: 5, verticalAlign: -1 }}>
                <path d="M8 1 L15 14 H1 Z" fill="#f04d44" strokeLinejoin="round" />
                <text x="8" y="12.5" textAnchor="middle" fontSize="8" fontWeight="bold" fill="white">!</text>
              </svg>
              Critical Alerts (Gujarat)
            </span>
            <button
              type="button"
              className="gmap__alerts-close"
              onClick={() => setAlertsOpen(false)}
              aria-label="Dismiss critical alerts"
            >
              ×
            </button>
          </div>
          <ul className="gmap__alerts-list">
            {alerts.map((alert, i) => {
              const asset = gujaratAssets.find((a) => a.asset_id === alert.id);
              const timeStr = alertTime(i);
              return (
                <li key={alert.id} className={`gmap__alert gmap__alert--${alert.severity}`}>
                  <span className="gmap__alert-icon">
                    <AlertIcon kind={alert.kind} size={15} />
                  </span>
                  <span className="gmap__alert-body">
                    <span className="gmap__alert-label">
                      {alert.severity === 'high' ? (
                        <span style={{ color: '#ff6b6b' }}>{alert.label}</span>
                      ) : (
                        <span style={{ color: '#ffd166' }}>{alert.label}</span>
                      )}
                      {' '}— {(asset?.location?.district ?? asset?.district) || alert.detail.split('·')[0].trim()}
                    </span>
                    <span className="gmap__alert-meta">
                      {asset?.weather?.condition || ''} · {timeStr}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
