"""Integration tests for Job Role catalog and Interview Blueprint generation."""

import uuid

import pymupdf
import pytest
from httpx import AsyncClient

from app.core.database import async_session_factory
from app.scripts.seed_roles import seed_job_roles


@pytest.fixture(autouse=True)
async def ensure_roles_seeded() -> None:
    """Ensure catalog roles are seeded in the database before running tests."""
    async with async_session_factory() as session:
        await seed_job_roles(session)


async def register_candidate_with_resume(async_client: AsyncClient) -> tuple[str, str]:
    """Helper creating user, uploading resume with claims, and returning (token, email)."""
    unique_email = f"plan_cand_{uuid.uuid4().hex[:8]}@example.com"
    reg_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": unique_email,
            "password": "SecurePassword123!",
            "full_name": "Planning Candidate",
        },
    )
    assert reg_res.status_code == 201
    token: str = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Generate synthetic PDF with Kafka & Postgres assertions
    doc = pymupdf.open()
    page = doc.new_page()
    lines = [
        "Alex Rivera - Senior Backend Engineer",
        "Experience",
        "• Architected low-latency Kafka pipeline processing 50k events/sec",
        "• Scaled PostgreSQL database using read replicas and Redis caching",
    ]
    y = 72
    for line in lines:
        page.insert_text((50, y), line, fontsize=11)
        y += 24
    pdf_bytes: bytes = doc.tobytes()
    doc.close()

    files = {"file": ("Resume.pdf", pdf_bytes, "application/pdf")}
    upload_res = await async_client.post("/api/v1/resumes", files=files, headers=headers)
    assert upload_res.status_code == 202

    return token, unique_email


@pytest.mark.asyncio
async def test_get_roles_catalog(async_client: AsyncClient) -> None:
    """Verify GET /api/v1/roles returns seeded engineering roles with competencies."""
    response = await async_client.get("/api/v1/roles")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    roles = data["items"]
    assert len(roles) >= 3

    role_names = [r["name"] for r in roles]
    assert "Backend Engineering" in role_names
    assert "Frontend Engineering" in role_names
    assert "Fullstack Engineering" in role_names

    # Check that competencies are returned with display orders
    backend_role = next(r for r in roles if r["name"] == "Backend Engineering")
    assert len(backend_role["competencies"]) >= 3
    for comp in backend_role["competencies"]:
        assert comp["name"] is not None
        assert comp["slug"] is not None
        assert comp["display_order"] >= 1


@pytest.mark.asyncio
async def test_create_interview_and_blueprint(async_client: AsyncClient) -> None:
    """Verify POST /api/v1/interviews generates Interview and deterministic Blueprint."""
    token, _ = await register_candidate_with_resume(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Get backend role id
    roles_res = await async_client.get("/api/v1/roles")
    roles = roles_res.json()["items"]
    backend_role = next(r for r in roles if r["slug"] == "backend-engineering")
    role_id = backend_role["id"]

    # 2. Schedule 30-minute voice interview
    payload = {
        "role_id": role_id,
        "target_seniority": "SENIOR",
        "duration_minutes": 30,
        "mode": "VOICE",
    }
    create_res = await async_client.post("/api/v1/interviews", json=payload, headers=headers)
    assert create_res.status_code == 201
    data = create_res.json()

    assert "interview_id" in data
    assert data["state"] == "CREATED"
    assert data["scheduled_duration_minutes"] == 30

    blueprint = data["blueprint"]
    assert blueprint["total_allocated_seconds"] == 1800
    assert blueprint["warmup_seconds"] == 120
    assert blueprint["conclusion_seconds"] == 180
    assert blueprint["total_topics"] >= 2

    # Verify time budget conservation
    topics = blueprint["topics"]
    topic_sum = sum(t["allocated_seconds"] for t in topics)
    assert topic_sum + blueprint["warmup_seconds"] + blueprint["conclusion_seconds"] == 1800

    # Verify claim matching happened on relevant topics (Kafka / Postgres)
    total_mapped = sum(t["mapped_claims_count"] for t in topics)
    assert total_mapped >= 1


@pytest.mark.asyncio
async def test_create_interview_invalid_role(async_client: AsyncClient) -> None:
    """Verify scheduling interview with non-existent role returns 404."""
    token, _ = await register_candidate_with_resume(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    payload = {
        "role_id": str(uuid.uuid4()),
        "target_seniority": "SENIOR",
        "duration_minutes": 30,
    }
    res = await async_client.post("/api/v1/interviews", json=payload, headers=headers)
    assert res.status_code == 404
    assert "not found" in res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_create_interview_unauthorized(async_client: AsyncClient) -> None:
    """Verify scheduling interview without token returns 401."""
    payload = {
        "role_id": str(uuid.uuid4()),
        "target_seniority": "SENIOR",
        "duration_minutes": 30,
    }
    res = await async_client.post("/api/v1/interviews", json=payload)
    assert res.status_code == 401
