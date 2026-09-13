# Backend

FastAPI service that:
1. Generates/ingests sensor, weather, and incident data (`data/`)
2. Scores equipment failure risk & ranks by grid impact (`models/`)
3. Uses IBM Bob to explain risk and generate maintenance/dispatch plans (`bob_integration/`)
4. Exposes it all via REST endpoints for the frontend (`api/`)

## Setup
```bash
cd src/backend
python -m venv venv
source venv/bin/activate   # or venv\Scripts\activate on Windows
pip install -r requirements.txt
cp ../.env.example ../.env   # fill in real values
uvicorn api.main:app --reload --port 8000
```

## Folder responsibilities
| Folder | Owns |
|---|---|
| `data/` | Sensor data generator, weather client, incident history loader |
| `models/` | Risk scoring model, failure predictor, impact ranking |
| `bob_integration/` | Bob client, reasoning/explanation engine, maintenance plan generator |
| `api/` | FastAPI app + routes tying it all together |

# U1: Power Outage Prediction & Grid Equipment Failure Advisor
Risk model + API layer (IBM Bob AI Hackathon)

## What's here

```
src/backend/
  models/
    risk_scoring_model.py   # explainable weighted risk scorer (sensors + weather + incidents)
    failure_predictor.py    # days-to-failure estimate from risk_score
    impact_ranking.py       # ranks assets by grid impact (risk + customers + criticality)
  data/
    mock_data.py            # Day-1 hardcoded raw inputs, run through the real pipeline
    asset_source.py         # <-- THE ONLY FILE TO EDIT ON DAY 2 (see below)
  api/
    main.py                 # FastAPI app, CORS enabled
    routes.py                # /assets, /assets/{id}, /assets/{id}/explain, /plan, /ask
    bob_integration.py      # proxy stub for teammate's Bob explain integration
```

## Run it

```bash
pip install -r requirements.txt
uvicorn src.backend.api.main:app --reload --port 8000
```

Swagger UI: http://localhost:8000/docs

## Endpoints

| Method | Path                     | Description |
|--------|--------------------------|--------------|
| GET    | `/assets`                | All assets, impact-ranked. Optional `?risk_level=high` filter. |
| GET    | `/assets/{id}`           | Single asset, 404 if missing. |
| GET    | `/assets/{id}/explain`   | Explanation text; tries Bob, falls back to local template. |
| GET    | `/plan?top_n=5`          | Prioritized maintenance plan, ranked by impact not raw risk. |
| POST   | `/ask`                   | `{"question": "...", "asset_id": "optional"}` -> free-text answer. |

## Asset schema (do not rename fields — teammates depend on this shape)

```json
{
  "asset_id": "TX-104",
  "location": {"lat": 22.56, "lon": 72.93, "name": "Anand Substation 4"},
  "asset_type": "transformer",
  "risk_score": 0.84,
  "risk_level": "high",
  "contributing_factors": [
    {"factor": "oil_quality", "value": "degraded", "weight": 0.4},
    {"factor": "vibration", "value": "above_threshold", "weight": 0.3},
    {"factor": "weather_forecast", "value": "storm_72h", "weight": 0.3}
  ],
  "predicted_days_to_failure": 12,
  "customers_affected_estimate": 4200
}
```

`/assets` and `/plan` responses additionally attach an `impact` block
(`impact_score`, `risk_component`, `customer_component`,
`criticality_component`) — additive, doesn't touch the base schema.

## Day 2: swapping in real data

Edit **one line** in `src/backend/data/asset_source.py`:

```python
# before
from .mock_data import get_all_assets, get_asset_by_id
# after
from .teammate_data_pipeline import get_all_assets, get_asset_by_id
```

The teammate's module just needs to expose `get_all_assets() -> list[dict]`
and `get_asset_by_id(id) -> dict | None` returning the schema above (or raw
sensor/weather/incident objects that you then run through
`models.risk_scoring_model.compute_risk_score` the same way `mock_data.py`
does). Nothing in `models/` or `api/` needs to change.

Same pattern for Bob: edit the marked swap point inside
`src/backend/api/bob_integration.py` once the real client exists.

## Design notes (for judges / explainability)

- **risk_scoring_model.py** is a transparent weighted sum, not a black box.
  `RISK_WEIGHTS` is a visible, documented constant; every contributing
  factor in the output traces back to one weight × one sub-score.
- **failure_predictor.py** is a commented heuristic on the same risk_score
  and contributing_factors — no hidden second model.
- **impact_ranking.py** deliberately separates *risk* from *impact*: a
  high-risk low-customer-count pole is correctly deprioritized under a
  lower-risk, high-customer-count substation. Component breakdown
  (`risk_component`, `customer_component`, `criticality_component`) is
  exposed so this can be explained the same way risk_score is.

## Tests

`smoke_test.py` exercises every endpoint end-to-end and asserts the asset
schema matches exactly. Run with:

```bash
python3 smoke_test.py
```