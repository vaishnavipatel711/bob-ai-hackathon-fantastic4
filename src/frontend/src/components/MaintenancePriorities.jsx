// MaintenancePriorities.jsx — ranked maintenance list with live data.
// Clicking a row opens AssetDetailPanel via onSelectAsset callback.

import React, { useState, useEffect, useCallback } from 'react';
import { getMaintenancePlan } from '../api';

const PRIORITY_COLORS = {
  immediate: { bg: '#450a0a', text: '#ef4444', border: '#ef4444' },
  '6h':      { bg: '#431407', text: '#f97316', border: '#f97316' },
  '24h':     { bg: '#422006', text: '#eab308', border: '#eab308' },
  routine:   { bg: '#052e16', text: '#22c55e', border: '#22c55e' },
};

function priorityLabel(p) {
  return { immediate: 'IMMEDIATE', '6h': '6H', '24h': '24H', routine: 'ROUTINE' }[p] || p?.toUpperCase();
}

function riskColor(score) {
  if (score > 0.75) return '#ef4444';
  if (score > 0.5) return '#f97316';
  if (score > 0.3) return '#eab308';
  return '#22c55e';
}

export default function MaintenancePriorities({ assets, selectedAssetId, onSelectAsset, onGeneratePlan }) {
  const [plan, setPlan] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getMaintenancePlan();
      setPlan(data);
    } catch (err) {
      setError(err.message || 'Failed to load maintenance plan');
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount and when assets change significantly
  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Also update rows live from passed-in assets prop
  // Normalise both nested (mock) and flat (backend) shapes inline
  const displayRows = assets && assets.length > 0
    ? [...assets]
        .sort((a, b) => {
          const sa = (a.risk_score ?? a.overall_risk_score ?? 0);
          const sb = (b.risk_score ?? b.overall_risk_score ?? 0);
          const na = sa > 1 ? sa / 100 : sa;
          const nb = sb > 1 ? sb / 100 : sb;
          return nb - na;
        })
        .slice(0, 10)
        .map((a, i) => {
          const rawScore = a.risk_score ?? a.overall_risk_score ?? 0;
          const score = rawScore > 1 ? rawScore / 100 : rawScore;
          const district = a.location?.district ?? a.district ?? '—';
          const customers = a.customers_affected_estimate ?? a.customers_served ?? 0;
          const priority = score > 0.8 ? 'immediate' : score > 0.6 ? '6h' : score > 0.4 ? '24h' : 'routine';
          return {
            rank: i + 1,
            asset_id: a.asset_id,
            asset_name: a.location?.name ?? a.name ?? a.asset_id,
            district,
            asset_type: a.asset_type,
            risk_score: score,
            risk_level: a.risk_level,
            customers_affected: customers,
            grid_impact_score: Math.round((score * 0.7 + Math.min(1, customers / 10000) * 0.3) * 100),
            recommended_action: score > 0.8 ? 'Immediate inspection' : score > 0.6 ? 'Inspect within 6h' : score > 0.4 ? 'Inspect within 24h' : 'Routine monitoring',
            priority,
          };
        })
    : plan;

  if (loading && displayRows.length === 0) {
    return <div style={{ color: '#64748b', padding: 16, fontSize: 12 }}>Loading maintenance priorities…</div>;
  }

  if (error && displayRows.length === 0) {
    return <div style={{ color: '#ef4444', padding: 16, fontSize: 12 }}>{error}</div>;
  }

  return (
    <div>
      {/* Table header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '36px 1fr 90px 90px 80px 80px 1fr',
        gap: 8, padding: '6px 12px',
        borderBottom: '1px solid #1e293b',
        fontSize: 10, color: '#475569', fontWeight: 700, letterSpacing: '0.06em',
      }}>
        <span>#</span>
        <span>ASSET</span>
        <span>RISK</span>
        <span>CUSTOMERS</span>
        <span>IMPACT</span>
        <span>PRIORITY</span>
        <span>ACTION</span>
      </div>

      {displayRows.map((row) => {
        const pc = PRIORITY_COLORS[row.priority] || PRIORITY_COLORS.routine;
        const color = riskColor(row.risk_score);
        const isSelected = row.asset_id === selectedAssetId;

        return (
          <div
            key={row.asset_id}
            onClick={() => onSelectAsset && onSelectAsset(row.asset_id)}
            style={{
              display: 'grid',
              gridTemplateColumns: '36px 1fr 90px 90px 80px 80px 1fr',
              gap: 8, padding: '9px 12px',
              borderBottom: '1px solid #0f172a',
              cursor: 'pointer',
              background: isSelected ? '#1e293b' : 'transparent',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = '#172033'; }}
            onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
          >
            {/* Rank */}
            <span style={{ fontSize: 12, color: '#475569', fontWeight: 700, alignSelf: 'center' }}>
              P{row.rank}
            </span>

            {/* Asset name + type */}
            <div style={{ alignSelf: 'center', minWidth: 0 }}>
              <div style={{ fontSize: 12, color: '#f1f5f9', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.asset_id}
              </div>
              <div style={{ fontSize: 10, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {row.district} · {row.asset_type}
              </div>
            </div>

            {/* Risk score */}
            <div style={{ alignSelf: 'center' }}>
              <span style={{ fontSize: 13, fontWeight: 800, color }}>{Math.round(row.risk_score * 100)}%</span>
            </div>

            {/* Customers */}
            <div style={{ alignSelf: 'center', fontSize: 11, color: '#94a3b8' }}>
              {row.customers_affected != null ? (row.customers_affected >= 1000 ? `${(row.customers_affected / 1000).toFixed(0)}k` : row.customers_affected) : '—'}
            </div>

            {/* Grid impact */}
            <div style={{ alignSelf: 'center', fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
              {row.grid_impact_score ?? '—'}
            </div>

            {/* Priority badge */}
            <div style={{ alignSelf: 'center' }}>
              <span style={{
                background: pc.bg, color: pc.text, border: `1px solid ${pc.border}44`,
                borderRadius: 4, padding: '2px 6px', fontSize: 10, fontWeight: 700,
              }}>
                {priorityLabel(row.priority)}
              </span>
            </div>

            {/* Action */}
            <div style={{ alignSelf: 'center', fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {row.recommended_action}
            </div>
          </div>
        );
      })}

    </div>
  );
}
