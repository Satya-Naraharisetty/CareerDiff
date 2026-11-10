"""Integration tests for resume upload, extraction, and provenance verification."""

import uuid

import pymupdf
import pytest
from httpx import AsyncClient


def create_sample_resume_pdf() -> bytes:
    """Generate in-memory synthetic candidate resume with technical claims."""
    doc = pymupdf.open()
    page = doc.new_page()
    lines = [
        "Alex Rivera - Senior Backend Engineer",
        "Experience",
        "• Architected low-latency Kafka pipeline processing 50k events/sec",
        "• Scaled PostgreSQL database using read replicas and Redis caching",
        "• Developed resilient microservices using Python and FastAPI",
    ]
    y = 72
    for line in lines:
        page.insert_text((50, y), line, fontsize=11)
        y += 24
    pdf_bytes: bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


async def get_authenticated_user_token(async_client: AsyncClient) -> str:
    """Helper to register and retrieve JWT bearer token."""
    unique_email = f"resume_cand_{uuid.uuid4().hex[:8]}@example.com"
    res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": unique_email,
            "password": "SecurePassword123!",
            "full_name": "Resume Candidate",
        },
    )
    assert res.status_code == 201
    token: str = res.json()["access_token"]
    return token


@pytest.mark.asyncio
async def test_resume_upload_and_provenance(async_client: AsyncClient) -> None:
    """Verify resume upload, text extraction, and exact character offset provenance."""
    token = await get_authenticated_user_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}
    pdf_bytes = create_sample_resume_pdf()

    # Upload resume
    files = {"file": ("Alex_Rivera_Resume.pdf", pdf_bytes, "application/pdf")}
    upload_res = await async_client.post("/api/v1/resumes", files=files, headers=headers)
    assert upload_res.status_code == 202
    upload_data = upload_res.json()
    assert "resume_id" in upload_data
    resume_id = upload_data["resume_id"]
    assert upload_data["status"] == "PROCESSED"
    assert upload_data["filename"] == "Alex_Rivera_Resume.pdf"

    # Fetch parsed resume and claims
    fetch_res = await async_client.get(f"/api/v1/resumes/{resume_id}", headers=headers)
    assert fetch_res.status_code == 200
    resume_data = fetch_res.json()
    assert resume_data["status"] == "PROCESSED"
    assert resume_data["raw_extracted_text"] is not None

    raw_text = resume_data["raw_extracted_text"]
    claims = resume_data["claims"]
    assert len(claims) >= 3

    # Verify character offset slice matching on every claim
    for claim in claims:
        start = claim["start_offset"]
        end = claim["end_offset"]
        assert end >= start
        sliced_text = raw_text[start:end]
        assert sliced_text == claim["claim_text"], (
            f"Offset slice mismatch: '{sliced_text}' != '{claim['claim_text']}'"
        )
        assert len(claim["technologies"]) >= 1


@pytest.mark.asyncio
async def test_resume_upload_unsupported_format(async_client: AsyncClient) -> None:
    """Verify uploading unsupported executable returns 422 Unprocessable Entity."""
    token = await get_authenticated_user_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}
    files = {"file": ("malicious.exe", b"MZexecutablecontent", "application/octet-stream")}

    response = await async_client.post("/api/v1/resumes", files=files, headers=headers)
    assert response.status_code == 422
    assert "Unsupported file format" in response.json()["detail"]


@pytest.mark.asyncio
async def test_resume_upload_empty_file(async_client: AsyncClient) -> None:
    """Verify uploading an empty file returns 422 Unprocessable Entity."""
    token = await get_authenticated_user_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}
    files = {"file": ("empty.pdf", b"", "application/pdf")}

    response = await async_client.post("/api/v1/resumes", files=files, headers=headers)
    assert response.status_code == 422
    assert "empty" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_resume_upload_unauthorized(async_client: AsyncClient) -> None:
    """Verify upload fails with 401 when unauthenticated."""
    files = {"file": ("resume.pdf", b"dummy content", "application/pdf")}
    response = await async_client.post("/api/v1/resumes", files=files)
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_nonexistent_resume(async_client: AsyncClient) -> None:
    """Verify fetching unknown resume returns 404 Not Found."""
    token = await get_authenticated_user_token(async_client)
    headers = {"Authorization": f"Bearer {token}"}
    random_id = uuid.uuid4()

    response = await async_client.get(f"/api/v1/resumes/{random_id}", headers=headers)
    assert response.status_code == 404
    assert response.json()["detail"] == "Resume not found"
