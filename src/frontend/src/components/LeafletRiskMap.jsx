// LeafletRiskMap.jsx — Real Leaflet map of Gujarat with live asset markers.
// Uses react-leaflet v4 with OpenStreetMap tiles.
// Circle markers replace default pins (avoids Vite/webpack icon resolution issues).

import React, { useEffect, useRef, useMemo } from 'react';
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, Polyline, useMap } from 'react-leaflet';
import gujaratDistricts from '../data/gujarat_districts.json';

// ── Risk color helpers ────────────────────────────────────────────────────────
function riskColor(score) {
  if (score > 0.75) return '#ef4444'; // red
  if (score > 0.5) return '#f97316';  // orange
  if (score > 0.3) return '#eab308';  // yellow
  return '#22c55e';                   // green
}

function riskLabel(score) {
  if (score > 0.75) return 'CRITICAL';
  if (score > 0.5) return 'HIGH';
  if (score > 0.3) return 'MEDIUM';
  return 'LOW';
}

function districtColor(districtName, districtRiskMap) {
  const info = districtRiskMap[districtName];
  if (!info) return '#e5e7eb';
  return riskColor(info.max_risk);
}

// ── Mini factor bar (rendered as inline HTML in popup) ───────────────────────
function factorBars(factors = []) {
  return factors
    .slice(0, 3)
    .map((f) => {
      const pct = Math.round(f.weight * 100);
      const color = pct > 40 ? '#ef4444' : pct > 25 ? '#f97316' : '#eab308';
      return `
        <div style="margin-bottom:4px">
          <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:2px">
            <span>${f.factor.replace(/_/g, ' ')}</span><span>${pct}%</span>
          </div>
          <div style="background:#e5e7eb;border-radius:2px;height:5px">
            <div style="background:${color};width:${pct}%;height:5px;border-radius:2px"></div>
          </div>
        </div>`;
    })
    .join('');
}

// ── GeoJSON layer update via useEffect ───────────────────────────────────────
// Leaflet GeoJSON layers don't re-render on prop change, so we use a key
// and re-mount the whole layer when districtRiskMap changes.

// ── Recenter helper ───────────────────────────────────────────────────────────
function MapCenterController({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom, { animate: false });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// ── Transmission lines between major substation pairs ────────────────────────
const TRANSMISSION_PAIRS = [
  ['TX-088', 'TX-104'], // Surat ↔ Anand
  ['TX-104', 'TX-330'], // Anand ↔ Rajkot
  ['TX-330', 'TX-810'], // Rajkot ↔ Jamnagar
  ['TX-720', 'TX-019'], // Gandhinagar ↔ Ahmedabad North
  ['TX-019', 'FD-221'], // Ahmedabad North ↔ Naranpura
  ['TX-501', 'TX-330'], // Junagadh ↔ Rajkot
];

// ── CSS for pulsing critical ring ─────────────────────────────────────────────
const pulseStyle = `
  @keyframes leaflet-pulse {
    0%   { transform: scale(1);   opacity: 0.8; }
    70%  { transform: scale(2.2); opacity: 0;   }
    100% { transform: scale(2.2); opacity: 0;   }
  }
  .leaflet-pulse-ring {
    animation: leaflet-pulse 1.8s ease-out infinite;
  }
`;

// ── Custom pulsing DivIcon for critical markers ────────────────────────────
import L from 'leaflet';

function createPulseIcon(color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      position:relative;width:22px;height:22px;
    ">
      <div class="leaflet-pulse-ring" style="
        position:absolute;top:0;left:0;
        width:22px;height:22px;border-radius:50%;
        border:3px solid ${color};
        box-sizing:border-box;
      "></div>
      <div style="
        position:absolute;top:50%;left:50%;
        transform:translate(-50%,-50%);
        width:12px;height:12px;border-radius:50%;
        background:${color};border:2px solid #fff;
      "></div>
    </div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function LeafletRiskMap({ assets = [], selectedAssetId, onSelectAsset }) {
  const styleInjectedRef = useRef(false);

  // Inject pulse CSS once
  useEffect(() => {
    if (styleInjectedRef.current) return;
    styleInjectedRef.current = true;
    const tag = document.createElement('style');
    tag.textContent = pulseStyle;
    document.head.appendChild(tag);
  }, []);

  // Normalise asset fields — support both nested (mock) and flat (backend) shapes
  const normalised = useMemo(() => assets.map((a) => {
    const lat = a.location?.lat ?? a.latitude ?? null;
    const lon = a.location?.lon ?? a.longitude ?? null;
    const district = a.location?.district ?? a.district ?? '';
    const name = a.location?.name ?? a.name ?? a.asset_id;
    const state = a.location?.state ?? a.state ?? 'Gujarat';
    const rawScore = a.risk_score ?? a.overall_risk_score ?? 0;
    const score = rawScore > 1 ? rawScore / 100 : rawScore;
    const sensor = a.sensor && typeof a.sensor === 'object' ? a.sensor : {
      temperature_c: a.temperature_c ?? null,
      vibration_mm_s: a.vibration_mm_s ?? null,
      oil_bdv_kv: a.oil_bdv_kv ?? null,
      partial_discharge_pc: a.partial_discharge_pc ?? null,
    };
    const weather = a.weather ?? {};
    const factors = Array.isArray(a.contributing_factors) ? a.contributing_factors : [];
    return { ...a, lat, lon, district, name, state, risk_score: score, sensor, weather, contributing_factors: factors, _name: name };
  }), [assets]);

  // Build district risk lookup: name -> { max_risk, risk_level }
  const districtRiskMap = useMemo(() => {
    const map = {};
    normalised.forEach((a) => {
      const d = a.district;
      if (!d) return;
      if (!map[d]) map[d] = { max_risk: 0 };
      map[d].max_risk = Math.max(map[d].max_risk, a.risk_score);
    });
    return map;
  }, [normalised]);

  // Build asset position lookup for transmission lines
  const assetPosMap = useMemo(() => {
    const m = {};
    normalised.forEach((a) => {
      if (a.lat && a.lon) m[a.asset_id] = [a.lat, a.lon];
    });
    return m;
  }, [normalised]);

  // Active alerts from high-risk assets
  const criticalAlerts = useMemo(
    () =>
      [...normalised]
        .filter((a) => a.risk_score > 0.75)
        .sort((a, b) => b.risk_score - a.risk_score)
        .slice(0, 4),
    [normalised]
  );

  // GeoJSON style fn — color by district risk
  const districtStyle = (feature) => {
    const name = feature?.properties?.NAME_2 || '';
    const color = districtColor(name, districtRiskMap);
    return {
      fillColor: color,
      fillOpacity: 0.25,
      color: '#6b7280',
      weight: 1,
    };
  };

  const onEachDistrict = (feature, layer) => {
    const name = feature?.properties?.NAME_2 || 'Unknown';
    const info = districtRiskMap[name];
    const label = info ? `${name}: ${riskLabel(info.max_risk)} (${Math.round(info.max_risk * 100)}%)` : name;
    layer.bindTooltip(label, { sticky: true });
  };

  // A key that changes whenever districtRiskMap changes so GeoJSON re-renders
  const geoKey = useMemo(() => JSON.stringify(Object.values(districtRiskMap).map((v) => Math.round(v.max_risk * 10))), [districtRiskMap]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <MapContainer
        center={[22.5, 71.5]}
        zoom={7}
        style={{ width: '100%', height: '100%', background: '#1a2535' }}
        zoomControl={true}
        scrollWheelZoom={true}
        attributionControl={true}
      >
        <MapCenterController center={[22.5, 71.5]} zoom={7} />

        {/* OpenStreetMap tiles */}
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          maxZoom={18}
        />

        {/* District boundaries coloured by risk */}
        <GeoJSON
          key={geoKey}
          data={gujaratDistricts}
          style={districtStyle}
          onEachFeature={onEachDistrict}
        />

        {/* Transmission lines */}
        {TRANSMISSION_PAIRS.map(([a, b]) => {
          const posA = assetPosMap[a];
          const posB = assetPosMap[b];
          if (!posA || !posB) return null;
          return (
            <TransmissionLine key={`${a}-${b}`} posA={posA} posB={posB} />
          );
        })}

        {/* Asset markers */}
        {normalised.map((asset) => {
          const { lat, lon } = asset;
          if (!lat || !lon) return null;
          const score = asset.risk_score;
          const color = riskColor(score);
          const isCritical = score > 0.75;
          const isSelected = asset.asset_id === selectedAssetId;
          const radius = isSelected ? 14 : isCritical ? 11 : 8;

          return (
            <AssetMarker
              key={asset.asset_id}
              asset={asset}
              color={color}
              radius={radius}
              isCritical={isCritical}
              isSelected={isSelected}
              onSelectAsset={onSelectAsset}
            />
          );
        })}
      </MapContainer>

      {/* Critical Alerts overlay — top-left */}
      {criticalAlerts.length > 0 && (
        <div style={{
          position: 'absolute', top: 10, left: 50, zIndex: 1000,
          background: 'rgba(15,23,42,0.9)', border: '1px solid #ef4444',
          borderRadius: 6, padding: '8px 12px', maxWidth: 240,
          backdropFilter: 'blur(4px)',
        }}>
          <div style={{ color: '#ef4444', fontWeight: 700, fontSize: 11, marginBottom: 6, letterSpacing: '0.05em' }}>
            ⚡ CRITICAL ALERTS
          </div>
          {criticalAlerts.map((a) => (
            <div key={a.asset_id} style={{ fontSize: 11, color: '#f1f5f9', marginBottom: 4, cursor: 'pointer' }}
              onClick={() => onSelectAsset && onSelectAsset(a.asset_id)}>
              <span style={{ color: '#ef4444' }}>●</span> {a._name} — <strong>{Math.round(a.risk_score * 100)}%</strong>
            </div>
          ))}
        </div>
      )}

      {/* Legend — bottom-left */}
      <div style={{
        position: 'absolute', bottom: 28, left: 10, zIndex: 1000,
        background: 'rgba(15,23,42,0.88)', borderRadius: 6, padding: '8px 12px',
        backdropFilter: 'blur(4px)',
      }}>
        <div style={{ color: '#94a3b8', fontSize: 10, marginBottom: 5, fontWeight: 700, letterSpacing: '0.06em' }}>RISK LEVEL</div>
        {[
          { label: 'Critical (>75%)', color: '#ef4444' },
          { label: 'High (51–75%)', color: '#f97316' },
          { label: 'Medium (31–50%)', color: '#eab308' },
          { label: 'Low (≤30%)', color: '#22c55e' },
        ].map(({ label, color }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
            <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
            <span style={{ color: '#e2e8f0', fontSize: 11 }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Transmission line using SVG overlay via Leaflet Polyline ─────────────────
function TransmissionLine({ posA, posB }) {
  return (
    <Polyline
      positions={[posA, posB]}
      pathOptions={{ color: 'rgba(255,255,255,0.3)', weight: 1.5, dashArray: '4 4' }}
    />
  );
}

// ── Asset marker with popup ────────────────────────────────────────────────────
// NOTE: asset here is already normalised (from the normalised array in LeafletRiskMap).
// Fields: lat, lon, district, _name, sensor (always an object), weather (always an object), etc.
function AssetMarker({ asset, color, radius, isCritical, isSelected, onSelectAsset }) {
  const lat = asset.lat;
  const lon = asset.lon;
  const s = asset.sensor || {};
  const w = asset.weather || {};

  const popupContent = `
    <div style="font-family:system-ui,sans-serif;min-width:220px;max-width:260px">
      <div style="font-weight:700;font-size:14px;margin-bottom:2px">${asset._name}</div>
      <div style="font-size:11px;color:#6b7280;margin-bottom:8px">
        ${asset.asset_type?.toUpperCase()} · ${asset.district || asset.state}
      </div>
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
        <span style="font-size:28px;font-weight:800;color:${color};line-height:1">${Math.round(asset.risk_score * 100)}</span>
        <div>
          <div style="font-size:10px;color:#6b7280">RISK SCORE</div>
          <div style="font-size:12px;font-weight:700;color:${color}">${riskLabel(asset.risk_score)}</div>
        </div>
      </div>
      <div style="margin-bottom:8px">
        <div style="font-size:10px;color:#6b7280;margin-bottom:4px;font-weight:600">TOP FACTORS</div>
        ${factorBars(asset.contributing_factors)}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:8px;font-size:11px">
        <div>🌡 ${s.temperature_c ?? '—'}°C</div>
        <div>📳 ${s.vibration_mm_s ?? '—'} mm/s</div>
        <div>⚡ ${s.partial_discharge_pc ?? '—'} pC</div>
        <div>🔋 ${s.oil_bdv_kv ?? '—'} kV BDV</div>
      </div>
      <div style="font-size:11px;color:#6b7280">🌤 ${w.condition ?? '—'} · ${w.wind_kmh ?? '—'} km/h</div>
      <div style="margin-top:8px;padding:6px 8px;border-radius:4px;font-size:11px;font-weight:600;
        background:${color}22;color:${color};border:1px solid ${color}66">
        ${asset.predicted_days_to_failure != null
          ? `Action within ${asset.predicted_days_to_failure}d — ${asset.customers_affected_estimate?.toLocaleString()} customers`
          : 'Monitor'}
      </div>
    </div>
  `;

  return (
    <CircleMarker
      center={[lat, lon]}
      radius={radius}
      pathOptions={{
        fillColor: color,
        fillOpacity: 0.85,
        color: isSelected ? '#fff' : color,
        weight: isSelected ? 3 : isCritical ? 2 : 1,
      }}
      eventHandlers={{
        click: () => onSelectAsset && onSelectAsset(asset.asset_id),
      }}
    >
      <Popup>
        <div dangerouslySetInnerHTML={{ __html: popupContent }} />
      </Popup>
    </CircleMarker>
  );
}
