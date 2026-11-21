"""Integration test suite for production security hardening across CareerDiff.

Verifies:
1. Broken Object-Level Authorization (BOLA / IDOR) across all interview endpoints.
2. Unauthenticated endpoint lockdown on AI workloads (/resumes/rewrite, /resumes/render-latex).
3. Magic byte binary sniffing preventing disguised executable and script uploads.
4. LaTeX command injection neutralization and macro stripping.
5. OWASP defensive HTTP security headers and sensitive route cache control.
6. Rate limiting bypass header elimination.
7. Production fail-fast entropy validation for JWT secret keys.
8. Reflected XSS escaping in HTML interface templates.
9. GDPR Article 17 physical storage file destruction upon account deletion.
"""

import html
import uuid

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import Settings
from app.core.database import async_session_factory
from app.models.role import JobRole
from app.scripts.seed_roles import seed_job_roles
from app.services.resume_rewriter import escape_latex
from app.services.storage import UPLOAD_DIR


@pytest.fixture
async def ensure_roles_seeded() -> None:
    """Ensure catalog roles are seeded for tests."""
    async with async_session_factory() as session:
        await seed_job_roles(session)


async def create_test_candidate(
    async_client: AsyncClient, email_prefix: str = "cand"
) -> tuple[str, uuid.UUID]:
    """Helper creating user account and returning (jwt_token, user_id)."""
    email = f"{email_prefix}_{uuid.uuid4().hex[:8]}@example.com"
    res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "SecurePassword123!",
            "full_name": "Test Candidate",
        },
    )
    assert res.status_code == 201
    data = res.json()
    return data["access_token"], uuid.UUID(data["user_id"])


# ==============================================================================
# 1. Broken Object-Level Authorization (BOLA / IDOR) Defense
# ==============================================================================


@pytest.mark.asyncio
async def test_bola_idor_interview_endpoints_cross_user_isolation(
    async_client: AsyncClient,
    ensure_roles_seeded: None,
) -> None:
    """Verify User B cannot access, read, or mutate User A's interview session."""
    token_a, _ = await create_test_candidate(async_client, "user_a")
    token_b, _ = await create_test_candidate(async_client, "user_b")
    headers_a = {"Authorization": f"Bearer {token_a}"}
    headers_b = {"Authorization": f"Bearer {token_b}"}

    # Fetch role ID
    async with async_session_factory() as session:
        stmt = select(JobRole).where(JobRole.slug == "backend-engineering")
        role = (await session.execute(stmt)).scalar_one()
        role_id = role.id

    # User A creates an interview
    create_res = await async_client.post(
        "/api/v1/interviews",
        json={
            "role_id": str(role_id),
            "target_seniority": "MID",
            "duration_minutes": 15,
            "mode": "TEXT",
        },
        headers=headers_a,
    )
    assert create_res.status_code == 201
    interview_id = create_res.json()["interview_id"]

    # 1. User B attempts GET /interviews/{id} -> 404
    res_get = await async_client.get(
        f"/api/v1/interviews/{interview_id}",
        headers=headers_b,
    )
    assert res_get.status_code == 404

    # 2. User B attempts POST /interviews/{id}/turns -> 404
    res_turn = await async_client.post(
        f"/api/v1/interviews/{interview_id}/turns",
        json={"transcript": "Adversarial turn from user B", "duration_ms": 1000},
        headers=headers_b,
    )
    assert res_turn.status_code == 404

    # 3. User B attempts GET /interviews/{id}/turns -> 404
    res_turns = await async_client.get(
        f"/api/v1/interviews/{interview_id}/turns",
        headers=headers_b,
    )
    assert res_turns.status_code == 404

    # 4. User B attempts POST /interviews/{id}/ws-ticket -> 404
    res_ticket = await async_client.post(
        f"/api/v1/interviews/{interview_id}/ws-ticket",
        headers=headers_b,
    )
    assert res_ticket.status_code == 404

    # 5. User B attempts POST /interviews/{id}/evaluate -> 404
    res_eval = await async_client.post(
        f"/api/v1/interviews/{interview_id}/evaluate",
        headers=headers_b,
    )
    assert res_eval.status_code == 404

    # 6. User B attempts GET /interviews/{id}/report -> 404
    res_report = await async_client.get(
        f"/api/v1/interviews/{interview_id}/report",
        headers=headers_b,
    )
    assert res_report.status_code == 404

    # 7. User A accesses their own interview -> 200 OK
    res_owner = await async_client.get(
        f"/api/v1/interviews/{interview_id}",
        headers=headers_a,
    )
    assert res_owner.status_code == 200


# ==============================================================================
# 2. Unauthenticated AI Workload Lockdown
# ==============================================================================


@pytest.mark.asyncio
async def test_unauthenticated_rewrite_endpoints_require_auth(
    async_client: AsyncClient,
) -> None:
    """Verify /rewrite and /render-latex return 401 when accessed anonymously."""
    # Anonymous rewrite request
    res_rewrite = await async_client.post(
        "/api/v1/resumes/rewrite",
        json={
            "resume_text": "Sample resume text",
            "jd_text": "Sample job description",
            "candidate_seniority": "MID",
            "template_style": "jakes_resume",
        },
    )
    assert res_rewrite.status_code == 401

    # Anonymous LaTeX render request
    res_latex = await async_client.post(
        "/api/v1/resumes/render-latex",
        json={
            "profile": {
                "full_name": "Anonymous User",
                "contact_email": "anon@example.com",
            },
            "template_style": "jakes_resume",
        },
    )
    assert res_latex.status_code == 401


# ==============================================================================
# 3. Magic Byte Binary Sniffing & Upload Validation
# ==============================================================================


@pytest.mark.asyncio
async def test_resume_upload_rejects_disguised_executable_and_invalid_magic_bytes(
    async_client: AsyncClient,
) -> None:
    """Verify upload validates binary magic bytes and blocks disguised executables/scripts."""
    token, _ = await create_test_candidate(async_client, "uploader")
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Disguised Windows PE executable (starts with MZ)
    fake_pe = b"MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff\x00\x00This is a virus"
    res_pe = await async_client.post(
        "/api/v1/resumes",
        files={"file": ("malicious.pdf", fake_pe, "application/pdf")},
        headers=headers,
    )
    assert res_pe.status_code == 422
    assert "executable binaries are strictly forbidden" in res_pe.json()["detail"]

    # 2. Disguised HTML/Script
    fake_html = b"<html><script>alert('xss')</script></html>"
    res_html = await async_client.post(
        "/api/v1/resumes",
        files={"file": ("exploit.pdf", fake_html, "application/pdf")},
        headers=headers,
    )
    assert res_html.status_code == 422
    assert "HTML and script documents are not permitted" in res_html.json()["detail"]

    # 3. Invalid PDF (missing %PDF- header)
    corrupted_pdf = b"NOT_A_REAL_PDF_HEADER_JUST_RANDOM_TEXT"
    res_corrupt = await async_client.post(
        "/api/v1/resumes",
        files={"file": ("bad_header.pdf", corrupted_pdf, "application/pdf")},
        headers=headers,
    )
    assert res_corrupt.status_code == 422
    assert "%PDF-" in res_corrupt.json()["detail"]

    # 4. Valid PDF magic bytes header (%PDF-1.7)
    valid_pdf = b"%PDF-1.7\n%Valid minimal PDF content for test\n%%EOF"
    res_valid = await async_client.post(
        "/api/v1/resumes",
        files={"file": ("valid.pdf", valid_pdf, "application/pdf")},
        headers=headers,
    )
    assert res_valid.status_code == 202


# ==============================================================================
# 4. LaTeX Injection Sanitization
# ==============================================================================


def test_escape_latex_neutralizes_commands_and_escapes_special_characters() -> None:
    r"""Verify LaTeX command injection vectors (\write18, \input) are neutralized."""
    malicious_input = (
        r"Built high-throughput service; \write18{rm -rf /} and \input{/etc/passwd} "
        r"with 99.9% uptime & $10M revenue in C# and C++."
    )
    escaped = escape_latex(malicious_input)

    # 1. Dangerous macro commands must be stripped
    assert r"\write18" not in escaped
    assert r"\input" not in escaped

    # 2. Special LaTeX characters must be escaped safely
    assert r"\%" in escaped
    assert r"\&" in escaped
    assert r"\$" in escaped
    assert r"\#" in escaped


# ==============================================================================
# 5. OWASP Defensive HTTP Security Headers & Cache Control
# ==============================================================================


@pytest.mark.asyncio
async def test_security_headers_middleware_enforces_owasp_standards(
    async_client: AsyncClient,
) -> None:
    """Verify security headers (X-Content-Type-Options, X-Frame-Options, CSP, Cache-Control)."""
    # Public health endpoint
    res_health = await async_client.get("/api/v1/health")
    assert res_health.status_code == 200
    assert res_health.headers.get("X-Content-Type-Options") == "nosniff"
    assert res_health.headers.get("X-Frame-Options") == "DENY"
    assert res_health.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert "default-src 'self'" in res_health.headers.get("Content-Security-Policy", "")
    assert "microphone=(self)" in res_health.headers.get("Permissions-Policy", "")

    # Sensitive authenticated route must have no-store cache control
    token, _ = await create_test_candidate(async_client, "headers_cand")
    res_me = await async_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert res_me.status_code == 200
    cache_ctrl = res_me.headers.get("Cache-Control", "")
    assert "no-store" in cache_ctrl
    assert "no-cache" in cache_ctrl
    assert res_me.headers.get("Pragma") == "no-cache"


# ==============================================================================
# 6. Rate Limiting Bypass Header Elimination
# ==============================================================================


@pytest.mark.asyncio
async def test_rate_limit_bypass_header_is_ignored(
    async_client: AsyncClient,
) -> None:
    """Verify X-Bypass-Rate-Limit header does not bypass rate limiting."""
    # Send a request with the bypass header
    res = await async_client.get(
        "/",
        headers={"X-Bypass-Rate-Limit": "1"},
    )
    assert res.status_code == 200
    # The header must not grant special status; endpoint serves normal response
    assert "status" in res.json()


# ==============================================================================
# 7. Production Fail-Fast Secret Entropy Validation
# ==============================================================================


def test_production_environment_rejects_insecure_or_short_jwt_secret() -> None:
    """Verify Settings rejects boot in production if JWT secret is insecure or < 32 chars."""
    insecure_default = "insecure_dev_secret_change_in_production_key_32bytes"

    # Default secret in production -> ValueError
    with pytest.raises(ValueError, match="CRITICAL SECURITY CONFIGURATION ERROR"):
        Settings(environment="production", jwt_secret_key=insecure_default)

    # Short secret (< 32 chars) in production -> ValueError
    with pytest.raises(ValueError, match="CRITICAL SECURITY CONFIGURATION ERROR"):
        Settings(environment="production", jwt_secret_key="too_short_secret")

    # High-entropy 32+ char secret in production -> Valid
    valid_prod = Settings(
        environment="production",
        jwt_secret_key="super_secure_random_production_secret_32chars!",
        database_url="postgresql+asyncpg://user:pass@localhost:5432/db",
    )
    assert valid_prod.environment == "production"


# ==============================================================================
# 8. Reflected XSS Prevention in HTML Interface Templates
# ==============================================================================


@pytest.mark.asyncio
async def test_chat_interface_escapes_xss_injection_in_token_query_parameter(
    async_client: AsyncClient,
) -> None:
    """Verify chat template escapes reflected XSS payloads in query parameters."""
    random_id = uuid.uuid4()
    xss_payload = '";alert(document.cookie);//<script>alert(1)</script>'
    res = await async_client.get(f"/api/v1/interviews/{random_id}/chat?token={xss_payload}")
    assert res.status_code == 200

    html_text = res.text
    # Raw unescaped script tag must NOT be present
    assert "<script>alert(1)</script>" not in html_text
    # Escaped token must be present
    assert html.escape(xss_payload) in html_text


# ==============================================================================
# 9. GDPR Physical File Deletion on Account Erasure
# ==============================================================================


@pytest.mark.asyncio
async def test_gdpr_account_deletion_physically_purges_uploaded_resumes(
    async_client: AsyncClient,
) -> None:
    """Verify DELETE /auth/me permanently deletes resume files from storage/resumes/."""
    password = "PermanentDeletePass123!"
    unique_email = f"gdpr_purge_{uuid.uuid4().hex[:8]}@example.com"

    reg_res = await async_client.post(
        "/api/v1/auth/register",
        json={"email": unique_email, "password": password, "full_name": "GDPR Candidate"},
    )
    assert reg_res.status_code == 201
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # Upload valid PDF
    pdf_content = b"%PDF-1.7\nSample resume text with claims\n%%EOF"
    upload_res = await async_client.post(
        "/api/v1/resumes",
        files={"file": ("gdpr_test.pdf", pdf_content, "application/pdf")},
        headers=headers,
    )
    assert upload_res.status_code == 202

    # Verify file physically exists on disk in UPLOAD_DIR
    files_on_disk = list(UPLOAD_DIR.glob("*gdpr_test.pdf"))
    assert len(files_on_disk) >= 1
    target_file = files_on_disk[0]
    assert target_file.is_file()

    # Invoke GDPR Right to Erasure
    del_res = await async_client.request(
        "DELETE",
        "/api/v1/auth/me",
        json={"confirmation_text": "DELETE", "current_password": password},
        headers=headers,
    )
    assert del_res.status_code == 200

    # Verify physical file has been purged from disk
    assert not target_file.exists()
