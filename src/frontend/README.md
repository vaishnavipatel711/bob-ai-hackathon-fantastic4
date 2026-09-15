# Frontend — Grid Risk & Outage Advisor Dashboard

## Quick Start

```bash
cd src/frontend
npm install
npm run dev
```

Open: http://localhost:5173

## Connect to Real Backend

```bash
# Create .env
echo "VITE_API_BASE_URL=http://localhost:8000" > .env
npm run dev
```

When `VITE_API_BASE_URL` is set, the dashboard connects via **WebSocket** to `ws://localhost:8000/ws/live` for live sensor, risk, alert and weather data.

When not set, it runs in **DEMO MODE** with simulated data (clearly labelled).

## Architecture

```
useWebSocket hook (WS + REST polling fallback + mock simulation)
         ↓
useSensorStream hook (annotates assets with risk delta, flash state)
         ↓
┌─────────────────────────────────────────────┐
│ LiveStatusBar — connection + freshness       │
│ ┌────────────────┐  ┌──────────────────────┐ │
│ │ LeafletRiskMap │  │ KeyRiskMetrics       │ │
│ │ Real Gujarat   │  │ DistrictRiskOverview │ │
│ │ lat/lon assets │  │ RiskTrendChart       │ │
│ └────────────────┘  └──────────────────────┘ │
│ AlertPanel (collapsible)                     │
└─────────────────────────────────────────────┘
```

## Components

| Component | Description |
|-----------|-------------|
| `LeafletRiskMap` | Real Leaflet + OpenStreetMap map, district GeoJSON colored by risk, live asset CircleMarkers, popup with sensor data |
| `LiveStatusBar` | LIVE/RECONNECTING/OFFLINE indicator, data freshness timestamps, DEMO badge |
| `AlertPanel` | Live scrollable alert stream with severity icons, risk delta, slide-in animation |
| `AssetDetailPanel` | Full asset detail: sensor gauges, factor bars, weather, recommended action, Ask Bob |
| `RiskTrendChart` | Rolling 1h/6h/24h area chart of High/Medium/Low risk % (live data) |
| `MaintenancePriorities` | Top-10 assets ranked by grid impact, priority color coding |
| `CrewRecommendations` | Crew pre-positioning cards with urgency badges |
| `KeyRiskMetrics` | System reliability, weather impact, equipment health — live computed |
| `DistrictRiskOverview` | Per-district risk count summary |

## Demo Flow (for judges)

1. Open dashboard — see **● LIVE** indicator (mock mode) or real backend
2. Map shows Gujarat with **colored district boundaries** (green → red)
3. Asset markers as **colored circles** — click for full detail popup
4. **DEMO DATA** badge is always visible in mock mode
5. Sensor values change every **5 seconds**
6. Alerts appear automatically when thresholds are crossed
7. Navigate to **Ranked Assets** for maintenance priority table
8. Navigate to **Dispatch Plan** for crew recommendations + Bob Q&A
