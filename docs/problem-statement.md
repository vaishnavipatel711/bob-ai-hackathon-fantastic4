# Problem Statement

## Background

Power grid utilities operate thousands of transformers, substations, switchgear panels,
feeders, and transmission lines across a geographic area. Every one of these assets carries
live sensor instrumentation measuring temperature, vibration, partial discharge activity,
oil quality, and load percentage. When an asset fails unexpectedly, the result is an
unplanned blackout — costly to restore, dangerous to the public, and potentially fatal to
critical infrastructure like hospitals and water treatment plants.

## The Problem

**Utility grid operators know a transformer is failing only after it has already failed.**

The failure signals — degraded oil, rising temperature, above-threshold vibration, increasing
partial discharge — are measurable **weeks before failure** using the sensors already installed
on the asset. But these signals are stored in silos and never combined with weather forecasts
or historical incident records in real time. A transformer with degraded oil, elevated
vibration, and a storm forecast arriving in 72 hours has a compounded failure risk — but no
existing system presents that combined risk score to the operator before the event.

The result: utilities default to **calendar-based maintenance** (inspect every N months
regardless of actual condition), dispatching crews to healthy assets while genuinely
failing assets are missed between inspection cycles.

## Who is Affected

**Grid operations managers and field maintenance crews** at power utilities — specifically:

- **Control-room operators** who monitor dozens of assets in real time but have no single
  risk view that combines sensor health, weather exposure, and incident history.
- **Maintenance planners** who allocate limited crew resources across many assets and need
  to know which assets to prioritise this week vs. next month.
- **Field crew dispatchers** who need to know which crew to send, where, and by when — not
  just a list of "at-risk" assets with no operational context.

In Gujarat, India — the focus of this project — the state grid serves approximately
**70 million people** across 33 districts. Gujarat State Electricity Corporation (GSECL) and
its successor utilities operate over **20,000 distribution transformers** and hundreds of
high-voltage substations. A single 220 kV substation failure can black out **100,000+
customers** and take 4–12 hours to restore under emergency conditions.

## Quantified Pain

| Metric | Value | Source context |
|---|---|---|
| Cost of unplanned blackout | **$1M+ per hour** | Direct restoration costs, regulatory penalties, industrial customer compensation |
| Gujarat transformer failure rate | **~3–5% per year** for assets over 15 years old | Consistent with IEEE industry data for aging distribution assets |
| Calendar maintenance waste | **60–70% of inspected assets** are healthy at time of inspection | Maintenance crews dispatched to low-risk assets while high-risk ones are missed |
| Storm-related failures | **2–4× baseline failure rate** during and immediately after severe weather events | Compounded sensor degradation + physical stress |
| Mean time to restore (MTTR) | **4–8 hours** for a major substation failure under normal conditions; up to **24 hours** during a weather event when multiple assets fail simultaneously | Emergency response during the same storm that caused the failure |
| Critical infrastructure at risk | Hospitals, water treatment plants, emergency services — **zero tolerance for outage** yet no preferential risk scoring in existing systems | |

## Why Existing Solutions Fall Short

Current utility monitoring systems:

- **Display raw sensor readings** per asset in isolation — operators must mentally combine
  temperature, vibration, and oil quality to form a risk judgement. No system does this
  for them.
- **Never combine weather forecasts** with sensor degradation. A transformer already at 85%
  of rated temperature becomes critical when a heat wave is forecast — but that combination
  is not computed anywhere.
- **Ignore incident history** in real-time scoring. An asset that has failed twice in the
  last 12 months is materially more likely to fail again, but calendar-based schedules treat
  it identically to a new asset.
- **Produce no operational output.** Even systems that do compute a risk score stop at a
  number on a screen. They do not answer "who should we send, to which asset, from where,
  to do what, and by when?"
- **No AI-generated dispatch language.** A ranked list of risky assets still requires a
  human planner to translate it into crew assignments, ETAs, and pre-positioning decisions —
  a manual step that takes 30–60 minutes under pressure and introduces human error.

## Why This Problem Matters Now

Three converging trends make this problem more urgent today than it was five years ago:

1. **Aging infrastructure.** Gujarat's grid was built out rapidly in the 1990s–2000s.
   A large fraction of its transformers and substations are now 15–25 years old — the age
   window where failure rates increase non-linearly. Calendar maintenance cycles that were
   adequate for new assets are no longer sufficient.

2. **Increasing weather severity.** Gujarat experiences cyclones, extreme heat events, and
   monsoon flooding with growing frequency and intensity. Each weather event creates a
   compound failure scenario: sensors already in degraded states are pushed past their
   operating limits at exactly the moment when restoration is hardest (flooded roads,
   high winds, crews unavailable).

3. **AI is now accessible.** Foundation models like IBM Bob (watsonx.ai Granite) can
   generate contextual, operator-ready operational language from structured data in real
   time — something that was not practically deployable at utility scale two years ago.
   The combination of explainable risk scoring and AI-generated dispatch planning is now
   a realistic production capability, not a research project.
