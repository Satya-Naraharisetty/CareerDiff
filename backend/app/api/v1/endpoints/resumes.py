"""Resume upload and claim intelligence endpoints."""

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.resume import Resume, ResumeClaim
from app.models.user import CandidateProfile, User
from app.schemas.resume import (
    ResumeClaimRead,
    ResumeRead,
    ResumeUploadResponse,
)
from app.services.claim_extractor import extract_claims_from_text
from app.services.pdf_extractor import extract_text_from_pdf_bytes
from app.services.storage import upload_resume_document

router = APIRouter()

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXTENSIONS = (".pdf", ".docx")


@router.post(
    "",
    response_model=ResumeUploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload candidate resume document",
)
async def upload_resume(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ResumeUploadResponse:
    """Ingest resume, extract Unicode NFC text and structured claims with provenance."""
    filename = file.filename or "resume.pdf"
    lower_filename = filename.lower()

    # 1. Validate file extension
    if not any(lower_filename.endswith(ext) for ext in ALLOWED_EXTENSIONS):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Unsupported file format. Only PDF and DOCX files are permitted.",
        )

    # 2. Read and validate file size
    content = await file.read()
    if len(content) == 0:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Uploaded file is empty.",
        )
    if len(content) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="File size exceeds the 10 MB limit.",
        )

    # 3. Retrieve or create candidate profile for current user
    stmt = select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    profile = (await db.execute(stmt)).scalar_one_or_none()
    if not profile:
        profile = CandidateProfile(
            user_id=current_user.id,
            target_seniority="MID",
            primary_discipline="BACKEND",
            years_experience=0,
            verified_skills=[],
        )
        db.add(profile)
        await db.flush()

    # 4. Store document
    s3_key, file_hash = upload_resume_document(filename, content)

    # 5. Extract text via PyMuPDF
    raw_text = ""
    if lower_filename.endswith(".pdf"):
        try:
            raw_text, _ = extract_text_from_pdf_bytes(content)
        except Exception:
            raw_text = content.decode("utf-8", errors="ignore")
    else:
        # Fallback for plain text or docx bytes
        raw_text = content.decode("utf-8", errors="ignore")

    # 6. Extract claims with Unicode character provenance
    extracted_claims = extract_claims_from_text(raw_text)

    # 7. Create Resume entity
    resume = Resume(
        candidate_profile_id=profile.id,
        original_filename=filename,
        s3_key=s3_key,
        file_hash=file_hash,
        status="PROCESSED",
        extraction_version=1,
        raw_extracted_text=raw_text,
    )
    db.add(resume)
    await db.flush()

    # 8. Persist claims and collect verified skills
    new_skills: set[str] = set(profile.verified_skills)
    for c in extracted_claims:
        claim_entity = ResumeClaim(
            resume_id=resume.id,
            claim_text=c.claim_text,
            category=c.category,
            source_section=c.source_section,
            start_offset=c.start_offset,
            end_offset=c.end_offset,
            technologies=c.technologies,
            confidence_score=c.confidence_score,
        )
        db.add(claim_entity)
        new_skills.update(c.technologies)

    profile.verified_skills = sorted(list(new_skills))
    await db.commit()
    await db.refresh(resume)

    return ResumeUploadResponse(
        resume_id=resume.id,
        status=resume.status,
        filename=resume.original_filename,
    )


@router.get(
    "/{resume_id}",
    response_model=ResumeRead,
    status_code=status.HTTP_200_OK,
    summary="Retrieve resume extraction details and claims",
)
async def get_resume_by_id(
    resume_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ResumeRead:
    """Retrieve structured resume entity with claims and exact source text."""
    stmt = (
        select(Resume)
        .options(selectinload(Resume.claims))
        .join(CandidateProfile)
        .where(
            Resume.id == resume_id,
            CandidateProfile.user_id == current_user.id,
        )
    )
    resume = (await db.execute(stmt)).scalar_one_or_none()
    if not resume:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Resume not found",
        )

    return ResumeRead(
        resume_id=resume.id,
        status=resume.status,
        filename=resume.original_filename,
        raw_extracted_text=resume.raw_extracted_text,
        claims=[ResumeClaimRead.model_validate(c) for c in resume.claims],
    )
