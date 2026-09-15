import React from 'react';

const ROWS = [
  { level: 'high',   label: 'High Risk',   color: '#f04d44', glow: 'rgba(240,77,68,0.5)' },
  { level: 'medium', label: 'Medium Risk',  color: '#f59e0b', glow: 'transparent' },
  { level: 'low',    label: 'Low Risk',     color: '#22d377', glow: 'rgba(34,211,119,0.5)' },
];

export default function DistrictRiskOverview({ counts }) {
  const total = Object.values(counts).reduce((s, v) => s + v, 0) || 1;

  return (
    <div className="dro">
      {ROWS.map((row) => {
        const count = counts[row.level] ?? 0;
        const pct   = Math.round((count / total) * 100);
        return (
          <div key={row.level} className="dro__row">
            <div className="dro__left">
              <span
                className="dro__dot"
                style={{ background: row.color, boxShadow: `0 0 6px ${row.glow}` }}
              />
              <span className="dro__label">{row.label}</span>
            </div>
            <span className="dro__count" style={{ color: row.color }}>{count}</span>
          </div>
        );
      })}
    </div>
  );
}
