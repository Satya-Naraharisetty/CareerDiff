"""Integration tests for Resume Rewriter, Template Listing, and LaTeX Rendering endpoints."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_list_templates_endpoint(async_client: AsyncClient) -> None:
    """Verify GET /api/v1/resumes/templates returns 4 supported templates."""
    response = await async_client.get("/api/v1/resumes/templates")
    assert response.status_code == 200
    templates = response.json()
    assert len(templates) == 4
    ids = [t["id"] for t in templates]
    assert "jakes_resume" in ids
    assert "modern_tech" in ids
    assert "executive_serif" in ids
    assert "minimalist_sans" in ids


@pytest.mark.asyncio
async def test_rewrite_resume_endpoint(async_client: AsyncClient) -> None:
    """Verify POST /api/v1/resumes/rewrite computes score, returns suggestions, templates, and renders LaTeX."""
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
        "template_style": "modern_tech",
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
    # Verified modern_tech styling applied
    assert r"\definecolor{primary}{HTML}{0D9488}" in data["latex_source"]
    assert "FinTech Cloud" in data["latex_source"]
    assert data["template_style"] == "modern_tech"

    # Multi-template and studio enhancements
    assert "available_templates" in data
    assert len(data["available_templates"]) == 4
    assert "page_fit" in data
    assert data["page_fit"]["estimated_pages"] >= 1
    assert "cover_letter_text" in data
    assert "cover_letter_latex" in data
    assert "Senior Distributed Systems Architect" in data["cover_letter_text"]


@pytest.mark.asyncio
async def test_render_latex_endpoint(async_client: AsyncClient) -> None:
    """Verify POST /api/v1/resumes/render-latex allows on-the-fly re-rendering."""
    profile_payload = {
        "full_name": "Devin Torres",
        "contact_phone": "+1 555-432-1098",
        "contact_email": "devin@example.com",
        "linkedin_url": "linkedin.com/in/devin",
        "github_url": "github.com/devin",
        "location": "New York, NY",
        "summary": "Distributed systems specialist.",
        "skills_by_category": {
            "Languages": ["Go", "Python", "Rust"],
            "Frameworks": ["FastAPI", "gRPC"],
            "Developer Tools": ["Docker", "Kubernetes"],
            "Databases & Cloud": ["PostgreSQL", "Kafka"],
        },
        "experiences": [
            {
                "company": "UltraScale",
                "position": "Lead Engineer",
                "location": "New York, NY",
                "dates": "2020 - Present",
                "highlights": ["Designed multi-region Raft cluster for consensus replication."],
            }
        ],
        "projects": [],
        "education": [],
    }

    render_req = {
        "profile": profile_payload,
        "template_style": "executive_serif",
    }
    response = await async_client.post("/api/v1/resumes/render-latex", json=render_req)
    assert response.status_code == 200
    res_data = response.json()
    assert "latex_source" in res_data
    assert r"\usepackage{charter}" in res_data["latex_source"]
    assert "Devin Torres" in res_data["latex_source"]
    assert "UltraScale" in res_data["latex_source"]
    assert res_data["template_style"] == "executive_serif"


@pytest.mark.asyncio
async def test_rewrite_resume_validation_error(async_client: AsyncClient) -> None:
    """Verify endpoint rejects empty or short inputs with 422."""
    payload = {
        "resume_text": "Too short",
        "jd_text": "Short",
    }
    response = await async_client.post("/api/v1/resumes/rewrite", json=payload)
    assert response.status_code == 422
