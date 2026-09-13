"""
main.py

FastAPI entrypoint for U1: Power Outage Prediction & Grid Equipment
Failure Advisor.

Run locally (from repo root):
    uvicorn src.backend.api.main:app --reload --port 8000

Then visit http://localhost:8000/docs for interactive Swagger UI.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routes import router

app = FastAPI(
    title="Grid Equipment Failure Advisor API",
    description="Risk scoring, failure prediction, and impact-ranked "
    "maintenance planning for power grid assets (IBM Bob AI Hackathon - U1).",
    version="0.1.0",
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