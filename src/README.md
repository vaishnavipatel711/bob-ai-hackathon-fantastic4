# src/ Layout

This project is a monorepo with two parts:

```
src/
├── backend/          # Data pipeline, risk model, IBM Bob integration, API
│   ├── data/         # Sensor/weather/incident data generation & ingestion
│   ├── models/       # Risk scoring & failure prediction logic
│   ├── bob_integration/  # IBM Bob reasoning layer (explanations + dispatch plans)
│   ├── api/          # FastAPI app exposing endpoints to the frontend
│   ├── requirements.txt
│   └── .env.example
│
└── frontend/         # Dashboard UI — risk map, risk panel, dispatch plan view
    ├── src/
    │   ├── components/
    │   ├── App.jsx
    │   └── main.jsx
    ├── package.json
    └── .env.example
```

## Team ownership (fill in names)

| Area | Owner |
|---|---|
| `backend/data/` | [Name] |
| `backend/models/` | [Name] |
| `backend/bob_integration/` | [Name] |
| `backend/api/` | [Name] |
| `frontend/` | [Name] |

## Run order
1. Start backend (`backend/README.md`)
2. Start frontend (`frontend/README.md`)
3. Full steps live in `docs/setup-guide.md`
