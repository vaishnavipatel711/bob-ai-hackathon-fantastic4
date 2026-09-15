# Backend — Grid Risk & Outage Advisor API

## Architecture

```
Real-time Sensor Simulator (5s cadence)
         +
Weather Simulator (30s cadence, 15 Gujarat districts)
         +
Historical Incident Data (per-asset synthetic history)
         ↓
Risk Engine (explainable weighted scoring)
         ↓
District Risk Aggregation
         ↓
Alert Engine (threshold + delta triggers)
         ↓
Crew Pre-positioning Planner
         ↓
FastAPI REST + WebSocket /ws/live
```

## Quick Start

```bash
# From repo root
pip install -r src/backend/requirements.txt
uvicorn src.backend.api.main:app --reload --port 8000
```

Then open: http://localhost:8000/docs

## API Endpoints

### Real-Time (new)
| Method | Path | Description |
|--------|------|-------------|
| WS | `/ws/live` | Live updates every 5s: assets + alerts + district risks + weather |
| GET | `/api/assets` | All 25 Gujarat assets with current risk scores |
| GET | `/api/assets/{id}` | Single asset with full sensor + risk detail |
| GET | `/api/assets/{id}/history` | Sensor history last 60 minutes |
| GET | `/api/risk` | All risk scores sorted by severity |
| GET | `/api/risk/{id}` | Single asset risk breakdown |
| GET | `/api/districts/risk` | All 15 Gujarat district risks |
| GET | `/api/alerts` | Active alerts (most recent first) |
| GET | `/api/maintenance/priorities` | Ranked maintenance plan |
| GET | `/api/crew/recommendations` | Crew pre-positioning plan |
| GET | `/api/weather` | Current weather per district |
| GET | `/api/system/health` | System status + data freshness |

### Legacy (kept for compatibility)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/assets` | Impact-ranked asset list (static) |
| GET | `/assets/{id}/explain` | Bob-generated risk explanation |
| GET | `/plan` | Maintenance plan (Bob integration) |
| POST | `/ask` | Free-text Q&A via Bob |

## Risk Calculation

Risk score (0-100) is a **transparent, explainable weighted sum**:

| Factor | Weight (transformer) | Weight (other) |
|--------|---------------------|----------------|
| Partial Discharge | 0.25 | 0.15 |
| Load % | 0.20 | 0.25 |
| Temperature | 0.15 | 0.15 |
| Vibration | 0.15 | 0.20 |
| Oil Quality | 0.15 | 0.10 |
| Weather Risk | 0.10 | 0.15 |
| Age/History | combined 0.10 | combined 0.10 |

Risk levels: **0-30 = Low | 31-60 = Medium | 61-80 = High | 81-100 = Critical**

Every risk score comes with `contributing_factors` + `risk_explanation`.

## Demo Mode

All data is clearly labelled: `"data_label": "DEMO DATA — Simulated real-time sensor stream"`

The simulator:
- Updates every **5 seconds** with realistic correlated variation
- Always has **2 assets degrading** (15-minute escalation cycle)
- Injects a **random anomaly spike** every 3–5 minutes (overheating / high vibration / partial discharge / overload)
- Weather updates every **30 seconds** with gradual storm build-up

## Environment Variables

Copy `../.env.example` to `src/backend/.env`:

```bash
IBM_BOB_API_KEY=       # optional — runs in mock mode without it
IBM_BOB_ENDPOINT=
WATSONX_PROJECT_ID=
WEATHER_API_KEY=       # optional — simulator used if not set
```
