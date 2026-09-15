# Solution Overview

## What We Built

A real-time **Power Outage Prediction & Grid Equipment Failure Advisor** — a web-based
control-room dashboard that monitors 25 Gujarat grid assets across 15 districts, computes
an explainable multi-signal risk score for every asset every 5 seconds, and uses IBM Bob
(watsonx.ai `ibm/granite-13b-instruct-v2`) to generate a prioritised maintenance and crew
dispatch plan that tells operators exactly: who to send, to which asset, from where, to do
what, and by when.

## How It Works

1. **Sensor simulation** generates live readings (temperature, vibration, partial discharge,
   oil quality, load %) for 25 Gujarat grid assets every 5 seconds. Two assets are always in
   a slowly degrading state; anomaly spikes (overheating, high vibration, PD, overload) are
   injected randomly with 2–8 minute durations to simulate real failure patterns.

2. **Weather simulation** updates storm probability, wind speed, lightning risk, and rainfall
   for all 15 Gujarat districts every 30 seconds, modelling gradual storm build-up and
   coastal humidity offsets by district.

3. **Risk engine** combines six signals per asset into an `overall_risk_score` (0–100):
   - Sensor risk: partial discharge, temperature, temperature rate, vibration, oil quality
   - Load risk: operating load vs. rated capacity
   - Age/maintenance risk: asset age + days since last maintenance
   - Historical risk: failures in the last 12 months
   - Weather risk: current district storm/wind/rain conditions
   Each sub-score and its weight are visible — not hidden inside a model.

4. **Alert engine** fires alerts when: risk crosses 60 or 80, risk increases ≥15 points in
   one update cycle, an anomaly is active, partial discharge exceeds 80 pC, load exceeds 95%,
   or a district weather risk crosses 0.7 with high-risk assets present.

5. **Grid impact ranking** multiplies normalised risk (45%) × customer reach (35%) ×
   asset criticality (20%) to produce a `grid_impact_score` that drives the maintenance
   priority list — not raw risk alone.

6. **IBM Bob dispatch plan** (`/plan` endpoint): the top-10 at-risk assets plus live
   weather context are sent to IBM Bob. Bob returns a structured JSON plan with a concrete
   operational action, crew type, dispatch location, ETA in hours, and pre-positioning
   recommendation per asset, plus a 2–3 sentence executive summary.

7. **Dashboard** renders everything live: risk map with per-asset Leaflet markers, ranked
   maintenance table, alert panel, district risk overview, crew pre-positioning recommendations,
   and the full dispatch plan. The "Ask Bob" chat input routes free-text operator questions
   through the same IBM Bob pipeline.

## Architecture Diagram

See [`architecture.md`](architecture.md) for the full Mermaid diagram.

```
[Browser] ──WebSocket/5s──► [FastAPI Backend]
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
             [Risk Engine]  [Alert Engine]  [Crew Planner]
                    │
           ┌────────┴────────┐
           ▼                 ▼
   [Sensor Simulator]  [Weather Simulator]
   25 assets · 5s      15 districts · 30s

[/plan] ──prompt──► [IBM Bob — watsonx.ai]
        ◄──JSON plan──
```

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Explainable weighted-sum risk model (not black-box ML) | Judges and operators can read the weights; every score is traceable to named factors |
| IBM Bob for dispatch plan generation (not a rule template) | Bob produces varied, context-specific operational language; the local fallback guarantees demo reliability |
| Single asset universe for both dashboard and `/plan` | Both the live map and the dispatch plan operate on the same 25 Gujarat assets — no disconnect between what the operator sees and what Bob is asked to plan |
| Deterministic mock fallback for Bob | Demo reliability is a first-class requirement; no credential dependency to run the full pipeline |
| WebSocket push (not polling) | 5-second sensor cadence requires push; polling at this frequency would be wasteful |

## IBM Technologies Used

- **IBM Bob / watsonx.ai (`ibm/granite-13b-instruct-v2`):**
  Used via the watsonx.ai text generation REST endpoint
  (`/ml/v1/text/generation?version=2023-05-29`). Three distinct use cases:
  1. **Dispatch plan generation** (`/plan`): Bob receives a structured JSON prompt containing
     the top-10 at-risk assets with their risk scores, contributing factors, customer impact,
     criticality, district, age, and current weather. Bob returns a complete JSON dispatch
     plan with per-asset operational actions, crew types, locations, ETAs, and a summary.
  2. **Risk explanation** (`/assets/{id}/explain`): Bob explains in plain language why a
     specific asset has its current risk level, translating machine scores into operator-ready
     reasoning.
  3. **Free-text Q&A** (`POST /ask`): Bob answers operator questions such as "which district
     has the highest outage risk right now?" using the current ranked asset context.
