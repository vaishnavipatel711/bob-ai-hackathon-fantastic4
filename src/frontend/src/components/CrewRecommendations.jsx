// CrewRecommendations.jsx — crew pre-positioning recommendations panel.

import React, { useState, useEffect, useCallback } from 'react';
import { getCrewRecommendations } from '../api';

const URGENCY_COLORS = {
  immediate: { bg: '#450a0a', text: '#ef4444', border: '#ef4444', label: 'IMMEDIATE' },
  '6h':      { bg: '#431407', text: '#f97316', border: '#f97316', label: '6H'        },
  '24h':     { bg: '#422006', text: '#eab308', border: '#eab308', label: '24H'       },
  routine:   { bg: '#052e16', text: '#22c55e', border: '#22c55e', label: 'ROUTINE'   },
};

function CrewCard({ crew }) {
  const uc = URGENCY_COLORS[crew.urgency] || URGENCY_COLORS.routine;
  return (
    <div style={{
      background: '#1e293b',
      border: '1px solid #334155',
      borderLeft: `3px solid ${uc.border}`,
      borderRadius: 6,
      padding: '10px 14px',
      marginBottom: 8,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div>
          <span style={{ fontWeight: 700, fontSize: 13, color: '#f1f5f9' }}>Crew {crew.crew_id}</span>
          <span style={{ fontSize: 12, color: '#64748b', marginLeft: 8 }}>
            {crew.current_location} → <strong style={{ color: '#e2e8f0' }}>{crew.recommended_location}</strong>
          </span>
        </div>
        <span style={{
          background: uc.bg, color: uc.text, border: `1px solid ${uc.border}55`,
          borderRadius: 4, padding: '2px 8px', fontSize: 10, fontWeight: 700, flexShrink: 0,
        }}>
          {uc.label}
        </span>
      </div>
      <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: crew.assets_covered?.length ? 6 : 0 }}>
        {crew.reason}
      </div>
      {crew.assets_covered?.length > 0 && (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
          {crew.assets_covered.map((id) => (
            <span key={id} style={{
              background: '#0f172a', color: '#64748b', border: '1px solid #334155',
              borderRadius: 3, padding: '1px 6px', fontSize: 10,
            }}>
              {id}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CrewRecommendations() {
  const [crews, setCrews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getCrewRecommendations();
      setCrews(data);
    } catch (err) {
      setError(err.message || 'Failed to load crew recommendations');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (loading && crews.length === 0) {
    return <div style={{ color: '#64748b', padding: 12, fontSize: 12 }}>Loading crew recommendations…</div>;
  }

  if (error) {
    return <div style={{ color: '#ef4444', padding: 12, fontSize: 12 }}>{error}</div>;
  }

  if (crews.length === 0) {
    return <div style={{ color: '#64748b', padding: 12, fontSize: 12 }}>No crew repositioning required at this time.</div>;
  }

  return (
    <div>
      {crews.map((crew) => (
        <CrewCard key={crew.crew_id} crew={crew} />
      ))}
      <button
        onClick={load}
        disabled={loading}
        style={{
          background: 'transparent', color: '#3b82f6', border: '1px solid #1e40af',
          borderRadius: 5, padding: '5px 14px', fontSize: 11, cursor: 'pointer',
          marginTop: 4, opacity: loading ? 0.6 : 1,
        }}
      >
        {loading ? 'Refreshing…' : '↻ Refresh recommendations'}
      </button>
    </div>
  );
}
