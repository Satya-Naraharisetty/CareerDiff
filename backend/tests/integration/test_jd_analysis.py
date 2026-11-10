"""Integration tests for Job Description parsing, role tailoring, and blueprinting."""

import uuid

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_jd_analysis_and_tailored_role_creation(async_client: AsyncClient) -> None:
    """Verify posting a JD generates tailored competencies and creates a JobRole."""
    # Register user
    email = f"jd_cand_{uuid.uuid4().hex[:8]}@example.com"
    reg_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "SecurePassword123!",
            "full_name": "JD Candidate",
        },
    )
    assert reg_res.status_code == 201
    token: str = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Ingest candidate resume
    resume_text = (
        "Morgan Smith - Senior Backend Engineer\n"
        "Experience\n"
        "• Scaled Kafka streaming pipeline handling 80,000 req/sec\n"
        "• Optimized PostgreSQL database queries using partitioning and Redis cache\n"
        "• Built distributed microservices using Python and FastAPI\n"
    )
    res_upload = await async_client.post(
        "/api/v1/resumes/text",
        json={"raw_text": resume_text, "filename": "morgan_resume.txt"},
        headers=headers,
    )
    assert res_upload.status_code == 202

    # 2. Analyze Job Description
    jd_content = (
        "Role: Senior Distributed Systems Architect - Payments Infrastructure\n"
        "Company: GlobalFinTech Corp\n"
        "About the Role:\n"
        "We are looking for a Senior Distributed Systems Engineer to scale our ledger.\n\n"
        "Requirements:\n"
        "• 6+ years of backend engineering experience with Python, FastAPI, or Go\n"
        "• Deep hands-on experience with Kafka, distributed consensus, and event streaming\n"
        "• Proven track record tuning PostgreSQL MVCC, query indexing, and Redis caching\n"
        "• Expertise in microservice resiliency, circuit breakers, and rate limiting\n"
    )

    jd_res = await async_client.post(
        "/api/v1/roles/analyze-jd",
        json={"jd_text": jd_content, "job_title": "Senior Distributed Systems Architect"},
        headers=headers,
    )
    assert jd_res.status_code == 200
    jd_data = jd_res.json()

    assert jd_data["detected_seniority"] == "SENIOR"
    assert jd_data["primary_discipline"] == "BACKEND"
    assert "Senior Distributed Systems Architect" in jd_data["extracted_title"]
    assert len(jd_data["matched_technologies"]) >= 3
    assert any("Kafka" in t for t in jd_data["matched_technologies"])
    assert len(jd_data["tailored_competencies"]) >= 3

    custom_role_id = jd_data["role"]["id"]

    # 3. Create interview using this tailored JD role
    create_res = await async_client.post(
        "/api/v1/interviews",
        json={
            "role_id": custom_role_id,
            "target_seniority": jd_data["detected_seniority"],
            "duration_minutes": 30,
            "mode": "TEXT",
        },
        headers=headers,
    )
    assert create_res.status_code == 201
    int_data = create_res.json()
    assert int_data["state"] == "CREATED"

    # Verify blueprint topics mapped claims from the uploaded resume
    topics = int_data["blueprint"]["topics"]
    assert len(topics) >= 2
    assert any(t["mapped_claims_count"] > 0 for t in topics)
