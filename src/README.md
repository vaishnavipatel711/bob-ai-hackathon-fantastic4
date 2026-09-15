# Grid Risk & Outage Advisor — IBM Bob Hackathon

**Real-time Power Grid Outage Prediction and Equipment Failure Advisory System**

---

## 🚀 Quick Start (5 minutes)

### Terminal 1 — Backend
```bash
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\Activate.ps1
pip install -r src/backend/requirements.txt
uvicorn src.backend.api.main:app --reload --port 8000
```

### Terminal 2 — Frontend
```bash
cd src/frontend
npm install
cp .env.example .env            # already contains VITE_API_BASE_URL=http://localhost:8000
npm run dev
```

Open **http://localhost:5173**

> **No API keys needed.** IBM Bob runs in mock mode automatically.
> All sensor data is clearly labelled: `DEMO DATA — Simulated real-time sensor stream`

Full setup instructions: [`docs/setup-guide.md`](../docs/setup-guide.md)

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
Covering 15 districts: Kutch, Rajkot, Ahmedabad, Surat, Vadodara, Gandhinagar, Anand,
Bharuch, Mehsana, Banaskantha, Jamnagar, Junagadh, Bhavnagar, Navsari, Panchmahal

Each asset has:
- Full sensor telemetry (temperature, vibration, partial discharge, oil quality, load%, voltage, current)
- Historical failure records
- District-level weather impact
- Explainable risk score with contributing factors

### Risk Engine (Transparent, Not Black-Box)

Weights differ by asset type:

| Component | Transformer / Substation | Feeder / Switchgear / Line |
|---|---|---|
| Sensor risk (PD + temp + vibration + oil) | **0.35** | 0.30 |
| Load risk (load% vs. rated capacity) | 0.20 | **0.25** |
| Age / maintenance risk | **0.25** | 0.20 |
| Historical failures (last 12 months) | 0.10 | 0.10 |
| Weather risk (storm + wind + lightning) | 0.10 | **0.15** |

Risk levels: **0–30 = LOW · 31–60 = MEDIUM · 61–80 = HIGH · 81–100 = CRITICAL**

Every score includes `contributing_factors` (per-signal breakdown) + `risk_explanation` (plain text).

---

## Demo Flow (Judge Demonstration)

**Step 1:** Open dashboard → See `● LIVE` indicator + `DEMO DATA` badge + 25 connected assets

**Step 2:** Watch the Leaflet map — Gujarat districts colored by risk level (green/yellow/orange/red),
asset circles at real lat/lon coordinates

**Step 3:** Sensor values change every 5 seconds. Two assets are always in a "degrading"
escalation cycle (LOW → MEDIUM → HIGH → CRITICAL over ~15 minutes)

**Step 4:** When an asset hits HIGH risk:
- Map marker turns orange/red
- Alert appears in Alert Panel: `⚠ Risk increased 42% → 71%`
- Asset moves up in maintenance priority list
- Crew recommendation updates

**Step 5:** Click any asset marker → Full detail popup:
- Current sensor readings with color-coded status
- Risk score gauge with contributing factors bar chart
- Weather conditions for the asset's district
- Recommended action with urgency

**Step 6:** Navigate to "Ranked Assets" → See maintenance priority table ranked by grid impact

**Step 7:** Navigate to "Dispatch Plan" → See IBM Bob–generated crew dispatch plan + Ask Bob Q&A

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| WS | `/ws/live` | Live 5s push: assets + alerts + districts + weather |
| GET | `/api/assets` | All 25 assets with current risk and sensor data |
| GET | `/api/assets/{id}` | Single asset with full sensor + risk detail |
| GET | `/api/assets/{id}/history` | Sensor history (last 60 min, configurable) |
| GET | `/api/risk` | All risk scores sorted by severity |
| GET | `/api/risk/{id}` | Single asset risk breakdown |
| GET | `/api/districts/risk` | All 15 district risk summaries |
| GET | `/api/alerts` | Active alerts (most recent first) |
| GET | `/api/maintenance/priorities` | Assets ranked by grid impact score |
| GET | `/api/crew/recommendations` | Crew pre-positioning plan |
| GET | `/api/weather` | Current weather per district |
| GET | `/api/system/health` | System status + data freshness |
| GET | `/assets/{id}/explain` | IBM Bob NL risk explanation (legacy) |
| GET | `/plan` | Prioritized dispatch plan via IBM Bob (`?top_n=` 1–50) |
| POST | `/ask` | Free-text Q&A via IBM Bob |

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

### Backend (`src/.env` — copy from `src/.env.example`)

| Variable | Default | Description |
|---|---|---|
| `IBM_BOB_API_KEY` | _(unset)_ | watsonx.ai API key — mock mode if not set |
| `IBM_BOB_ENDPOINT` | us-south watsonx URL | watsonx.ai text generation endpoint |
| `WATSONX_PROJECT_ID` | _(unset)_ | watsonx.ai project ID |
| `WATSONX_MODEL_ID` | `ibm/granite-13b-instruct-v2` | Granite model variant |
| `WEATHER_API_KEY` | _(unset)_ | OpenWeatherMap key — simulator used if not set |
| `WEATHER_API_BASE_URL` | openweathermap.org | OpenWeatherMap base URL |
| `BACKEND_PORT` | `8000` | uvicorn port (informational — pass directly to uvicorn) |
| `FRONTEND_URL` | `http://localhost:5173` | Frontend origin for CORS tightening |

### Frontend (`src/frontend/.env` — copy from `src/frontend/.env.example`)

| Variable | Description |
|---|---|
| `VITE_API_BASE_URL` | Backend URL (e.g. `http://localhost:8000`) — required for live data |

Without `VITE_API_BASE_URL`, the frontend runs in browser-side demo mode with simulated data.

---

## Project Structure

```
src/
├── .env.example                       # All backend env vars with descriptions
├── README.md                          # This file
│
├── backend/
│   ├── requirements.txt               # Python dependencies
│   │
│   ├── api/
│   │   ├── main.py                    # FastAPI app + WebSocket /ws/live + lifespan
│   │   ├── routes.py                  # All REST endpoints (/api/* + legacy)
│   │   └── __init__.py
│   │
│   ├── bob_integration/
│   │   ├── bob_client.py              # IBM Bob / watsonx.ai wrapper + mock fallback
│   │   ├── reasoning_engine.py        # NL risk explanations + free-text Q&A
│   │   ├── maintenance_plan_generator.py  # Bob-generated dispatch plan
│   │   ├── test_bob_integration.py    # Integration tests (pytest)
│   │   └── __init__.py
│   │
│   ├── data/
│   │   ├── gujarat_assets.py          # 25 Gujarat assets — static metadata + coordinates
│   │   ├── realtime_simulator.py      # Live sensor simulator (5s cadence, 25 assets)
│   │   ├── weather_simulator.py       # Per-district weather simulator (30s cadence)
│   │   ├── asset_source.py            # Asset data adapter (legacy pipeline bridge)
│   │   ├── sensor_data_generator.py   # Sensor value generation utilities
│   │   ├── weather_client.py          # OpenWeatherMap API client (optional)
│   │   ├── incident_history_loader.py # Historical failure record loader
│   │   ├── mock_data.py               # Unused scaffold — safe to ignore
│   │   └── __init__.py
│   │
│   └── models/
│       ├── risk_engine.py             # 5-component explainable risk scoring (0-100)
│       ├── district_risk.py           # District-level risk aggregation
│       ├── alert_engine.py            # Threshold + delta + anomaly alert generation
│       ├── crew_planner.py            # Geographic crew pre-positioning (6 crews)
│       ├── impact_ranking.py          # Grid impact score ranking
│       ├── failure_predictor.py       # Failure probability utilities
│       ├── risk_scoring_model.py      # Risk scoring model helpers
│       └── __init__.py
│
└── frontend/
    ├── .env.example                   # VITE_API_BASE_URL=http://localhost:8000
    ├── README.md                      # Frontend-specific notes
    ├── index.html                     # Vite entry point
    ├── package.json                   # npm dependencies
    ├── vite.config.js                 # Vite configuration
    │
    └── src/
        ├── main.jsx                   # React app entry point
        ├── App.jsx                    # Root component + routing
        ├── api.js                     # Fetch layer (mock ↔ real backend switch)
        ├── mockData.js                # Browser-side mock fixtures
        ├── dashboardDerived.js        # Derived metrics computed from WS payload
        ├── styles.css                 # Global styles
        │
        ├── hooks/
        │   ├── useWebSocket.js        # WS connection + REST fallback + mock simulation
        │   └── useSensorStream.js     # Risk delta + escalation detection
        │
        ├── components/
        │   ├── LeafletRiskMap.jsx     # Leaflet + OpenStreetMap map with asset markers
        │   ├── GujaratRiskMap.jsx     # Gujarat district choropleth overlay
        │   ├── IndiaRiskMap.jsx       # India-level map context
        │   ├── RiskMap.jsx            # Map container / selector
        │   ├── LiveStatusBar.jsx      # Connection status + data freshness indicator
        │   ├── AlertPanel.jsx         # Live alert stream
        │   ├── AssetDetailPanel.jsx   # Per-asset sensor readings + risk breakdown
        │   ├── RiskPanel.jsx          # Risk overview panel
        │   ├── RiskTrendChart.jsx     # Rolling risk trend chart
        │   ├── KeyRiskMetrics.jsx     # Summary KPI cards
        │   ├── MaintenancePriorities.jsx  # Ranked maintenance table
        │   ├── DispatchPlan.jsx       # IBM Bob dispatch plan view + Ask Bob
        │   ├── CrewRecommendations.jsx    # Crew pre-positioning cards
        │   ├── DistrictRiskOverview.jsx   # District risk summary grid
        │   └── PredictiveAnalysis.jsx     # Predictive analytics panel
        │
        └── data/
            ├── gujarat_districts.json # Gujarat district boundary GeoJSON
            └── india_states.json      # India states GeoJSON
```
