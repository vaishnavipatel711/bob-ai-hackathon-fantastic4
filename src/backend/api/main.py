"""
main.py

FastAPI entrypoint for U1: Power Outage Prediction & Grid Equipment
Failure Advisor.

Run locally (from repo root):
    uvicorn src.backend.api.main:app --reload --port 8000

Then visit http://localhost:8000/docs for interactive Swagger UI.
"""

import asyncio
import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .routes import router
from ..data.gujarat_assets import GUJARAT_ASSETS
from ..data.realtime_simulator import simulator as sensor_sim
from ..data.weather_simulator import weather_simulator as wx_sim
from ..models.risk_engine import compute_all_risks
from ..models.district_risk import compute_district_risks
from ..models.alert_engine import alert_engine


# ---------------------------------------------------------------------------
# Lifespan: start/stop background simulators
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    sensor_sim.start()
    wx_sim.start()
    yield
    # Shutdown
    sensor_sim.stop()
    wx_sim.stop()


app = FastAPI(
    title="Grid Equipment Failure Advisor API",
    description="Risk scoring, failure prediction, and impact-ranked "
    "maintenance planning for power grid assets (IBM Bob AI Hackathon - U1).",
    version="0.2.0",
    lifespan=lifespan,
)

# CORS: wide open for hackathon speed. Tighten allow_origins before any
# real deployment.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)


@app.get("/")
def health_check():
    return {"status": "ok", "service": "grid-equipment-failure-advisor-api"}


# ---------------------------------------------------------------------------
# WebSocket: /ws/live — pushes a full update every 5 seconds
# ---------------------------------------------------------------------------

# Track active WS connections
_ws_clients: list[WebSocket] = []
_ws_lock = asyncio.Lock()


async def _build_live_payload() -> dict:
    """Build the full live-update JSON payload."""
    sensors = sensor_sim.get_current_readings()
    weather = wx_sim.get_all_weather()

    asset_risks = compute_all_risks(GUJARAT_ASSETS, sensors, weather)
    district_risks = compute_district_risks(asset_risks, GUJARAT_ASSETS, weather)

    # Run alert engine with latest data
    alert_engine.process_update(asset_risks, sensors, weather, GUJARAT_ASSETS)
    alerts = alert_engine.get_active_alerts()

    # Build assets array with current risk
    assets_payload = []
    for asset in GUJARAT_ASSETS:
        aid = asset["asset_id"]
        risk = asset_risks.get(aid)
        sensor = sensors.get(aid)
        row = {
            "asset_id": aid,
            "asset_name": asset["asset_name"],
            "asset_type": asset["asset_type"],
            "district": asset["district"],
            "latitude": asset["latitude"],
            "longitude": asset["longitude"],
            "criticality": asset["criticality"],
            "customers_served": asset["customers_served"],
        }
        if risk:
            row.update({
                "overall_risk_score": risk.overall_risk_score,
                "risk_level": risk.risk_level,
                "failure_probability": risk.failure_probability,
                "customers_at_risk": risk.customers_at_risk,
                "recommended_action": risk.recommended_action,
                "action_urgency_hours": risk.action_urgency_hours,
            })
        if sensor:
            row.update({
                "temperature_c": sensor.temperature_c,
                "load_pct": sensor.load_pct,
                "vibration_mm_s": sensor.vibration_mm_s,
                "partial_discharge_pc": sensor.partial_discharge_pc,
                "anomaly_active": sensor.anomaly_active,
                "anomaly_type": sensor.anomaly_type,
            })
        assets_payload.append(row)

    # Sensor update age: time since last simulator tick (should be ≤5s)
    now_ts = datetime.now(tz=timezone.utc).isoformat()

    return {
        "type": "live_update",
        "timestamp": now_ts,
        "data_label": "DEMO DATA — Simulated real-time sensor stream",
        "assets": assets_payload,
        "alerts": [a.to_dict() for a in alerts[:20]],
        "district_risks": {k: v.to_dict() for k, v in district_risks.items()},
        "weather": {k: v.to_dict() for k, v in weather.items()},
        "system": {
            "mode": "DEMO",
            "connected_assets": len(GUJARAT_ASSETS),
            "sensor_update_age_s": 5,
            "weather_update_age_s": 30,
            "prediction_age_s": 5,
        },
    }


@app.websocket("/ws/live")
async def ws_live(websocket: WebSocket):
    await websocket.accept()
    async with _ws_lock:
        _ws_clients.append(websocket)
    try:
        while True:
            try:
                payload = await _build_live_payload()
                await websocket.send_text(json.dumps(payload))
            except Exception:
                # If payload build fails, send a minimal error frame
                try:
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
                        "message": "Payload build error — retrying next cycle",
                    }))
                except Exception:
                    break
            await asyncio.sleep(5)
    except WebSocketDisconnect:
        pass
    finally:
        async with _ws_lock:
            try:
                _ws_clients.remove(websocket)
            except ValueError:
                pass
