// useWebSocket.js — manages a live WebSocket connection to the backend.
// Falls back to REST polling when WS is unavailable.
// In mock mode (VITE_API_BASE_URL not set) returns simulated live data.

import { useState, useEffect, useRef, useCallback } from 'react';
import { MOCK_ASSETS } from '../mockData';

const WS_URL = import.meta.env.VITE_API_BASE_URL
  ? `ws://${new URL(import.meta.env.VITE_API_BASE_URL).host}/ws/live`
  : null;

const REST_BASE = import.meta.env.VITE_API_BASE_URL || null;
const IS_MOCK = !REST_BASE;

// Build a synthetic live snapshot from the mock asset list, jittering values
function buildMockSnapshot(seed) {
  const jitter = (v, pct = 0.05) => +(v * (1 + (Math.random() - 0.5) * pct * 2)).toFixed(2);
  const assets = MOCK_ASSETS.map((a) => ({
    ...a,
    risk_score: Math.min(1, Math.max(0, jitter(a.risk_score, 0.03))),
    sensor: {
      temperature_c: jitter(a.sensor.temperature_c, 0.02),
      vibration_mm_s: jitter(a.sensor.vibration_mm_s, 0.04),
      oil_bdv_kv: jitter(a.sensor.oil_bdv_kv, 0.02),
      partial_discharge_pc: jitter(a.sensor.partial_discharge_pc, 0.05),
    },
  }));

  const alerts = assets
    .filter((a) => a.risk_score > 0.7)
    .slice(0, 5)
    .map((a, i) => ({
      id: `alert-${seed}-${i}`,
      asset_id: a.asset_id,
      asset_name: a.location.name,
      district: a.location.district || a.location.state,
      severity: a.risk_score > 0.85 ? 'critical' : 'warning',
      message: `Risk ${Math.round(a.risk_score * 100)}%: ${a.contributing_factors
        .slice(0, 2)
        .map((f) => f.factor.replace(/_/g, ' '))
        .join(' + ')}`,
      previous_risk: Math.round((a.risk_score - 0.05) * 100),
      current_risk: Math.round(a.risk_score * 100),
      timestamp: new Date().toISOString(),
    }));

  const districtMap = {};
  assets.forEach((a) => {
    // Support both nested mock shape (location.district) and flat backend shape (district)
    const d = a.location?.district ?? a.district;
    if (!d) return;
    if (!districtMap[d]) districtMap[d] = { district: d, count: 0, max_risk: 0 };
    districtMap[d].count += 1;
    districtMap[d].max_risk = Math.max(districtMap[d].max_risk, a.risk_score);
  });
  const district_risks = Object.values(districtMap).map((d) => ({
    ...d,
    risk_level: d.max_risk > 0.75 ? 'critical' : d.max_risk > 0.5 ? 'high' : d.max_risk > 0.3 ? 'medium' : 'low',
  }));

  return {
    assets,
    alerts,
    district_risks,
    weather: { updated_at: new Date().toISOString() },
    system: {
      total_assets: assets.length,
      high_risk: assets.filter((a) => a.risk_score > 0.75).length,
      medium_risk: assets.filter((a) => a.risk_score > 0.4 && a.risk_score <= 0.75).length,
      low_risk: assets.filter((a) => a.risk_score <= 0.4).length,
    },
  };
}

export default function useWebSocket() {
  const [data, setData] = useState(() => (IS_MOCK ? buildMockSnapshot(0) : null));
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(IS_MOCK ? new Date() : null);

  const wsRef = useRef(null);
  const retryDelay = useRef(1000);
  const retryTimer = useRef(null);
  const pollTimer = useRef(null);
  const mockTimer = useRef(null);
  const seedRef = useRef(1);
  const mountedRef = useRef(true);

  // ── Mock mode: simulated updates every 5 s ─────────────────────────────────
  useEffect(() => {
    if (!IS_MOCK) return;
    mockTimer.current = setInterval(() => {
      setData(buildMockSnapshot(seedRef.current++));
      setLastUpdate(new Date());
      setConnected(true);
    }, 5000);
    return () => clearInterval(mockTimer.current);
  }, []);

  // ── REST polling fallback (used when WS keeps failing) ─────────────────────
  const startPolling = useCallback(() => {
    if (IS_MOCK || pollTimer.current) return;
    pollTimer.current = setInterval(async () => {
      try {
        const res = await fetch(`${REST_BASE}/api/assets`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const assets = await res.json();
        if (mountedRef.current) {
          setData((prev) => ({ ...(prev || {}), assets }));
          setLastUpdate(new Date());
        }
      } catch {
        // silently keep polling
      }
    }, 10000);
  }, []);

  const stopPolling = useCallback(() => {
    clearInterval(pollTimer.current);
    pollTimer.current = null;
  }, []);

  // ── WebSocket connect / reconnect ──────────────────────────────────────────
  const connect = useCallback(() => {
    if (IS_MOCK || !WS_URL) return;
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setConnected(true);
      setReconnecting(false);
      setError(null);
      retryDelay.current = 1000;
      stopPolling();
    };

    ws.onmessage = (evt) => {
      if (!mountedRef.current) return;
      try {
        const parsed = JSON.parse(evt.data);
        setData(parsed);
        setLastUpdate(new Date());
      } catch {
        // malformed frame — ignore
      }
    };

    ws.onerror = () => {
      if (!mountedRef.current) return;
      setError('WebSocket error — switching to polling');
      startPolling();
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setConnected(false);
      setReconnecting(true);
      startPolling();
      // exponential backoff, cap at 30 s
      retryTimer.current = setTimeout(() => {
        retryDelay.current = Math.min(retryDelay.current * 2, 30000);
        connect();
      }, retryDelay.current);
    };
  }, [startPolling, stopPolling]);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(retryTimer.current);
      clearInterval(pollTimer.current);
      clearInterval(mockTimer.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { data, connected: IS_MOCK ? true : connected, lastUpdate, error, reconnecting: IS_MOCK ? false : reconnecting, isMock: IS_MOCK };
}
