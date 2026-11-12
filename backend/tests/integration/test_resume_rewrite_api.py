"""Integration tests for POST /api/v1/resumes/rewrite endpoint."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_rewrite_resume_endpoint(async_client: AsyncClient) -> None:
    """Verify POST /api/v1/resumes/rewrite computes score, returns suggestions, and renders LaTeX."""
    payload = {
        "resume_text": """Alex Rivera
Senior Distributed Systems Engineer
alex@example.com

EXPERIENCE
Senior Software Engineer | FinTech Cloud (2021 - Present)
• Built Kafka pipeline processing 50k events/sec with low latency
• Scaled PostgreSQL database using custom indexing
""",
        "jd_text": """Role: Senior Distributed Systems Architect
Requirements:
• 6+ years designing distributed systems with Kafka and PostgreSQL
• Deep expertise with idempotency tokens and sub-50ms P99 latency bounds
""",
        "candidate_seniority": "SENIOR",
    }
    response = await async_client.post("/api/v1/resumes/rewrite", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert "ats_score" in data
    assert 0 <= data["ats_score"] <= 100
    assert "ats_breakdown" in data
    assert "suggestions" in data
    assert len(data["suggestions"]) > 0
    assert "latex_source" in data
    assert r"\documentclass[letterpaper,11pt]{article}" in data["latex_source"]
    assert "FinTech Cloud" in data["latex_source"]


@pytest.mark.asyncio
async def test_rewrite_resume_validation_error(async_client: AsyncClient) -> None:
    """Verify endpoint rejects empty or short inputs with 422."""
    payload = {
        "resume_text": "Too short",
        "jd_text": "Short",
    }
    response = await async_client.post("/api/v1/resumes/rewrite", json=payload)
    assert response.status_code == 422
