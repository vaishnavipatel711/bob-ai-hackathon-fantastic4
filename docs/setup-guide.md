# Setup Guide

> **This file is read by the automated evaluation pipeline. Be precise and complete.**

## Prerequisites

Before you begin, ensure you have the following installed:

- [x] Python 3.11+
- [x] Node.js 18+
- [x] npm (comes with Node.js)

No database, Docker, or cloud account is required to run the project — it runs
fully locally, with IBM Bob/watsonx.ai integration in a safe mock mode by
default (no API key needed to see it working end-to-end).

## Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp src/.env.example src/.env
cp src/frontend/.env.example src/frontend/.env
```

| Variable | Description | Required |
|---|---|---|
| `WEATHER_API_KEY` | OpenWeatherMap API key | No — synthetic weather used if unset |
| `IBM_BOB_API_KEY` | IBM Bob / watsonx.ai API key | No — runs in local mock-reasoning mode if unset |
| `IBM_BOB_ENDPOINT` | IBM Bob / watsonx.ai endpoint URL | No — same as above |
| `WATSONX_PROJECT_ID` | watsonx.ai project ID | No — same as above |
| `VITE_API_BASE_URL` (frontend `.env`) | Backend URL for the dashboard to call | Yes, once backend is running (e.g. `http://localhost:8000`) |

## Installation

```bash
# 1. Clone the repository
git clone https://github.com/vaishnavipatel711/bob-ai-hackathon-fantastic4.git
cd bob-ai-hackathon-fantastic4

# 2. Install backend dependencies
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r src/backend/requirements.txt

# 3. Install frontend dependencies
cd src/frontend
npm install
cd ../..
```

## Running the Application

**Run the backend from the repository root** (not from inside `src/backend`) —
its internal imports depend on being launched with the full dotted path:

```bash
# Terminal 1 — backend, from the repo root
uvicorn src.backend.api.main:app --reload --port 8000
```

```bash
# Terminal 2 — frontend
cd src/frontend
npm run dev
```

The application will be available at:
- Frontend dashboard: `http://localhost:5173`
- Backend API + interactive docs: `http://localhost:8000/docs`

## Running Tests

```bash
# From the repo root
cd src/backend
python -m bob_integration.test_bob_integration
```

## Quick Demo (Optional)

Once both servers are running:
1. Open `http://localhost:5173` — the risk map and risk panel load with 18
   synthetic grid assets (~7 flagged high risk).
2. Click a high-risk asset and expand "why is this high risk" to see IBM
   Bob's explanation.
3. Open the dispatch plan view to see the prioritized maintenance plan.
4. Try the free-form question box (e.g. "which assets are high risk").

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

## Troubleshooting

| Issue | Solution |
|---|---|
| `ImportError: attempted relative import beyond top-level package` | You ran uvicorn from inside `src/backend`. Run it from the repo root instead: `uvicorn src.backend.api.main:app --reload --port 8000` |
| `ModuleNotFoundError: No module named 'fastapi'` (or similar) | Run `pip install -r src/backend/requirements.txt` again, and confirm your virtual environment is activated |
| Frontend shows mock data instead of real data | Set `VITE_API_BASE_URL=http://localhost:8000` in `src/frontend/.env`, then restart `npm run dev` |
| `/assets/{id}/explain` or `/plan` return a 500 error | Confirm you're on the latest pushed backend code — this was caused by a fixed bug in `asset_source.py`'s risk-factor conversion |
| CORS error in browser console | Confirm the backend is running — `main.py` already allows all origins (`allow_origins=["*"]`), so this usually means the backend isn't actually up |
