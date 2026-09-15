// AssetDetailPanel.jsx — slide-in panel showing full detail for a selected asset.
// Updates live when new sensor data arrives.

import React, { useState, useCallback } from 'react';
import { askBob } from '../api';

function riskColor(score) {
  if (score > 0.75) return '#ef4444';
  if (score > 0.5) return '#f97316';
  if (score > 0.3) return '#eab308';
  return '#22c55e';
}

function riskLabel(score) {
  if (score > 0.75) return 'CRITICAL';
  if (score > 0.5) return 'HIGH';
  if (score > 0.3) return 'MEDIUM';
  return 'LOW';
}

function sensorBadge(value, thresholds, unit = '') {
  const [warn, crit] = thresholds;
  const status = value >= crit ? 'CRITICAL' : value >= warn ? 'WARNING' : 'NORMAL';
  const color = value >= crit ? '#ef4444' : value >= warn ? '#f59e0b' : '#22c55e';
  return (
    <span style={{ background: `${color}22`, color, border: `1px solid ${color}55`, borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 700 }}>
      {value}{unit} {status}
    </span>
  );
}

function ProgressBar({ value, max = 100, color }) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <div style={{ background: '#1e293b', borderRadius: 3, height: 6, marginTop: 4 }}>
      <div style={{ width: `${pct}%`, background: color, height: 6, borderRadius: 3, transition: 'width 0.4s ease' }} />
    </div>
  );
}

function RiskGauge({ score }) {
  const pct = Math.round(score * 100);
  const color = riskColor(score);
  // SVG arc gauge
  const r = 42;
  const cx = 56, cy = 56;
  const sweep = (pct / 100) * 251; // 251 ≈ π * r * (180/180)
  const dashArray = `${(pct / 100) * 263} 263`;
  return (
    <div style={{ textAlign: 'center', position: 'relative', width: 112, margin: '0 auto' }}>
      <svg width="112" height="70" viewBox="0 0 112 70">
        <path
          d={`M 14 56 A 42 42 0 0 1 98 56`}
          fill="none" stroke="#1e293b" strokeWidth="10" strokeLinecap="round"
        />
        <path
          d={`M 14 56 A 42 42 0 0 1 98 56`}
          fill="none" stroke={color} strokeWidth="10" strokeLinecap="round"
          strokeDasharray={dashArray}
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div style={{ position: 'absolute', top: 28, left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
        <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{pct}</div>
        <div style={{ fontSize: 9, color: '#64748b', letterSpacing: '0.05em' }}>RISK</div>
      </div>
    </div>
  );
}

function AskBobSection({ asset }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAsk = useCallback(async () => {
    if (!question.trim()) return;
    setLoading(true);
    try {
      const q = `For asset ${asset.asset_id} (${asset.location?.name ?? asset.name ?? asset.asset_id}): ${question}`;
      const res = await askBob(q);
      setAnswer(res.answer || res);
    } catch {
      setAnswer('Unable to reach Ask Bob service.');
    } finally {
      setLoading(false);
    }
  }, [question, asset]);

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 6, letterSpacing: '0.05em' }}>ASK BOB</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          style={{
            flex: 1, background: '#1e293b', border: '1px solid #334155', borderRadius: 4,
            color: '#f1f5f9', fontSize: 12, padding: '5px 8px', outline: 'none',
          }}
          placeholder="Ask about this asset…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleAsk()}
        />
        <button
          onClick={handleAsk}
          disabled={loading}
          style={{
            background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4,
            padding: '5px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
            opacity: loading ? 0.6 : 1,
          }}
        >
          {loading ? '…' : 'Ask'}
        </button>
      </div>
      {answer && (
        <div style={{ marginTop: 8, background: '#1e293b', borderRadius: 4, padding: '8px 10px', fontSize: 12, color: '#94a3b8', lineHeight: 1.5 }}>
          {answer}
        </div>
      )}
    </div>
  );
}

const PRIORITY_COLORS = {
  immediate: '#ef4444',
  '6h': '#f97316',
  '24h': '#eab308',
  routine: '#22c55e',
};

function priorityFromScore(score) {
  if (score > 0.8) return 'immediate';
  if (score > 0.6) return '6h';
  if (score > 0.4) return '24h';
  return 'routine';
}

function actionLabel(score) {
  if (score > 0.8) return 'IMMEDIATE ACTION';
  if (score > 0.6) return 'ACTION WITHIN 6H';
  if (score > 0.4) return 'ACTION WITHIN 24H';
  return 'ROUTINE MONITORING';
}

export default function AssetDetailPanel({ asset, onClose }) {
  if (!asset) return null;

  // Support both nested (mock) and flat (backend) sensor shapes
  const s = asset.sensor && typeof asset.sensor === 'object'
    ? asset.sensor
    : {
        temperature_c:        asset.temperature_c        ?? null,
        vibration_mm_s:       asset.vibration_mm_s       ?? null,
        oil_bdv_kv:           asset.oil_bdv_kv           ?? null,
        partial_discharge_pc: asset.partial_discharge_pc ?? null,
      };
  const w = asset.weather ?? {};
  const rawScore = asset.risk_score ?? asset.overall_risk_score ?? 0;
  const score = rawScore > 1 ? rawScore / 100 : rawScore;
  const color = riskColor(score);
  const priority = priorityFromScore(score);
  const priorityColor = PRIORITY_COLORS[priority];

  // Use the real load_pct field when available (backend flat shape sends it
  // directly on the asset; mock data has it nested under sensor).
  // Only fall back to a temperature-derived estimate when neither is present.
  const rawLoadPct =
    asset.load_pct ??
    s.load_pct ??
    (s.temperature_c != null ? Math.min(100, Math.round((s.temperature_c / 95) * 100)) : null);
  const loadPct = rawLoadPct != null ? rawLoadPct : 0;
  const oilQualityPct = s.oil_bdv_kv ? Math.min(100, Math.round((s.oil_bdv_kv / 80) * 100)) : null;

  return (
    <div style={{
      position: 'absolute', top: 0, right: 0, bottom: 0,
      width: 320, background: '#0f172a',
      borderLeft: '1px solid #1e293b',
      overflowY: 'auto', zIndex: 200,
      animation: 'slideInRight 0.25s ease',
      display: 'flex', flexDirection: 'column',
    }}>
      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(40px); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
      `}</style>

      {/* Header */}
      <div style={{ padding: '12px 14px', borderBottom: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9' }}>
            {asset.location?.name ?? asset.name ?? asset.asset_id}
          </div>
          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
            {asset.asset_type?.toUpperCase()} · {asset.location?.district ?? asset.district ?? asset.location?.state ?? asset.state}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 18, padding: '0 4px' }}>✕</button>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 14px', flex: 1 }}>
        {/* Risk gauge */}
        <RiskGauge score={score} />

        {/* Action badge */}
        <div style={{
          textAlign: 'center', marginTop: 8, marginBottom: 14,
          background: `${priorityColor}22`, color: priorityColor,
          border: `1px solid ${priorityColor}55`,
          borderRadius: 5, padding: '4px 0', fontSize: 12, fontWeight: 700,
        }}>
          {actionLabel(score)}
        </div>

        {/* Sensor readings */}
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8, letterSpacing: '0.05em' }}>SENSOR READINGS</div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
          {/* Temperature */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>🌡 Temperature</span>
              {sensorBadge(s.temperature_c, [65, 80], '°C')}
            </div>
          </div>

          {/* Vibration */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>📳 Vibration</span>
              {sensorBadge(s.vibration_mm_s, [2.0, 3.5], ' mm/s')}
            </div>
          </div>

          {/* Partial discharge */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>⚡ Partial Discharge</span>
              {sensorBadge(s.partial_discharge_pc, [100, 200], ' pC')}
            </div>
          </div>

          {/* Load % (progress bar) */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>🔋 Load</span>
              <span style={{ fontSize: 12, color: color, fontWeight: 700 }}>{loadPct}%</span>
            </div>
            <ProgressBar value={loadPct} color={riskColor(loadPct / 100)} />
          </div>

          {/* Oil quality */}
          {oilQualityPct != null && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontSize: 12, color: '#94a3b8' }}>🛢 Oil Quality</span>
                <span style={{ fontSize: 12, color: oilQualityPct < 50 ? '#ef4444' : oilQualityPct < 70 ? '#f59e0b' : '#22c55e', fontWeight: 700 }}>{oilQualityPct}%</span>
              </div>
              <ProgressBar value={oilQualityPct} color={oilQualityPct < 50 ? '#ef4444' : oilQualityPct < 70 ? '#f59e0b' : '#22c55e'} />
            </div>
          )}
        </div>

        {/* Contributing factors */}
        {asset.contributing_factors?.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8, letterSpacing: '0.05em' }}>CONTRIBUTING FACTORS</div>
            <div style={{ marginBottom: 14 }}>
              {asset.contributing_factors.slice(0, 4).map((f, i) => {
                const pct = Math.round(f.weight * 100);
                const barColor = pct > 40 ? '#ef4444' : pct > 25 ? '#f97316' : '#eab308';
                return (
                  <div key={i} style={{ marginBottom: 7 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 3 }}>
                      <span style={{ color: '#94a3b8' }}>{f.factor.replace(/_/g, ' ')}</span>
                      <span style={{ color: barColor, fontWeight: 700 }}>{pct}%</span>
                    </div>
                    <div style={{ background: '#1e293b', borderRadius: 2, height: 5 }}>
                      <div style={{ width: `${pct}%`, background: barColor, height: 5, borderRadius: 2, transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Weather */}
        <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8, letterSpacing: '0.05em' }}>WEATHER CONDITIONS</div>
        <div style={{ background: '#1e293b', borderRadius: 6, padding: '8px 10px', marginBottom: 14, fontSize: 12 }}>
          <div style={{ color: '#f1f5f9', fontWeight: 600, marginBottom: 4 }}>{w.condition || '—'}</div>
          <div style={{ display: 'flex', gap: 12, color: '#64748b', flexWrap: 'wrap' }}>
            <span>💨 {w.wind_kmh ?? '—'} km/h</span>
            <span>💧 {w.humidity_pct ?? '—'}%</span>
            <span>🌧 {w.rain_mm ?? 0} mm</span>
          </div>
        </div>

        {/* Predicted days to failure */}
        {asset.predicted_days_to_failure != null && (
          <div style={{ marginBottom: 14, background: `${color}11`, border: `1px solid ${color}33`, borderRadius: 6, padding: '8px 12px' }}>
            <div style={{ fontSize: 11, color: '#64748b', marginBottom: 2 }}>EST. DAYS TO FAILURE</div>
            <div style={{ fontSize: 22, fontWeight: 800, color }}>{asset.predicted_days_to_failure}</div>
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                {(asset.customers_affected_estimate ?? asset.customers_served ?? 0).toLocaleString()} customers at risk
            </div>
          </div>
        )}

        {/* Ask Bob */}
        <AskBobSection asset={asset} />
      </div>
    </div>
  );
}
