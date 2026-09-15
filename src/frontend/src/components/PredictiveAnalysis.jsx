import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="predictive__tooltip">
      <div className="predictive__tooltip-time">{label}</div>
      {payload.map((p) => (
        <div key={p.dataKey} className="predictive__tooltip-row" style={{ color: p.color }}>
          <span>{p.name}</span>
          <span style={{ fontFamily: 'var(--font-mono)', marginLeft: 12 }}>{p.value}%</span>
        </div>
      ))}
    </div>
  );
}

export default function PredictiveAnalysis({ series }) {
  return (
    <div className="predictive">
      <div className="predictive__legend">
        <span className="predictive__legend-item">
          <span className="predictive__swatch" style={{ background: '#f04d44' }} />
          High
        </span>
        <span className="predictive__legend-item">
          <span className="predictive__swatch" style={{ background: '#f59e0b' }} />
          Medium
        </span>
        <span className="predictive__legend-item">
          <span className="predictive__swatch" style={{ background: '#22d377' }} />
          Low
        </span>
      </div>
      <ResponsiveContainer width="100%" height={170}>
        <AreaChart data={series} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
          <defs>
            <linearGradient id="fillHigh" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#f04d44" stopOpacity={0.55} />
              <stop offset="95%" stopColor="#f04d44" stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id="fillMed" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#f59e0b" stopOpacity={0.45} />
              <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.04} />
            </linearGradient>
            <linearGradient id="fillLow" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#22d377" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#22d377" stopOpacity={0.04} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fill: '#5a6e84', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: '#5a6e84', fontSize: 10, fontFamily: 'var(--font-mono)' }}
            axisLine={false}
            tickLine={false}
            width={30}
            domain={[0, 100]}
            tickFormatter={(v) => `${v}%`}
            ticks={[0, 25, 50, 75, 100]}
          />
          <Tooltip content={<ChartTooltip />} />
          <Area
            type="monotone"
            dataKey="highRisk"
            name="High"
            stroke="#f04d44"
            fill="url(#fillHigh)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="mediumRisk"
            name="Medium"
            stroke="#f59e0b"
            fill="url(#fillMed)"
            strokeWidth={2}
          />
          <Area
            type="monotone"
            dataKey="lowRisk"
            name="Low"
            stroke="#22d377"
            fill="url(#fillLow)"
            strokeWidth={2}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
