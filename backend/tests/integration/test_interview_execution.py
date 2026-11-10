"""Integration tests for end-to-end adaptive text interview execution and durability."""

import uuid

import pytest
from httpx import AsyncClient

from app.core.database import async_session_factory
from app.scripts.seed_roles import seed_job_roles


@pytest.fixture(autouse=True)
async def ensure_roles_seeded() -> None:
    """Ensure catalog roles are seeded in the database before running tests."""
    async with async_session_factory() as session:
        await seed_job_roles(session)


async def setup_interview_session(async_client: AsyncClient) -> tuple[str, str]:
    """Helper registering candidate, creating interview, and returning (token, interview_id)."""
    email = f"session_cand_{uuid.uuid4().hex[:8]}@example.com"
    reg_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "SecurePassword123!",
            "full_name": "Adaptive Candidate",
        },
    )
    assert reg_res.status_code == 201
    token: str = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Fetch backend role
    roles_res = await async_client.get("/api/v1/roles", headers=headers)
    assert roles_res.status_code == 200
    roles = roles_res.json()["items"]
    backend_role = next(r for r in roles if r["slug"] == "backend-engineering")

    # Schedule interview
    create_res = await async_client.post(
        "/api/v1/interviews",
        json={
            "role_id": backend_role["id"],
            "target_seniority": "SENIOR",
            "duration_minutes": 30,
            "mode": "TEXT",
        },
        headers=headers,
    )
    assert create_res.status_code == 201
    interview_id: str = create_res.json()["interview_id"]

    return token, interview_id


@pytest.mark.asyncio
async def test_full_text_interview_lifecycle(async_client: AsyncClient) -> None:
    """Verify complete interview progression: Start -> Warmup -> Technical Core -> Turn Loop."""
    token, interview_id = await setup_interview_session(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Inspect initial session state
    detail_res = await async_client.get(f"/api/v1/interviews/{interview_id}", headers=headers)
    assert detail_res.status_code == 200
    assert detail_res.json()["state"] == "CREATED"
    assert detail_res.json()["total_turns"] == 0

    # 2. Start Interview -> Transitions to WARMUP and returns Turn 0
    start_res = await async_client.post(f"/api/v1/interviews/{interview_id}/start", headers=headers)
    assert start_res.status_code == 200
    turn_0 = start_res.json()
    assert turn_0["turn_index"] == 0
    assert turn_0["speaker"] == "INTERVIEWER"
    assert "Welcome" in turn_0["transcript"]

    # Verify session is now in WARMUP state
    detail_res2 = await async_client.get(f"/api/v1/interviews/{interview_id}", headers=headers)
    assert detail_res2.json()["state"] == "WARMUP"
    assert detail_res2.json()["total_turns"] == 1

    # 3. Candidate responds to warmup greeting
    turn_res = await async_client.post(
        f"/api/v1/interviews/{interview_id}/turns",
        json={"transcript": "I'm a senior engineer with 8 years building distributed systems."},
        headers=headers,
    )
    assert turn_res.status_code == 200
    interviewer_reply = turn_res.json()
    assert interviewer_reply["speaker"] == "INTERVIEWER"
    assert interviewer_reply["session_state"] == "TECHNICAL_CORE"
    assert interviewer_reply["action_taken"] == "CHANGE_TOPIC"
    assert interviewer_reply["active_topic"] is not None

    # 4. Candidate gives a shallow response to Topic 1 -> triggers PROBE_DEEPER
    turn_res2 = await async_client.post(
        f"/api/v1/interviews/{interview_id}/turns",
        json={"transcript": "We used Redis cache to speed things up."},
        headers=headers,
    )
    assert turn_res2.status_code == 200
    reply2 = turn_res2.json()
    assert reply2["action_taken"] == "PROBE_DEEPER"

    # 5. Retrieve all turns and verify sequential monotonicity and durability
    turns_res = await async_client.get(f"/api/v1/interviews/{interview_id}/turns", headers=headers)
    assert turns_res.status_code == 200
    turns = turns_res.json()
    # Expect: Turn 0 (Interviewer Warmup), Turn 1 (Candidate Warmup Answer),
    # Turn 2 (Interviewer Topic 1), Turn 3 (Candidate Shallow Answer), Turn 4 (Interviewer Probe)
    assert len(turns) == 5
    for idx, t in enumerate(turns):
        assert t["turn_index"] == idx


@pytest.mark.asyncio
async def test_probe_saturation_guardrail_forces_topic_change(async_client: AsyncClient) -> None:
    """Verify that 3 consecutive probes force the engine to override to CHANGE_TOPIC."""
    token, interview_id = await setup_interview_session(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # Start session
    await async_client.post(f"/api/v1/interviews/{interview_id}/start", headers=headers)

    # Warmup answer -> enters TECHNICAL_CORE
    await async_client.post(
        f"/api/v1/interviews/{interview_id}/turns",
        json={"transcript": "I have extensive backend experience."},
        headers=headers,
    )

    # Probe 1
    p1 = await async_client.post(
        f"/api/v1/interviews/{interview_id}/turns",
        json={"transcript": "We used PostgreSQL and Redis."},
        headers=headers,
    )
    assert p1.json()["action_taken"] == "PROBE_DEEPER"

    # Probe 2
    p2 = await async_client.post(
        f"/api/v1/interviews/{interview_id}/turns",
        json={"transcript": "We had standard read replicas."},
        headers=headers,
    )
    assert p2.json()["action_taken"] == "PROBE_DEEPER"

    # Probe 3
    p3 = await async_client.post(
        f"/api/v1/interviews/{interview_id}/turns",
        json={"transcript": "We used B-tree indexes."},
        headers=headers,
    )
    assert p3.json()["action_taken"] == "PROBE_DEEPER"

    # Probe 4 -> Saturation reached (3 probes executed); guardrail forces CHANGE_TOPIC!
    p4 = await async_client.post(
        f"/api/v1/interviews/{interview_id}/turns",
        json={"transcript": "We also partitioned tables by month."},
        headers=headers,
    )
    assert p4.json()["action_taken"] == "CHANGE_TOPIC"


@pytest.mark.asyncio
async def test_negative_paths_and_error_handling(async_client: AsyncClient) -> None:
    """Verify HTTP status codes for invalid transitions and non-existent sessions."""
    token, interview_id = await setup_interview_session(async_client)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Starting session twice fails with 400
    res1 = await async_client.post(f"/api/v1/interviews/{interview_id}/start", headers=headers)
    assert res1.status_code == 200

    res2 = await async_client.post(f"/api/v1/interviews/{interview_id}/start", headers=headers)
    assert res2.status_code == 400
    assert "Expected 'CREATED'" in res2.json()["detail"]

    # 2. Non-existent interview returns 404
    non_existent = str(uuid.uuid4())
    res_404 = await async_client.get(f"/api/v1/interviews/{non_existent}", headers=headers)
    assert res_404.status_code == 404

    # 3. Unauthenticated access returns 401
    unauth = await async_client.post(
        f"/api/v1/interviews/{interview_id}/turns",
        json={"transcript": "hi"},
    )
    assert unauth.status_code == 401


@pytest.mark.asyncio
async def test_chat_interface_endpoint(async_client: AsyncClient) -> None:
    """Verify GET /api/v1/interviews/{id}/chat serves responsive HTML."""
    token, interview_id = await setup_interview_session(async_client)
    res = await async_client.get(f"/api/v1/interviews/{interview_id}/chat?token={token}")
    assert res.status_code == 200
    assert "text/html" in res.headers["content-type"]
    assert "IntervueX — Live Technical Interview" in res.text


@pytest.mark.asyncio
async def test_resume_grounded_warmup_and_transition(async_client: AsyncClient) -> None:
    """Verify Turn 0 cites resume claims and Turn 1 incorporates warmup response."""
    email = f"resume_cand_{uuid.uuid4().hex[:8]}@example.com"
    reg_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "SecurePassword123!",
            "full_name": "Jordan Lee",
        },
    )
    assert reg_res.status_code == 201
    token: str = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Ingest candidate resume text with explicit claims
    resume_text = (
        "Jordan Lee - Senior Backend Systems Engineer\n"
        "Experience\n"
        "• Architected low-latency Kafka pipeline processing 50k events/sec\n"
        "• Scaled PostgreSQL database using read replicas and Redis caching\n"
        "• Implemented distributed locking with Redlock algorithm\n"
    )
    res_upload = await async_client.post(
        "/api/v1/resumes/text",
        json={"raw_text": resume_text, "filename": "jordan_resume.txt"},
        headers=headers,
    )
    assert res_upload.status_code == 202
    res_data = res_upload.json()
    assert res_data["detected_seniority"] == "SENIOR"
    assert len(res_data["claims"]) >= 2

    # 2. Schedule interview
    roles_res = await async_client.get("/api/v1/roles", headers=headers)
    roles = roles_res.json()["items"]
    backend_role = next(r for r in roles if r["slug"] == "backend-engineering")

    create_res = await async_client.post(
        "/api/v1/interviews",
        json={
            "role_id": backend_role["id"],
            "target_seniority": "SENIOR",
            "duration_minutes": 30,
            "mode": "TEXT",
        },
        headers=headers,
    )
    assert create_res.status_code == 201
    interview_id = create_res.json()["interview_id"]

    # 3. Start interview -> Turn 0 greeting MUST cite resume and Jordan's name
    start_res = await async_client.post(f"/api/v1/interviews/{interview_id}/start", headers=headers)
    assert start_res.status_code == 200
    turn_0 = start_res.json()
    assert "Jordan Lee" in turn_0["transcript"]
    assert "reviewed your resume" in turn_0["transcript"]
    # Check that a technology or claim from resume is woven into Turn 0
    assert any(tech in turn_0["transcript"] for tech in ["Kafka", "PostgreSQL", "Senior"])

    # 4. Candidate answers warmup about their role & experience
    warmup_answer = (
        "At my recent company, I led the core payments gateway engineering team. "
        "We built a high-throughput event streaming pipeline using Kafka and PostgreSQL, "
        "handling distributed ledger transactions under intense traffic spikes."
    )
    turn_1_res = await async_client.post(
        f"/api/v1/interviews/{interview_id}/turns",
        json={"transcript": warmup_answer},
        headers=headers,
    )
    assert turn_1_res.status_code == 200
    turn_1 = turn_1_res.json()
    assert turn_1["session_state"] == "TECHNICAL_CORE"
    # Turn 1 must acknowledge Jordan and their stated role experience or pipeline!
    assert "Jordan Lee" in turn_1["transcript"] or "Thank you" in turn_1["transcript"]
    assert any(
        term in turn_1["transcript"].lower()
        for term in ["pipeline", "kafka", "distributed", "stream", "background"]
    )
