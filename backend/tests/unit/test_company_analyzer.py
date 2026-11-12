"""Unit tests for Company Intelligence & Engineering Archetype Classifier."""

import pytest

from app.core import config
from app.services.company_analyzer import (
    classify_company_from_catalog,
    classify_company_persona,
    heuristic_company_classification,
)


def test_classify_known_catalog_companies() -> None:
    """Verify known global tech leaders resolve to precise personas instantly."""
    # Big Tech
    res_google = classify_company_from_catalog("Google")
    assert res_google is not None
    assert res_google["detected_persona"] == "BIG_TECH"
    assert (
        "Spanner" in res_google["rationale"]
        or "Paxos" in res_google["rationale"]
        or "planet" in res_google["rationale"]
    )

    res_netflix = classify_company_from_catalog("Netflix")
    assert res_netflix is not None
    assert res_netflix["detected_persona"] == "BIG_TECH"
    assert (
        "chaos" in res_netflix["rationale"].lower()
        or "microservices" in res_netflix["rationale"].lower()
    )

    # Scale-Up
    res_stripe = classify_company_from_catalog("Stripe")
    assert res_stripe is not None
    assert res_stripe["detected_persona"] == "SCALE_UP"
    assert any("idempotency" in f.lower() for f in res_stripe["architectural_focus"])

    res_databricks = classify_company_from_catalog("Databricks")
    assert res_databricks is not None
    assert res_databricks["detected_persona"] == "SCALE_UP"

    # FinTech
    res_jpm = classify_company_from_catalog("JPMorgan Chase")
    assert res_jpm is not None
    assert res_jpm["detected_persona"] == "FINTECH"
    assert any("ACID" in f for f in res_jpm["architectural_focus"])

    res_citadel = classify_company_from_catalog("Citadel")
    assert res_citadel is not None
    assert res_citadel["detected_persona"] == "FINTECH"


def test_heuristic_classification_unlisted_companies() -> None:
    """Verify heuristic keywords detect domain archetypes for unlisted or startup companies."""
    res_fin = heuristic_company_classification(
        "Kredivo Payments", "Building a regional credit card ledger"
    )
    assert res_fin["detected_persona"] == "FINTECH"

    res_scale = heuristic_company_classification(
        "CloudFlow Scaleup", "A series B hypergrowth SaaS platform"
    )
    assert res_scale["detected_persona"] == "SCALE_UP"

    res_std = heuristic_company_classification(
        "Apex Consulting Solutions", "Enterprise web development"
    )
    assert res_std["detected_persona"] == "STANDARD"


@pytest.mark.asyncio
async def test_classify_company_persona_async_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    """Verify async entry point classifies arbitrary companies with fallback."""
    settings = config.get_settings()
    monkeypatch.setattr(settings, "gemini_api_key", "")

    res = await classify_company_persona("Monzo Bank", "UK retail banking neobank")
    assert res["detected_persona"] == "FINTECH"
    assert len(res["architectural_focus"]) >= 2
