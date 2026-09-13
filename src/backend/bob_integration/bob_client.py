"""
Owner: [Name]

Purpose:
Wrapper around IBM Bob / watsonx.ai API calls. This must be LOAD-BEARING
(judges score 10 pts specifically on whether Bob is genuinely integrated,
not just name-dropped) — Bob should do real reasoning over our ranked
risk data, not just paraphrase a template.

TODO:
- [ ] Auth/setup using IBM_BOB_API_KEY / WATSONX_PROJECT_ID from .env
- [ ] Function: ask_bob(prompt: str, context: dict) -> str
- [ ] Handle errors/timeouts gracefully for live demo reliability
"""
