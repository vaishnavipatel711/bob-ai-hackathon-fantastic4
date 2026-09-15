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
70 million people. A single 220 kV substation failure can black out 100,000+ customers.

## Why It Matters

- **Financial:** Unplanned blackouts cost utilities **$1M+ per hour** in direct restoration
  costs, regulatory penalties, and lost revenue from industrial customers.
- **Safety:** Critical infrastructure (hospitals, water treatment, emergency services) depends
  on continuous supply. Calendar-based maintenance cannot prevent failures that occur between
  inspection cycles.
- **Operational:** Reactive maintenance requires emergency crew mobilisation, often during
  the same weather events that caused the failure — compounding the risk to field workers.

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
