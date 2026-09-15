// AlertPanel.jsx — live scrollable alert list.
// Alerts flash in on arrival; INFO alerts auto-dismiss after 60 s.

import React, { useState, useEffect, useRef } from 'react';

function timeAgo(isoString) {
  const secs = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

const SEVERITY_CONFIG = {
  critical: { icon: '🔴', color: '#ef4444', bg: '#450a0a22', border: '#ef444444', label: 'CRITICAL' },
  warning:  { icon: '🟡', color: '#f59e0b', bg: '#451a0322', border: '#f59e0b44', label: 'WARNING'  },
  info:     { icon: '🔵', color: '#3b82f6', bg: '#0c1a3122', border: '#3b82f644', label: 'INFO'     },
};

export default function AlertPanel({ alerts = [], collapsed, onToggle }) {
  const [visible, setVisible] = useState([]);
  const [tick, setTick] = useState(0);
  const seenIds = useRef(new Set());

  // Re-render every 10 s to keep timestamps fresh
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(id);
  }, []);

  // Sync incoming alerts; auto-dismiss INFO after 60 s.
  // Backend serialises Alert.alert_id (snake_case); mock data uses .id.
  // _aid() normalises both so keying and deduplication work in both modes.
  const _aid = (a) => a.alert_id ?? a.id ?? '';

  useEffect(() => {
    setVisible((prev) => {
      const prevMap = Object.fromEntries(prev.map((a) => [_aid(a), a]));
      const merged = alerts.map((a) => {
        const key = _aid(a);
        return {
          ...a,
          _key: key,
          _new: !seenIds.current.has(key),
          _entered: prevMap[key]?._entered ?? Date.now(),
        };
      });
      merged.forEach((a) => seenIds.current.add(a._key));
      // Auto-dismiss INFO alerts older than 60 s
      return merged.filter((a) => {
        if (a.severity === 'info' && Date.now() - a._entered > 60000) return false;
        return true;
      });
    });
  }, [alerts, tick]);

  const cfg = (sev) => SEVERITY_CONFIG[sev] || SEVERITY_CONFIG.info;

  return (
    <div style={{
      background: 'var(--bg-surface, #0f172a)',
      border: '1px solid var(--border, #1e293b)',
      borderRadius: 8,
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', cursor: 'pointer',
          borderBottom: collapsed ? 'none' : '1px solid var(--border, #1e293b)',
        }}
        onClick={onToggle}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#f1f5f9' }}>Live Alerts</span>
          {visible.length > 0 && (
            <span style={{
              background: '#ef4444', color: '#fff',
              borderRadius: 10, padding: '1px 7px', fontSize: 11, fontWeight: 700,
            }}>{visible.length}</span>
          )}
        </div>
        <span style={{ color: '#64748b', fontSize: 12 }}>{collapsed ? '▲ Show' : '▼ Hide'}</span>
      </div>

      {!collapsed && (
        <div style={{ maxHeight: 220, overflowY: 'auto', padding: '4px 0' }}>
          {visible.length === 0 ? (
            <div style={{ padding: '16px', textAlign: 'center', color: '#64748b', fontSize: 13 }}>
              ✓ No active alerts
            </div>
          ) : (
            visible.map((alert) => {
              const c = cfg(alert.severity);
              return (
                <div
                  key={alert._key}
                  style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    padding: '8px 16px',
                    background: alert._new ? c.bg : 'transparent',
                    borderLeft: `3px solid ${c.border}`,
                    marginBottom: 1,
                    animation: alert._new ? 'alertSlideIn 0.3s ease' : 'none',
                    transition: 'background 0.5s ease',
                  }}
                >
                  <span style={{ fontSize: 14, lineHeight: 1.4 }}>{c.icon}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 2 }}>
                      <span style={{ fontWeight: 700, fontSize: 12, color: c.color }}>{c.label}</span>
                      <span style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 600 }}>{alert.asset_name}</span>
                      <span style={{ fontSize: 11, color: '#64748b' }}>{alert.district}</span>
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 3 }}>{alert.message}</div>
                    <div style={{ display: 'flex', gap: 12, fontSize: 11, color: '#64748b' }}>
                      <span>{timeAgo(alert.timestamp)}</span>
                      {alert.previous_risk != null && (
                        <span>
                          <span style={{ color: '#94a3b8' }}>{alert.previous_risk}%</span>
                          {' → '}
                          <strong style={{ color: c.color }}>{alert.current_risk}%</strong>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
          <style>{`
            @keyframes alertSlideIn {
              from { opacity: 0; transform: translateY(-6px); }
              to   { opacity: 1; transform: translateY(0); }
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
