# Setup Guide

> **This file is read by the automated evaluation pipeline. Be precise and complete.**

## Prerequisites

Before you begin, ensure you have the following installed:

- [x] **Python 3.11+** — `python --version` or `python3 --version`
- [x] **Node.js 18+** — `node --version`
- [x] **npm 9+** — `npm --version` (comes with Node.js)
- [x] **git** — `git --version`

No database, Docker, or cloud account is required to run the project — it runs
fully locally, with IBM Bob/watsonx.ai integration in a safe mock mode by
default (no API key needed to see it working end-to-end).

**Minimum hardware:** any machine capable of running Python 3.11 and a modern browser.
The simulators are CPU-light; total memory usage is under 200 MB.

---

## Environment Variables

Copy the example files and fill in values as needed:

```bash
cp src/.env.example src/.env
cp src/frontend/.env.example src/frontend/.env
```

### Backend environment (`src/.env`)

| Variable | Description | Required |
|---|---|---|
| `IBM_BOB_API_KEY` | IBM Bob / watsonx.ai API key | **No** — runs in local mock-reasoning mode if unset |
| `IBM_BOB_ENDPOINT` | watsonx.ai text generation endpoint URL | **No** — defaults to `https://us-south.ml.cloud.ibm.com/ml/v1/text/generation?version=2023-05-29` |
| `WATSONX_PROJECT_ID` | watsonx.ai project ID | **No** — mock mode if unset |
| `WATSONX_MODEL_ID` | Model to use (default: `ibm/granite-13b-instruct-v2`) | **No** — override only if using a different Granite model |
| `WEATHER_API_KEY` | OpenWeatherMap API key | **No** — synthetic weather simulation used if unset |
| `WEATHER_API_BASE_URL` | OpenWeatherMap base URL | **No** — defaults to `https://api.openweathermap.org/data/2.5` |
| `BACKEND_PORT` | Port for the FastAPI server | **No** — defaults to `8000` in the uvicorn command |
| `FRONTEND_URL` | Frontend origin (used for CORS if tightened) | **No** — CORS is `*` for hackathon; set if restricting origins |
| `DATABASE_URL` | PostgreSQL connection string | **No** — no database is used in this project; variable is a scaffold placeholder |

> **Minimum to run with real IBM Bob:** set `IBM_BOB_API_KEY`, `IBM_BOB_ENDPOINT`, and
> `WATSONX_PROJECT_ID`. Everything else can remain at defaults.

### Frontend environment (`src/frontend/.env`)

| Variable | Description | Required |
|---|---|---|
| `VITE_API_BASE_URL` | Backend URL the dashboard calls | **Yes** — set to `http://localhost:8000` once the backend is running |

The `.env.example` file for the frontend already contains:
```
VITE_API_BASE_URL=http://localhost:8000
```
So copying the example file as-is is sufficient for local development.

---

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/vaishnavipatel711/bob-ai-hackathon-fantastic4.git
cd bob-ai-hackathon-fantastic4

# 2. Create and activate a Python virtual environment
python -m venv venv
source venv/bin/activate        # macOS / Linux
# Windows PowerShell:  venv\Scripts\Activate.ps1
# Windows cmd:         venv\Scripts\activate.bat

# 3. Install backend dependencies
pip install -r src/backend/requirements.txt

# 4. Install frontend dependencies
cd src/frontend
npm install
cd ../..

# 5. Configure environment variables
cp src/.env.example src/.env
cp src/frontend/.env.example src/frontend/.env
# src/frontend/.env already contains VITE_API_BASE_URL=http://localhost:8000 — no edit needed
# Optionally edit src/.env to add IBM_BOB_API_KEY + WATSONX_PROJECT_ID for real Bob calls
```

---

## Running the Application

Open **two terminals** in the repository root.

**Terminal 1 — Backend**

> ⚠️ Run uvicorn from the **repository root**, not from inside `src/backend/`.
> The package uses relative imports that require the full dotted path.

```bash
# Activate the virtual environment first if you haven't already
source venv/bin/activate        # Windows: venv\Scripts\Activate.ps1

# Start the backend
uvicorn src.backend.api.main:app --reload --port 8000
```

You should see output like:
```
INFO:     Started server process [...]
INFO:     Waiting for application startup.
INFO:     Application startup complete.
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
```

**Terminal 2 — Frontend**

```bash
cd src/frontend
npm run dev
```

You should see output like:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

---

## Verifying It Works

Follow these steps in order to confirm the full pipeline is running:

### 1. Backend health check
Open `http://localhost:8000/` in your browser or run:
```bash
curl http://localhost:8000/
```
Expected response: `{"status": "ok", "service": "grid-equipment-failure-advisor-api"}`

### 2. System health endpoint
```bash
curl http://localhost:8000/api/system/health
```
Expected response includes `"status": "ok"`, `"mode": "DEMO"`, and both simulators showing `"running"`:
```json
{
  "status": "ok",
  "mode": "DEMO",
  "simulators": {
    "sensor_simulator": "running",
    "weather_simulator": "running"
  },
  "assets": { "total": 25, "with_sensor_data": 25 }
}
```

### 3. Live asset data
```bash
curl http://localhost:8000/api/assets | python -m json.tool | head -40
```
Expected: a JSON object with `"count": 25` and a list of assets each containing `"overall_risk_score"` and sensor readings.

### 4. Frontend dashboard
Open `http://localhost:5173` in your browser.

**What you should see within 5 seconds:**
- `● LIVE` status indicator (top bar) — confirms WebSocket connection
- `DEMO DATA — Simulated real-time sensor stream` badge
- A Leaflet map of Gujarat with 25 coloured asset markers
- Sensor values changing every 5 seconds
- Alerts appearing in the Alert Panel as risk thresholds are crossed

### 5. IBM Bob integration (mock mode)
Navigate to the **Dispatch Plan** tab and click **"Generate Plan"** (or `GET /plan`):
```bash
curl http://localhost:8000/plan | python -m json.tool
```
Expected: a JSON object with `"summary"` (string) and `"plan"` (array of per-asset dispatch steps).

In mock mode the plan is generated by the deterministic fallback in
`bob_client.py` — the same code path used when real credentials are set.

### 6. Swagger UI
Open `http://localhost:8000/docs` — all endpoints are listed and can be tested interactively.

---

## Running Tests

```bash
# From the repository root (not from inside src/backend/)
pytest src/backend/bob_integration/test_bob_integration.py -v
```

Expected output:
```
test_bob_integration.py::test_explain_risk_returns_string PASSED
test_bob_integration.py::test_explain_risk_sparse_asset PASSED
test_bob_integration.py::test_compare_assets_returns_string PASSED
test_bob_integration.py::test_generate_plan_structure PASSED
test_bob_integration.py::test_generate_plan_asset_ids_are_valid PASSED
test_bob_integration.py::test_generate_plan_empty_list PASSED
test_bob_integration.py::test_generate_plan_sparse_asset PASSED

7 passed in x.xxs
```

If pytest is not installed: `pip install pytest`

---

## Quick Demo Walkthrough

Once both servers are running:

1. Open `http://localhost:5173` — the risk map loads with 25 Gujarat grid assets,
   colour-coded by live risk level (green / yellow / orange / red).
2. Watch the map for 10–15 seconds — markers update as sensor values change every 5 seconds.
3. Click a high-risk (orange/red) asset marker — a detail panel opens showing sensor
   readings, risk score breakdown, and the recommended action.
4. Click **"Why is this high risk?"** — IBM Bob (mock) returns a 2–3 sentence plain-language
   explanation grounded in the actual sensor values.
5. Open the **Ranked Assets** tab — all 25 assets sorted by `grid_impact_score`.
6. Open the **Dispatch Plan** tab — IBM Bob generates a crew assignment plan with ETAs.
7. Type a question in the **Ask Bob** box (e.g. `"which district has the highest storm risk?"`)
   and press Enter — Bob answers using the current live context.

---

## Known Limitations

- Weather and sensor data are synthetically generated for the demo rather
  than pulled from live utility sensors or a real weather API — this is by
  design given the hackathon timeframe, and the pipeline is structured so a
  real data source could be swapped in without changing the model or API
  layers.
- IBM Bob integration runs in a local mock-reasoning mode by default when no
  `IBM_BOB_API_KEY` / `IBM_BOB_ENDPOINT` / `WATSONX_PROJECT_ID` are set. This
  keeps the demo reliable without live credentials; setting those three
  environment variables switches it to real watsonx.ai calls automatically.
- `src/backend/data/mock_data.py` is unused leftover scaffolding from early
  development and can be ignored.
- `DATABASE_URL` in `src/.env.example` is a scaffold placeholder — no database
  is used in this project.

---

## Troubleshooting

| Issue | Cause | Solution |
|---|---|---|
| `ImportError: attempted relative import beyond top-level package` | uvicorn launched from inside `src/backend/` | Run from repo root: `uvicorn src.backend.api.main:app --reload --port 8000` |
| `ModuleNotFoundError: No module named 'fastapi'` | Virtual environment not activated or deps not installed | Run `source venv/bin/activate` then `pip install -r src/backend/requirements.txt` |
| `ModuleNotFoundError: No module named 'pytest'` | pytest not installed | Run `pip install pytest` |
| Frontend shows `Connecting…` and never goes `● LIVE` | `VITE_API_BASE_URL` not set, or backend not running | Confirm backend is up at `http://localhost:8000/`; set `VITE_API_BASE_URL=http://localhost:8000` in `src/frontend/.env`, then restart `npm run dev` |
| Frontend shows mock/demo data instead of live sensor data | WebSocket connection failed, falling back to browser-side simulation | Same as above — the frontend auto-falls back to simulated data when the WS connection fails |
| `/assets/{id}/explain` or `/plan` return a 500 error | Stale cached bytecode from an older code version | Delete `src/backend/**/__pycache__` directories and restart uvicorn |
| CORS error in browser console | Backend not running, or origin mismatch | Confirm backend is up — `main.py` already sets `allow_origins=["*"]` so this is almost always a "backend is down" issue |
| `curl http://localhost:8000/api/system/health` shows `sensor_simulator: "stopped"` | Simulator thread crashed on startup (rare) | Restart uvicorn; if it persists, check Python version (`python --version` must be 3.11+) |
| Port 8000 already in use | Another process is using port 8000 | Run on a different port: `uvicorn src.backend.api.main:app --reload --port 8001`, and update `VITE_API_BASE_URL` to match |
| Port 5173 already in use | Another Vite dev server is running | Vite will automatically try the next port (5174, 5175…) — check the terminal output for the actual URL |
