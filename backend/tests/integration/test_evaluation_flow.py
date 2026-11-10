"""Integration tests for Interview Evaluation Flow, Outbox Dispatch, and Dossier API."""

import uuid

import pymupdf
import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.database import async_session_factory
from app.models.outbox import OutboxEvent
from app.models.role import JobRole
from app.scripts.seed_roles import seed_job_roles
from app.services.outbox_poller import OutboxPoller


@pytest.fixture(autouse=True)
async def ensure_roles_seeded() -> None:
    """Ensure catalog roles are seeded in the database before running tests."""
    async with async_session_factory() as session:
        await seed_job_roles(session)


async def register_candidate_with_resume(async_client: AsyncClient) -> tuple[str, str]:
    """Helper creating user, uploading resume with claims, and returning (token, email)."""
    unique_email = f"eval_cand_{uuid.uuid4().hex[:8]}@example.com"
    reg_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": unique_email,
            "password": "SecurePassword123!",
            "full_name": "Evaluation Candidate",
        },
    )
    assert reg_res.status_code == 201
    token: str = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Generate synthetic PDF with Kafka claim
    doc = pymupdf.open()
    page = doc.new_page()
    lines = [
        "Alex Rivera - Senior Distributed Systems Engineer",
        "Experience",
        "• Architected low-latency Kafka pipeline processing 50k events/sec",
        "• Implemented distributed locking using Redis Redlock and PostgreSQL",
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
async def test_full_interview_completion_outbox_and_evaluation_flow(
    async_client: AsyncClient,
) -> None:
    """Verify end-to-end completion stages outbox event, compiles report, and serves dossier."""
    token, _ = await register_candidate_with_resume(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Fetch Backend Role
    async with async_session_factory() as session:
        stmt = select(JobRole).where(JobRole.slug == "backend-engineering")
        role = (await session.execute(stmt)).scalar_one()
        role_id = role.id

    # 2. Create Interview (15 min)
    create_res = await async_client.post(
        "/api/v1/interviews",
        json={
            "role_id": str(role_id),
            "target_seniority": "SENIOR",
            "duration_minutes": 15,
            "mode": "TEXT",
        },
        headers=headers,
    )
    assert create_res.status_code == 201
    interview_id = create_res.json()["interview_id"]

    # 3. Negative check: Report should return 404 before evaluation
    rep_pre_res = await async_client.get(
        f"/api/v1/interviews/{interview_id}/report",
        headers=headers,
    )
    assert rep_pre_res.status_code == 404

    # 4. Start Interview (Turn 0)
    start_res = await async_client.post(
        f"/api/v1/interviews/{interview_id}/start",
        headers=headers,
    )
    assert start_res.status_code == 200
    assert start_res.json()["turn_index"] == 0

    # 5. Submit candidate turns across topics to reach CONCLUSION and COMPLETION
    # Turn 1: Warmup answer
    t1_res = await async_client.post(
        f"/api/v1/interviews/{interview_id}/turns",
        json={
            "transcript": (
                "Hi! I am a senior engineer with strong background in distributed systems "
                "and high-throughput Kafka pipelines."
            ),
            "duration_ms": 10000,
        },
        headers=headers,
    )
    assert t1_res.status_code == 200

    # Submit technical answers until completion
    is_completed = False
    for _ in range(25):
        t_res = await async_client.post(
            f"/api/v1/interviews/{interview_id}/turns",
            json={
                "transcript": (
                    "We used partitioned Kafka topics with partition keys based on account ID. "
                    "For locking, we utilized optimistic concurrency with version checks in DB, "
                    "benchmarked to maintain sub-50ms p99 latency under 20k concurrent requests."
                ),
                "duration_ms": 15000,
            },
            headers=headers,
        )
        assert t_res.status_code == 200
        if t_res.json()["session_state"] == "COMPLETED":
            is_completed = True
            break

    assert is_completed, "Interview failed to reach COMPLETED state within allotted turns"

    # 6. Verify Transactional Outbox Event was created in PostgreSQL
    async with async_session_factory() as db:
        stmt_outbox = select(OutboxEvent).where(
            OutboxEvent.aggregate_id == uuid.UUID(interview_id),
            OutboxEvent.event_type == "interview.completed",
        )
        outbox_event = (await db.execute(stmt_outbox)).scalar_one_or_none()
        assert outbox_event is not None
        assert outbox_event.status == "PENDING"
        assert outbox_event.payload["interview_id"] == interview_id

        # 7. Run Outbox Poller to dispatch to Taskiq worker
        dispatched = await OutboxPoller.poll_and_dispatch_batch(
            db=db, worker_id="integration-test-poller"
        )
        assert dispatched >= 1

        # Event should now be marked PUBLISHED
        await db.refresh(outbox_event)
        assert outbox_event.status == "PUBLISHED"

    # 8. Trigger/Confirm Evaluation Report via REST API
    eval_res = await async_client.post(
        f"/api/v1/interviews/{interview_id}/evaluate",
        headers=headers,
    )
    assert eval_res.status_code == 200
    assert eval_res.json()["status"] == "COMPLETED"

    # 9. Fetch completed assessment report
    report_res = await async_client.get(
        f"/api/v1/interviews/{interview_id}/report",
        headers=headers,
    )
    assert report_res.status_code == 200
    report_data = report_res.json()

    assert report_data["interview_id"] == interview_id
    assert report_data["overall_score"] is not None
    assert report_data["overall_score"] >= 2.0
    assert len(report_data["competency_scores"]) >= 2
    assert len(report_data["strengths"]) >= 1

    # Verify grounded evidence items
    has_evidence = False
    for cs in report_data["competency_scores"]:
        if cs["status"] == "EVALUATED":
            assert cs["score"] in (1, 2, 3, 4)
            for ev in cs["evidence_items"]:
                has_evidence = True
                assert ev["start_char_offset"] >= 0
                assert ev["end_char_offset"] > ev["start_char_offset"]
                assert len(ev["transcript_excerpt"]) > 0
    assert has_evidence, "Expected at least one grounded evidence item for evaluated competencies"

    # Verify Claim Verifications
    assert len(report_data["claim_verifications"]) >= 1
    kafka_claim = next(
        (c for c in report_data["claim_verifications"] if "kafka" in c["claim_text"].lower()),
        None,
    )
    assert kafka_claim is not None
    assert kafka_claim["status"] in ("VERIFIED", "VAGUE")

    # 10. Verify Dossier HTML endpoint
    dossier_res = await async_client.get(f"/api/v1/interviews/{interview_id}/dossier?token={token}")
    assert dossier_res.status_code == 200
    assert "IntervueX Assessment Dossier" in dossier_res.text
    assert "radar-chart" in dossier_res.text
