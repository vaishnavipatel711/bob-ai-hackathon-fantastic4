"""
Owner: Person 3

Wrapper around IBM Bob / watsonx.ai API calls.

MOCK MODE:
If no real credentials are set in the environment, this runs in mock mode
and generates rule-based reasoning text from the context you pass in.
This means the rest of your code (reasoning_engine.py, maintenance_plan_generator.py)
works end-to-end RIGHT NOW without needing real API access — swap in real
credentials later and nothing else changes.
"""

import os
import time
import requests
from dotenv import load_dotenv

load_dotenv()

IBM_BOB_API_KEY = os.getenv("IBM_BOB_API_KEY", "")
IBM_BOB_ENDPOINT = os.getenv("IBM_BOB_ENDPOINT", "")
WATSONX_PROJECT_ID = os.getenv("WATSONX_PROJECT_ID", "")

# If any real credential is missing, we run in MOCK MODE automatically.
MOCK_MODE = not (IBM_BOB_API_KEY and IBM_BOB_ENDPOINT and WATSONX_PROJECT_ID)


def ask_bob(prompt: str, context: dict = None) -> str:
    """
    Send a prompt (with optional context dict) to IBM Bob / watsonx.ai
    and return the text response.

    In MOCK_MODE, generates a plausible rule-based response instead of
    calling a real API, so the whole pipeline runs without credentials.
    """
    context = context or {}

    if MOCK_MODE:
        return _mock_response(prompt, context)

    try:
        response = requests.post(
            IBM_BOB_ENDPOINT,
            headers={
                "Authorization": f"Bearer {IBM_BOB_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "project_id": WATSONX_PROJECT_ID,
                "input": prompt,
                "parameters": {
                    "decoding_method": "greedy",
                    "max_new_tokens": 300,
                    "temperature": 0.3,
                },
            },
            timeout=15,
        )
        response.raise_for_status()
        data = response.json()
        # NOTE: adjust this line if the real watsonx response shape differs
        return data.get("results", [{}])[0].get("generated_text", "").strip()

    except Exception as e:
        print(f"[bob_client] Real API call failed, falling back to mock: {e}")
        return _mock_response(prompt, context)


def _mock_response(prompt: str, context: dict) -> str:
    """
    Rule-based stand-in for Bob's response, used when no credentials are
    configured or the real call fails. Keeps the demo alive no matter what.
    Handles three context shapes: a single asset, an asset_a/asset_b
    comparison, and a ranked_assets list (for plan summaries).
    """
    time.sleep(0.3)  # simulate latency so the UI loading state is visible

    # Comparison context: {"asset_a": {...}, "asset_b": {...}}
    if "asset_a" in context and "asset_b" in context:
        return _mock_compare(context["asset_a"], context["asset_b"])

    # Ranked list context: {"ranked_assets": [...], "weather": {...}}
    if "ranked_assets" in context:
        return _mock_summary(context["ranked_assets"], context.get("weather"))

    # Single asset context
    return _mock_single_asset(context)


def _mock_single_asset(asset: dict) -> str:
    asset_name = asset.get("location", {}).get("name", asset.get("asset_id", "This asset"))
    factors = asset.get("contributing_factors", [])
    days = asset.get("predicted_days_to_failure")

    if factors:
        factor_text = ", ".join(
            f"{f.get('factor', 'unknown factor')} ({f.get('value', 'n/a')})" for f in factors
        )
        explanation = f"{asset_name} is flagged high priority due to: {factor_text}."
        if days is not None:
            explanation += f" Failure is projected within approximately {days} days if unaddressed."
        return explanation

    return f"{asset_name} requires attention based on current sensor and weather indicators."


def _mock_compare(asset_a: dict, asset_b: dict) -> str:
    name_a = asset_a.get("location", {}).get("name", asset_a.get("asset_id", "Asset A"))
    name_b = asset_b.get("location", {}).get("name", asset_b.get("asset_id", "Asset B"))
    score_a = asset_a.get("risk_score", 0)
    score_b = asset_b.get("risk_score", 0)

    higher, lower = (name_a, name_b) if score_a >= score_b else (name_b, name_a)
    higher_score, lower_score = max(score_a, score_b), min(score_a, score_b)

    return (
        f"{higher} is higher priority than {lower} (risk score {higher_score} vs "
        f"{lower_score}). This reflects more severe contributing factors and a "
        f"shorter projected time to failure at {higher}."
    )


def _mock_summary(ranked_assets: list, weather: dict = None) -> str:
    if not ranked_assets:
        return "No assets currently flagged as at-risk."

    top = ranked_assets[0]
    top_name = top.get("location", {}).get("name", top.get("asset_id", "the top asset"))
    count = len(ranked_assets)
    weather_note = ""
    if weather:
        weather_note = " Forecasted weather conditions raise near-term risk further."

    return (
        f"{count} assets are currently flagged for attention, led by {top_name} as the "
        f"top priority.{weather_note} Crews should be dispatched in priority order "
        f"starting with the highest-risk assets to minimize potential customer impact."
    )
