# Power Outage Prediction & Grid Equipment Failure Advisor

> **IBM Bob AI Hackathon — Team Fantastic 4 — Track: AI**

A real-time grid equipment risk monitoring and dispatch planning system that combines
live sensor telemetry, weather forecasts, and historical incident records to predict
equipment failures before they cause blackouts — powered by IBM Bob (watsonx.ai).

---

## Team

| Field | Value |
|---|---|
| **Team Name** | Fantastic 4 |
| **Track** | AI |
| **Team Lead** | Vaishnavi Patel — 24DCS090@charusat.edu.in |
| **Members** | Vyoma Patel — 24DCS094@charusat.edu.in |
| | Ved Patel — 24IT080@charusat.edu.in |
| | Sujal Patel — 24IT079@charusat.edu.in |

---

## Problem Statement

Power transformer and substation failures cause blackouts costing utilities **$1M+/hour**
and affecting millions of people. Most utilities still use calendar-based maintenance,
while sensors already measuring temperature, vibration, partial discharge, and oil quality
show failure signatures **weeks in advance**. Weather events compound the risk — but sensor
data and weather forecasts are never combined in time to act.

---

## Solution

We built an IBM Bob-powered real-time advisor that:

1. **Predicts** which grid assets are most likely to fail using a 5-component explainable risk model
2. **Ranks** assets by grid impact severity (customers × criticality × failure probability)
3. **Generates** a prioritised maintenance and crew pre-positioning dispatch plan via IBM Bob

IBM Bob (watsonx.ai `ibm/granite-13b-instruct-v2`) generates the dispatch plan, explains
each asset's risk in plain language, and answers free-text questions from control-room operators.

---

## Key Features

- **Multi-signal risk scoring** — 5 weighted components per asset: sensor risk (partial
  discharge, temperature, vibration, oil quality), load risk, age/maintenance risk, historical
  failure risk, and weather risk. Weights vary by asset type (e.g. transformer sensor weight
  0.35 vs. feeder 0.30); every sub-score is fully traceable — not a black-box model.

- **IBM Bob dispatch planning** — `/plan` sends the top-N at-risk assets plus live weather
  to IBM Bob, which returns a structured JSON dispatch plan with crew type, dispatch location,
  ETA, and pre-positioning recommendation for every asset.

- **Live WebSocket dashboard** — 25 Gujarat grid assets across 15 districts, sensor updates
  every 5 seconds, correlated anomaly injection (overheating, high vibration, partial
  discharge, overload), and a real-time alert engine.

- **District risk aggregation & crew planner** — district-level outage probability,
  geographic adjacency routing for 6 named crews, and urgency classification.

- **Zero-dependency demo mode** — runs fully without API keys using a deterministic
  mock reasoning fallback; setting `IBM_BOB_API_KEY` and `WATSONX_PROJECT_ID` switches
  to real watsonx.ai calls automatically.

---

## Tech Stack

| Category | Technologies |
|---|---|
| **Languages** | Python, JavaScript |
| **Frameworks** | FastAPI, React, Vite |
| **IBM Technologies** | IBM Bob, watsonx.ai, ibm/granite-13b-instruct-v2 |
| **Real-time** | WebSocket (native FastAPI), uvicorn |
| **Frontend libs** | Leaflet.js, IBM Plex fonts |
| **Other** | python-dotenv, requests |

---

## Repository Structure

```
├── src/
│   ├── backend/
│   │   ├── api/            # FastAPI routes + WebSocket endpoint
│   │   ├── bob_integration/ # IBM Bob / watsonx.ai client, reasoning engine, plan generator
│   │   ├── data/           # Gujarat assets, sensor simulator, weather simulator
│   │   └── models/         # Risk engine, failure predictor, impact ranking, crew planner
│   └── frontend/           # React + Vite dashboard
├── docs/                   # Architecture, setup guide, problem statement
├── demo/                   # Screenshots, video link
├── presentation/           # Slide deck
└── submission.yaml         # Structured submission metadata
```

---

## How to Run

```bash
# 1. Clone the repo
git clone https://github.com/vaishnavipatel711/bob-ai-hackathon-fantastic4.git
cd bob-ai-hackathon-fantastic4

# 2. Install backend dependencies
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r src/backend/requirements.txt

# 3. Install frontend dependencies
cd src/frontend && npm install && cd ../..

# 4. Configure environment
cp src/.env.example src/.env
cp src/frontend/.env.example src/frontend/.env
# Edit src/frontend/.env: set VITE_API_BASE_URL=http://localhost:8000
# Optionally set IBM_BOB_API_KEY + WATSONX_PROJECT_ID in src/.env for real Bob

# 5. Run backend (from repo root)
uvicorn src.backend.api.main:app --reload --port 8000

# 6. Run frontend (separate terminal)
cd src/frontend && npm run dev
```

- Frontend dashboard: `http://localhost:5173`
- Backend API + Swagger docs: `http://localhost:8000/docs`

---

## What We're Most Proud Of

The **explainability layer**: every risk score is a documented weighted sum of named factors —
not a black box. Every contributing factor is surfaced with its raw value and contribution
weight. IBM Bob then translates the machine score into plain-language reasoning a grid
operations manager can act on immediately, including a structured crew dispatch plan with
specific actions, crew types, and response ETAs for each flagged asset.

---

## Known Limitations

- Sensor and weather data are synthetically simulated (pipeline designed for real SCADA/IoT swap-in)
- IBM Bob runs in local mock mode without credentials; three env vars switch it to real watsonx.ai
- No persistent storage — scores and alert history reset on server restart

---

## Demo

| Artifact | Link |
|---|---|
| Demo Video | `https://youtu.be/nNX27mQarME` |
| Live Demo |`https://bob-ai-hackathon-fantastic4.vercel.app/`|
| Screenshots | `demo/screenshots/` |
| Presentation | `presentation/` |
