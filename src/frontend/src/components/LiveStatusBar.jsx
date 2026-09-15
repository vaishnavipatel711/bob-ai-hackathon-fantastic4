// LiveStatusBar.jsx — connection status bar shown at top of dashboard.
// Shows live/reconnecting/offline state + timing of last data updates.

import React, { useState, useEffect } from 'react';

function timeAgo(date) {
  if (!date) return '—';
  const secs = Math.floor((Date.now() - date.getTime()) / 1000);
  if (secs < 5) return 'just now';
  if (secs < 60) return `${secs}s ago`;
  return `${Math.floor(secs / 60)}m ago`;
}

export default function LiveStatusBar({ connected, reconnecting, lastUpdate, isMock }) {
  const [tick, setTick] = useState(0);

  // Re-render every second to keep "Xs ago" fresh
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  let dotColor, label, dotClass;
  if (reconnecting) {
    dotColor = '#f59e0b';
    label = 'RECONNECTING…';
    dotClass = 'live-bar__dot live-bar__dot--amber';
  } else if (connected) {
    dotColor = '#22c55e';
    label = 'LIVE';
    dotClass = 'live-bar__dot live-bar__dot--green';
  } else {
    dotColor = '#ef4444';
    label = 'OFFLINE — using cached data';
    dotClass = 'live-bar__dot live-bar__dot--red';
  }

  const ago = timeAgo(lastUpdate);

  return (
    <div className="live-bar" style={{
      display: 'flex', alignItems: 'center', gap: 12,
      padding: '5px 16px',
      background: 'var(--bg-surface, #0f172a)',
      borderBottom: '1px solid var(--border, #1e293b)',
      fontSize: 11,
      color: 'var(--text-muted, #64748b)',
      flexWrap: 'wrap',
      minHeight: 32,
    }}>
      {/* Connection indicator */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span className={dotClass} style={{
          width: 8, height: 8, borderRadius: '50%', background: dotColor,
          display: 'inline-block', flexShrink: 0,
          boxShadow: connected && !reconnecting ? `0 0 0 0 ${dotColor}` : 'none',
          animation: connected && !reconnecting ? 'statusPulse 2s ease-out infinite' : 'none',
        }} />
        <span style={{ fontWeight: 700, color: connected && !reconnecting ? '#22c55e' : reconnecting ? '#f59e0b' : '#ef4444', letterSpacing: '0.05em' }}>
          {label}
        </span>
      </div>

      {/* Timing details */}
      <span style={{ color: 'var(--text-muted, #64748b)' }}>|</span>
      <span>Last sensor: <strong style={{ color: '#e2e8f0' }}>{ago}</strong></span>
      <span style={{ color: 'var(--text-muted, #64748b)' }}>|</span>
      <span>Weather: <strong style={{ color: '#e2e8f0' }}>{ago}</strong></span>
      <span style={{ color: 'var(--text-muted, #64748b)' }}>|</span>
      <span>Prediction: <strong style={{ color: '#e2e8f0' }}>{ago}</strong></span>

      {/* Demo mode badge */}
      {isMock && (
        <>
          <span style={{ marginLeft: 'auto', color: 'var(--text-muted, #64748b)' }}>|</span>
          <span style={{
            background: '#1e3a5f', color: '#60a5fa',
            border: '1px solid #3b82f6',
            borderRadius: 4, padding: '1px 8px',
            fontSize: 10, fontWeight: 700, letterSpacing: '0.06em',
            marginLeft: 4,
          }}>
            DEMO DATA — Simulated real-time sensor stream
          </span>
        </>
      )}

      <style>{`
        @keyframes statusPulse {
          0%   { box-shadow: 0 0 0 0 #22c55e88; }
          70%  { box-shadow: 0 0 0 6px #22c55e00; }
          100% { box-shadow: 0 0 0 0 #22c55e00; }
        }
      `}</style>
    </div>
  );
}
