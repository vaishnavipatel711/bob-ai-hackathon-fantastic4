# Solution Overview

## What We Built

A real-time **Power Outage Prediction & Grid Equipment Failure Advisor** — a web-based
control-room dashboard that monitors 25 Gujarat grid assets across 15 districts, computes
an explainable multi-signal risk score for every asset every 5 seconds, and uses IBM Bob
(watsonx.ai `ibm/granite-13b-instruct-v2`) to generate a prioritised maintenance and crew
dispatch plan that tells operators exactly: who to send, to which asset, from where, to do
what, and by when.

## Core Mechanism

The fundamental mechanism is a **continuous, explainable, multi-signal risk pipeline** that
ends in actionable AI-generated operational language — not a number on a screen.

Most existing grid monitoring tools stop at raw sensor display or a single-sensor threshold
alert. This system does three things those tools do not:

1. **Combines signals across dimensions.** Sensor readings, weather exposure, asset age,
   maintenance history, and incident records are fused into a single scored output per asset,
   every 5 seconds. Each dimension's contribution is visible and weighted — there is no
   black-box inference step.

2. **Ranks by business impact, not raw risk.** A high-risk asset serving 500 customers
   behind a rural feeder is lower priority than a medium-risk asset serving 350,000 customers
   at a 400 kV substation. The `grid_impact_score` formula (risk × customers × criticality)
   ensures maintenance decisions reflect actual grid consequences, not just sensor severity.

3. **Generates operational dispatch language via IBM Bob.** The ranked asset list plus live
   weather context is sent to IBM Bob (watsonx.ai Granite), which returns a complete
   per-asset dispatch plan in natural language: which crew, from which depot, what action,
   ETA in hours, and whether to pre-position before the event occurs. This eliminates the
   30–60 minute manual planning step currently done under pressure by maintenance planners.

## How It Works

1. **Sensor simulation** generates live readings (temperature, vibration, partial discharge,
   oil quality, load %) for 25 Gujarat grid assets every 5 seconds. Two assets are always in
   a slowly degrading state; anomaly spikes (overheating, high vibration, PD, overload) are
   injected randomly with 2–8 minute durations to simulate real failure patterns.

2. **Weather simulation** updates storm probability, wind speed, lightning risk, and rainfall
   for all 15 Gujarat districts every 30 seconds, modelling gradual storm build-up and
   coastal humidity offsets by district.

3. **Risk engine** combines five components per asset into an `overall_risk_score` (0–100):
   - **Sensor risk** (partial discharge, temperature, temperature rate, vibration, oil quality)
   - **Load risk**: operating load % vs. rated capacity
   - **Age/maintenance risk**: asset age + days since last maintenance (50/50 blend)
   - **Historical risk**: failures in the last 12 months
   - **Weather risk**: current district storm/wind/rain conditions

   Weights differ by asset type:

   | Component | Transformer / Substation | Other (feeder, switchgear, …) |
   |---|---|---|
   | Sensor risk | 0.35 | 0.30 |
   | Load risk | 0.20 | 0.25 |
   | Age / maintenance | 0.25 | 0.20 |
   | Historical failures | 0.10 | 0.10 |
   | Weather risk | 0.10 | 0.15 |

   Risk levels: **0–30 = Low · 31–60 = Medium · 61–80 = High · 81–100 = Critical**

   Every sub-score and its weight are visible — not hidden inside a model.

4. **Alert engine** fires alerts when: risk crosses 60 or 80, risk increases ≥15 points in
   one update cycle, an anomaly is active, partial discharge exceeds 80 pC, load exceeds 95%,
   or a district weather risk crosses 0.7 with high-risk assets present.

5. **Grid impact ranking** multiplies normalised risk (45%) × customer reach (35%) ×
   asset criticality (20%) to produce a `grid_impact_score` that drives the maintenance
   priority list — not raw risk alone.

6. **IBM Bob dispatch plan** (`/plan` endpoint): the top-N at-risk assets (default 10,
   configurable 1–50 via `?top_n=`) plus live weather context are sent to IBM Bob. Bob returns
   a structured JSON plan with a concrete operational action, crew type, dispatch location,
   ETA in hours, and pre-positioning recommendation per asset, plus a 2–3 sentence executive summary.

7. **Dashboard** renders everything live: risk map with per-asset Leaflet markers, ranked
   maintenance table, alert panel, district risk overview, crew pre-positioning recommendations,
   and the full dispatch plan. The "Ask Bob" chat input routes free-text operator questions
   through the same IBM Bob pipeline.

## What Makes This Different From Naive Alternatives

| Naive alternative | Why it falls short | What we do instead |
|---|---|---|
| Show raw sensor readings per asset | Operator must mentally combine 5 signals under time pressure | Weighted multi-signal risk score computed automatically every 5 seconds |
| Alert when any single threshold is crossed | Creates alert fatigue; misses compound-risk scenarios | Alert engine checks threshold, delta, anomaly, and weather dimensions simultaneously |
| Rank assets by risk score alone | A high-risk rural feeder may be less operationally critical than a medium-risk urban substation | Grid impact score weights risk by customers served and asset criticality |
| Show a priority list and let planners decide | Planning step takes 30–60 minutes; prone to error under pressure | IBM Bob generates the complete crew dispatch plan with ETAs and pre-positioning in seconds |
| Hard-coded rule templates for dispatch | Template output is rigid and ignores weather context | IBM Bob produces contextual, varied operational language from the actual live data |

## User Experience Walkthrough

A control-room operator arriving at the start of a shift:

1. **Opens the dashboard** at `http://localhost:5173`. The `● LIVE` indicator and
   `DEMO DATA` badge confirm the WebSocket connection is active. The Leaflet map shows
   25 asset markers across Gujarat — green (low), yellow (medium), orange (high), red
   (critical) — updated every 5 seconds.

2. **Spots an alert** in the alert panel: `⚠ TX-003 Naroda Industrial Transformer —
   risk increased 41% → 76% (HIGH)`. The map marker for Naroda has turned orange.

3. **Clicks the asset marker** to open the detail panel:
   - Sensor readings with colour-coded status (temperature 84°C 🔴, vibration 6.2 mm/s 🟡)
   - Risk score gauge showing 76/100, with a bar chart of contributing factors
   - Current weather for Ahmedabad district
   - Recommended action with urgency: `Priority inspection within 48h`

4. **Clicks "Why is this high risk?"** — IBM Bob explains in 2–3 sentences:
   > *"Naroda Industrial Transformer is at HIGH risk (score 76/100) driven primarily by
   > elevated temperature at 84°C and active overheating anomaly detected. Age of 20 years
   > combined with 320 days since last maintenance compounds the sensor risk. Immediate
   > priority inspection is warranted within 48 hours."*

5. **Opens the Ranked Assets view** — all 25 assets sorted by `grid_impact_score`. The
   operator can see at a glance which assets matter most this shift.

6. **Opens the Dispatch Plan view** — IBM Bob has generated the full crew dispatch plan:
   per-asset action, crew type, dispatch depot, ETA, and pre-positioning flag. The
   executive summary covers the top 3 risks in plain English.

7. **Uses Ask Bob** — types "which districts have the highest storm risk right now?" and
   gets a plain-language answer using the current live weather data.

## Architecture Diagram

See [`architecture.md`](architecture.md) for the full Mermaid diagram.

```
[Browser] ──WebSocket/5s──► [FastAPI Backend]
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
             [Risk Engine]  [Alert Engine]  [Crew Planner]
                    │                              │
           ┌────────┴────────┐             [District Risk]
           ▼                 ▼
   [Sensor Simulator]  [Weather Simulator]
   25 assets · 5s      15 districts · 30s

[/plan] ──prompt──► [IBM Bob — watsonx.ai]
        ◄──JSON plan──
```

## Key Design Decisions

| Decision | Rationale |
|---|---|
| Explainable weighted-sum risk model (not black-box ML) | Judges and operators can read the weights; every score is traceable to named factors; no training data required |
| Two-tier weights (transformer vs. other asset types) | Partial discharge is the dominant failure signal for transformer-class assets; less relevant for feeders and switchgear — a single weight set would under-score transformer risk |
| IBM Bob for dispatch plan generation (not a rule template) | Bob produces varied, context-specific operational language incorporating live weather; the local fallback guarantees demo reliability regardless of credentials |
| Single asset universe for both dashboard and `/plan` | Both the live map and the dispatch plan operate on the same 25 Gujarat assets — no disconnect between what the operator sees and what Bob is asked to plan |
| `grid_impact_score` as ranking key (not raw risk) | Raw risk alone would over-prioritise low-criticality assets; the composite score aligns maintenance decisions with actual grid consequences |
| Deterministic mock fallback for Bob | Demo reliability is a first-class requirement; no credential dependency to run the full pipeline end-to-end |
| WebSocket push (not polling) | 5-second sensor cadence requires push; REST polling at this frequency would generate excessive load and introduce stale-data latency |
| FastAPI + uvicorn (not Django/Flask) | ASGI stack required for native WebSocket + async support; minimal overhead for a stateless API |

## IBM Technologies Used

- **IBM Bob / watsonx.ai (`ibm/granite-13b-instruct-v2`):**
  Used via the watsonx.ai text generation REST endpoint
  (`/ml/v1/text/generation?version=2023-05-29`). Three distinct use cases:
  1. **Dispatch plan generation** (`/plan`): Bob receives a structured JSON prompt containing
     the top-N at-risk assets (default 10, up to 50) with their risk scores, contributing factors,
     customer impact, criticality, district, age, and current weather. Bob returns a complete JSON dispatch
     plan with per-asset operational actions, crew types, locations, ETAs, and a summary.
  2. **Risk explanation** (`/assets/{id}/explain`): Bob explains in plain language why a
     specific asset has its current risk level, translating machine scores into operator-ready
     reasoning.
  3. **Free-text Q&A** (`POST /ask`): Bob answers operator questions such as "which district
     has the highest outage risk right now?" using the current ranked asset context.

  IBM Bob is **load-bearing** — not name-dropped. The `/plan` and `/ask` endpoints call
  `ask_bob()` in [`bob_client.py`](../src/backend/bob_integration/bob_client.py) on every
  request. When credentials are not set, the system automatically falls back to a
  deterministic mock that exercises the same code path so the full pipeline always runs.
