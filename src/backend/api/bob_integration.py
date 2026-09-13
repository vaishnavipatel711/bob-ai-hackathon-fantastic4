"""
bob_integration.py

Thin proxy boundary to a teammate's IBM Bob integration, which will
generate a richer natural-language explanation of an asset's risk.

Day 1: teammate's Bob client doesn't exist yet, so get_bob_explanation()
raises BobUnavailable. routes.py catches this and falls back to a
local, template-based explanation built directly from contributing_factors
(so /assets/{id}/explain always returns something sensible).

Day 2 swap: once the teammate's client exists, replace the body of
get_bob_explanation() with the real call -- the function signature and
the BobUnavailable contract can stay the same, so routes.py needs no changes.
"""

from typing import Optional


class BobUnavailable(Exception):
    """Raised when the Bob integration isn't ready / reachable."""


def get_bob_explanation(asset: dict) -> Optional[dict]:
    """
    Ask the teammate's Bob integration for a natural-language explanation
    of this asset's risk.

    Expected future return shape (agree with teammate before Day 2):
        {"summary": str, "source": "bob"}

    Day 1: not implemented yet -- always raises BobUnavailable so callers
    fall back to the local explanation.
    """
    # --- DAY 2 SWAP POINT ---------------------------------------------
    # from .teammate_bob_client import explain_asset
    # return explain_asset(asset)
    # --------------------------------------------------------------------
    raise BobUnavailable("Bob integration not wired up yet (Day 1 mock mode)")