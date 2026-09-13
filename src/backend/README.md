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
