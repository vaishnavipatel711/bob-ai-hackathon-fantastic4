# Frontend — Grid Risk Dashboard

React (Vite) dashboard showing:
- A map with color-coded risk zones for grid assets
- A risk panel (ranked list of at-risk equipment)
- The generated maintenance/dispatch plan (from Bob)

## Setup
```bash
cd src/frontend
npm install
cp .env.example .env   # set VITE_API_BASE_URL to backend URL
npm run dev
```

## Components
| File | Purpose |
|---|---|
| `src/components/RiskMap.jsx` | Map view with color-coded asset risk markers |
| `src/components/RiskPanel.jsx` | Ranked list/table of at-risk assets |
| `src/components/DispatchPlan.jsx` | Displays Bob-generated maintenance & crew plan |
| `src/App.jsx` | Layout wiring the three views together |
