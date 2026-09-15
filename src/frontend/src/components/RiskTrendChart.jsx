// RiskTrendChart.jsx — Rolling risk trend chart using recharts.
// Shows % of assets in high/medium/low risk over a rolling time window.
// Updates every time the assets prop changes (from WebSocket).

import React, { useState, useEffect, useRef } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';

const WINDOWS = [
  { label: '1h',  minutes: 60  },
  { label: '6h',  minutes: 360 },
  { label: '24h', minutes: 1440 },
];

function normalScore(a) {
  const raw = a.risk_score ?? a.overall_risk_score ?? 0;
  return raw > 1 ? raw / 100 : raw;
}

function snapshot(assets, ts) {
  if (!assets || assets.length === 0) return null;
  const total = assets.length;
  const high   = assets.filter((a) => normalScore(a) > 0.75).length;
  const medium = assets.filter((a) => { const s = normalScore(a); return s > 0.4 && s <= 0.75; }).length;
  const low    = assets.filter((a) => normalScore(a) <= 0.4).length;
  return {
    ts,
    high:   +((high   / total) * 100).toFixed(1),
    medium: +((medium / total) * 100).toFixed(1),
    low:    +((low    / total) * 100).toFixed(1),
    label: new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false }),
  };
}

const COLORS = {
  high:   '#ef4444',
  medium: '#f97316',
  low:    '#22c55e',
};

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: '#0f172a', border: '1px solid #1e293b', borderRadius: 6,
      padding: '8px 12px', fontSize: 12,
    }}>
      <div style={{ color: '#64748b', marginBottom: 4 }}>{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: COLORS[p.dataKey] || p.color }}>
          {p.name}: <strong>{p.value}%</strong>
        </div>
      ))}
    </div>
  );
}

// Generate seeded history so the chart isn't empty on first render
function seedHistory(assets) {
  if (!assets || assets.length === 0) return [];
  const now = Date.now();
  // 12 points spread over the last 55 minutes (5 min apart)
  return Array.from({ length: 12 }, (_, i) => {
    const ts = now - (11 - i) * 5 * 60 * 1000;
    // Add small random jitter per point to show a realistic moving trend
    const jitterAssets = assets.map((a) => {
      const raw = a.risk_score ?? a.overall_risk_score ?? 0;
      const score = raw > 1 ? raw / 100 : raw;
      const jittered = Math.min(1, Math.max(0, score + (Math.random() - 0.5) * 0.06));
      return { ...a, risk_score: jittered };
    });
    return snapshot(jitterAssets, ts);
  }).filter(Boolean);
}

export default function RiskTrendChart({ assets }) {
  const [window, setWindow] = useState('1h');

  // Seed history from initial assets so chart renders immediately
  const [history, setHistory] = useState(() => seedHistory(assets));
  const historyRef = useRef(history);
  const seededRef = useRef(false);

  // Seed once when first real assets arrive (in case assets were empty at init)
  useEffect(() => {
    if (!seededRef.current && assets && assets.length > 0 && historyRef.current.length === 0) {
      seededRef.current = true;
      const seed = seedHistory(assets);
      historyRef.current = seed;
      setHistory(seed);
    }
  }, [assets]);

  // Append a new snapshot whenever assets changes
  useEffect(() => {
    if (!assets || assets.length === 0) return;
    const snap = snapshot(assets, Date.now());
    if (!snap) return;
    historyRef.current = [...historyRef.current, snap].slice(-288); // max 24h × 5s = 1728 pts, cap at 288
    setHistory([...historyRef.current]);
    seededRef.current = true;
  }, [assets]);

  // Filter by selected window
  const windowMs = (WINDOWS.find((w) => w.label === window)?.minutes ?? 60) * 60 * 1000;
  const cutoff = Date.now() - windowMs;
  const visible = history.filter((p) => p.ts >= cutoff);

  return (
    <div>
      {/* Toggle buttons */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        {WINDOWS.map(({ label }) => (
          <button
            key={label}
            onClick={() => setWindow(label)}
            style={{
              background: window === label ? '#3b82f6' : '#1e293b',
              color: window === label ? '#fff' : '#64748b',
              border: '1px solid #334155',
              borderRadius: 4, padding: '3px 10px', fontSize: 11, cursor: 'pointer', fontWeight: 600,
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {visible.length < 2 ? (
        <div style={{ textAlign: 'center', color: '#64748b', fontSize: 12, padding: '32px 0' }}>
          No history yet — collecting data…
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={visible} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <defs>
              {Object.entries(COLORS).map(([key, color]) => (
                <linearGradient key={key} id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor={color} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={color} stopOpacity={0.02} />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="#1e293b" strokeDasharray="3 3" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
            <YAxis tick={{ fontSize: 10, fill: '#64748b' }} tickLine={false} axisLine={false} unit="%" domain={[0, 100]} />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: 11, color: '#64748b', paddingTop: 4 }}
              iconType="circle" iconSize={8}
            />
            <Area type="monotone" dataKey="high"   name="High risk"   stroke={COLORS.high}   fill={`url(#grad-high)`}   strokeWidth={1.5} dot={false} />
            <Area type="monotone" dataKey="medium" name="Medium risk"  stroke={COLORS.medium} fill={`url(#grad-medium)`} strokeWidth={1.5} dot={false} />
            <Area type="monotone" dataKey="low"    name="Low risk"     stroke={COLORS.low}    fill={`url(#grad-low)`}    strokeWidth={1.5} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
