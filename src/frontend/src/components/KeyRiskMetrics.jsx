import React from 'react';

function BarChartIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <rect x="2" y="10" width="4" height="10" rx="1" fill="#22d377" opacity="0.9" />
      <rect x="8" y="6"  width="4" height="14" rx="1" fill="#22d377" opacity="0.75" />
      <rect x="14" y="3" width="4" height="17" rx="1" fill="#22d377" opacity="0.6" />
    </svg>
  );
}

function CloudIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M16 17H6a4 4 0 0 1-.5-7.96A5 5 0 0 1 15 9.5a3.5 3.5 0 0 1 1 6.5z"
        stroke="#aab4c2" strokeWidth="1.5" fill="none" />
      <path d="M13 11q.5-3 3-3" stroke="#aab4c2" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M11 2 L19 5.5V11c0 4-3.5 7.5-8 9-4.5-1.5-8-5-8-9V5.5Z"
        stroke="#22d377" strokeWidth="1.5" fill="none" strokeLinejoin="round" />
      <path d="M8 11l2 2 4-4" stroke="#22d377" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MetricCard({ icon, label, value, trend, trendColor, barPct, barColor }) {
  return (
    <div className="krm__card">
      <div className="krm__card-left">
        <div className="krm__icon">{icon}</div>
        <div className="krm__info">
          <div className="krm__label">{label}</div>
          <div className="krm__value-row">
            <span className="krm__value" style={{ color: barColor }}>{value}</span>
            {trend && (
              <span className="krm__trend" style={{ color: trendColor }}>{trend}</span>
            )}
          </div>
        </div>
      </div>
      <div className="krm__bar-track">
        <div className="krm__bar-fill" style={{ width: `${barPct}%`, background: barColor }} />
      </div>
    </div>
  );
}

export default function KeyRiskMetrics({ metrics }) {
  const relColor = metrics.reliabilityScore >= 70 ? '#22d377' : '#f59e0b';
  const wxColor  = metrics.weatherImpactPct  >  40 ? '#f59e0b' : '#22d377';
  const ehColor  = metrics.equipmentHealthPct >= 70 ? '#22d377' : '#f59e0b';

  return (
    <div className="krm">
      <MetricCard
        icon={<BarChartIcon />}
        label="System Reliability Score"
        value={`${metrics.reliabilityScore}%`}
        trend={metrics.reliabilityScore >= 70 ? 'Improving' : 'Decreasing'}
        trendColor={relColor}
        barPct={metrics.reliabilityScore}
        barColor={relColor}
      />
      <MetricCard
        icon={<CloudIcon />}
        label="Weather Impact Probability"
        value={`${metrics.weatherImpactPct}%`}
        trend={metrics.weatherImpactPct > 40 ? 'Elevated' : 'Steady'}
        trendColor={wxColor}
        barPct={metrics.weatherImpactPct}
        barColor={wxColor}
      />
      <MetricCard
        icon={<ShieldIcon />}
        label="Equipment Health Index"
        value={`${metrics.equipmentHealthPct}%`}
        trend={metrics.equipmentHealthPct >= 80 ? 'Good' : 'Watch'}
        trendColor={ehColor}
        barPct={metrics.equipmentHealthPct}
        barColor={ehColor}
      />
    </div>
  );
}
