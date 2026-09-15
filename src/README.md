# Grid Risk & Outage Advisor — IBM Bob Hackathon

**Real-time Power Grid Outage Prediction and Equipment Failure Advisory System**

---

## 🚀 Quick Start (5 minutes)

### Terminal 1 — Backend
```bash
pip install -r src/backend/requirements.txt
uvicorn src.backend.api.main:app --reload --port 8000
```

### Terminal 2 — Frontend
```bash
cd src/frontend
npm install
echo "VITE_API_BASE_URL=http://localhost:8000" > .env
npm run dev
```

Open **http://localhost:5173**

> **No API keys needed.** IBM Bob runs in mock mode automatically.
> All sensor data is clearly labelled: `DEMO DATA — Simulated real-time sensor stream`

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    REAL-TIME DATA PIPELINE                      │
│                                                                  │
│  Sensor Simulator (5s)  +  Weather Simulator (30s/district)     │
│            ↓                           ↓                        │
│     Risk Engine (explainable weighted scoring, 0-100)           │
│            ↓                                                     │
│   District Risk Aggregation  +  Alert Engine                    │
│            ↓                           ↓                        │
│   Crew Pre-positioning      Maintenance Priority Ranking        │
│            ↓                                                     │
│   WebSocket /ws/live (5s push)  +  REST /api/* endpoints        │
│            ↓                                                     │
│   React Dashboard ← useWebSocket hook ← Leaflet Map             │
└─────────────────────────────────────────────────────────────────┘
```

---

## System Overview

### What's Real-Time
| Component | Update Cadence |
|-----------|---------------|
| Sensor readings | Every **5 seconds** |
| Risk scores | Every **5 seconds** |
| Alerts | Triggered instantly on threshold crossing |
| Weather | Every **30 seconds** |
| WebSocket push | Every **5 seconds** |
| Map markers | Live, updates on every WS message |

### 25 Gujarat Grid Assets
Covering 15 districts: Kutch, Rajkot, Ahmedabad, Surat, Vadodara, Gandhinagar, Anand, Bharuch, Mehsana, Banaskantha, Jamnagar, Junagadh, Bhavnagar, Navsari, Panchmahal

Each asset has:
- Full sensor telemetry (temperature, vibration, partial discharge, oil quality, load%, voltage, current)
- Historical failure records
- District-level weather impact
- Explainable risk score with contributing factors

### Risk Engine Formula (Transparent, Not Black-Box)

```
Overall Risk (0-100) =
  0.35 × Sensor Risk (PD + temp + vibration + oil)
+ 0.20 × Load Risk (load% + overload)
+ 0.15 × Age Risk (asset age + maintenance overdue)
+ 0.10 × Historical Risk (failures in last 12 months)
+ 0.10 × Weather Risk (storm + wind + lightning)
+ 0.10 × (age maintenance sub-component)

Risk Levels:
  0-30  = LOW (green)
  31-60 = MEDIUM (yellow)
  61-80 = HIGH (orange)
  81-100= CRITICAL (red)
```

Every score includes `contributing_factors` + `risk_explanation`.

---

## Demo Flow (Judge Demonstration)

**Step 1:** Open dashboard → See `● LIVE` indicator + `DEMO DATA` badge + 25 connected assets

**Step 2:** Watch the Leaflet map — Gujarat districts colored by risk level (green/yellow/orange/red), asset circles at real lat/lon

**Step 3:** Sensor values change every 5 seconds. Two assets are always in a "degrading" escalation cycle (LOW → MEDIUM → HIGH → CRITICAL over ~15 minutes)

**Step 4:** When an asset hits HIGH risk:
- Map marker turns orange/red
- Alert appears in Alert Panel: `⚠ Risk increased 42% → 71%`
- Asset moves up in maintenance priority list
- Crew recommendation updates

**Step 5:** Click any asset marker → Full detail popup:
- Current sensor readings with color-coded status
- Risk score gauge with contributing factors bar chart
- Weather conditions
- Recommended action with urgency

**Step 6:** Navigate to "Ranked Assets" → See maintenance priority table ranked by grid impact

**Step 7:** Navigate to "Dispatch Plan" → See crew pre-positioning recommendations + Ask Bob Q&A

---

## API Reference

| Endpoint | Description |
|----------|-------------|
| `WS /ws/live` | Live 5s push: assets + alerts + districts + weather |
| `GET /api/assets` | All 25 assets with current risk |
| `GET /api/assets/{id}` | Single asset with full sensor + risk detail |
| `GET /api/assets/{id}/history` | Sensor history (last 60 min) |
| `GET /api/risk` | All risk scores sorted by severity |
| `GET /api/districts/risk` | All 15 district risk summaries |
| `GET /api/alerts` | Active alerts (most recent first) |
| `GET /api/maintenance/priorities` | Ranked maintenance plan |
| `GET /api/crew/recommendations` | Crew pre-positioning plan |
| `GET /api/weather` | Current weather per district |
| `GET /api/system/health` | System status + data freshness |
| `GET /assets/{id}/explain` | Bob-generated NL risk explanation |
| `GET /plan` | Prioritized maintenance plan (Bob integration) |
| `POST /ask` | Free-text Q&A via IBM Bob |

Swagger UI: **http://localhost:8000/docs**

---

## What Every Dashboard Number Comes From

| Dashboard Metric | Source |
|-----------------|--------|
| System Reliability Score | Live: `1 - mean(risk_scores)` across all 25 assets |
| Weather Impact % | Live: assets with weather_risk > 0.4 / total |
| Equipment Health | Live: `1 - high_risk_count / total` |
| District counts (High/Medium/Low) | Live: aggregated from asset risk scores |
| Risk Trend chart | Live: rolling time series from WebSocket updates |
| Map district colors | Live: highest risk asset in each district |
| Asset marker color | Live: asset's current `risk_level` |
| Alert messages | Live: threshold-triggered by alert engine |
| Maintenance priorities | Live: ranked by `grid_impact_score = fail_prob × customers × criticality` |

**No numbers are hard-coded.**

---

## Environment Variables

```bash
# Backend (src/backend/.env)
IBM_BOB_API_KEY=       # optional — mock mode if not set
IBM_BOB_ENDPOINT=
WATSONX_PROJECT_ID=

# Frontend (src/frontend/.env)
VITE_API_BASE_URL=http://localhost:8000   # set this to connect to backend
```

Without `VITE_API_BASE_URL`, the frontend runs in browser-side demo mode with simulated data.

---

## Project Structure

```
src/
├── backend/
│   ├── data/
│   │   ├── gujarat_assets.py          # 25 real Gujarat assets
│   │   ├── realtime_simulator.py      # Live sensor simulator (5s cadence)
│   │   └── weather_simulator.py       # Per-district weather (30s cadence)
│   ├── models/
│   │   ├── risk_engine.py             # Explainable risk scoring (0-100)
│   │   ├── district_risk.py           # District aggregation
│   │   ├── crew_planner.py            # Crew pre-positioning
│   │   └── alert_engine.py            # Dynamic alert generation
│   ├── bob_integration/
│   │   ├── bob_client.py              # IBM Bob / watsonx API wrapper
│   │   ├── reasoning_engine.py        # NL risk explanations
│   │   └── maintenance_plan_generator.py  # Bob-generated maintenance plans
│   └── api/
│       ├── main.py                    # FastAPI + WebSocket /ws/live
│       └── routes.py                  # All REST endpoints
└── frontend/
    ├── src/
    │   ├── hooks/
    │   │   ├── useWebSocket.js        # WS + REST fallback + mock simulation
    │   │   └── useSensorStream.js     # Risk delta + escalation detection
    │   └── components/
    │       ├── LeafletRiskMap.jsx     # Real Leaflet + OpenStreetMap map
    │       ├── LiveStatusBar.jsx      # Connection status + data freshness
    │       ├── AlertPanel.jsx         # Live alert stream
    │       ├── AssetDetailPanel.jsx   # Per-asset sensor + risk detail
    │       ├── RiskTrendChart.jsx     # Rolling 1h/6h/24h trend chart
    │       ├── MaintenancePriorities.jsx # Ranked maintenance table
    │       └── CrewRecommendations.jsx   # Crew pre-positioning cards
    └── package.json
```
