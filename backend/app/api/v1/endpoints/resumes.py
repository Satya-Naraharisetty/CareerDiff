"""Resume upload, text ingestion, and profile claim intelligence endpoints."""

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.resume import Resume, ResumeClaim
from app.models.role import JobRole
from app.models.user import CandidateProfile, User
from app.schemas.resume import (
    ResumeAnalysisResponse,
    ResumeClaimRead,
    ResumeRead,
    ResumeTextUploadRequest,
)
from app.schemas.resume_rewriter import (
    RenderLatexRequest,
    RenderLatexResponse,
    ResumeRewriteRequest,
    ResumeRewriteResponse,
    TemplateMetadata,
)
from app.services.claim_extractor import analyze_resume_profile, extract_claims_from_text
from app.services.pdf_extractor import extract_text_from_pdf_bytes
from app.services.resume_rewriter import (
    AVAILABLE_TEMPLATES,
    generate_latex_resume,
    rewrite_resume_for_jd,
)
from app.services.storage import upload_resume_document

router = APIRouter()

MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024  # 10 MB
ALLOWED_EXTENSIONS = (".pdf", ".docx", ".txt")


async def _find_recommended_role(
    discipline: str,
    db: AsyncSession,
) -> tuple[uuid.UUID | None, str | None]:
    """Match candidate discipline to the best available JobRole."""
    stmt_roles = select(JobRole).where(JobRole.is_active.is_(True))
    roles = (await db.execute(stmt_roles)).scalars().all()
    if not roles:
        return None, None

    disc_lower = discipline.lower()
    for role in roles:
        if disc_lower in role.name.lower() or disc_lower in role.slug.lower():
            return role.id, role.name

    # Default to first available active role
    return roles[0].id, roles[0].name


@router.post(
    "",
    response_model=ResumeAnalysisResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Upload candidate resume document",
)
async def upload_resume(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ResumeAnalysisResponse:
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
    persisted_claims: list[ResumeClaim] = []
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
        persisted_claims.append(claim_entity)
        new_skills.update(c.technologies)

    # 9. Perform holistic profile analysis
    analysis = analyze_resume_profile(raw_text, extracted_claims)
    profile.target_seniority = analysis.detected_seniority
    profile.primary_discipline = analysis.primary_discipline
    profile.years_experience = analysis.years_experience
    profile.verified_skills = sorted(list(new_skills.union(analysis.verified_skills)))

    rec_role_id, rec_role_name = await _find_recommended_role(analysis.primary_discipline, db)

    await db.commit()
    await db.refresh(resume)

    return ResumeAnalysisResponse(
        resume_id=resume.id,
        status=resume.status,
        filename=resume.original_filename,
        detected_seniority=analysis.detected_seniority,
        primary_discipline=analysis.primary_discipline,
        years_experience=analysis.years_experience,
        summary=analysis.summary,
        verified_skills=profile.verified_skills,
        claims=[ResumeClaimRead.model_validate(c) for c in persisted_claims],
        recommended_role_id=rec_role_id,
        recommended_role_name=rec_role_name,
    )


@router.post(
    "/text",
    response_model=ResumeAnalysisResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Ingest raw candidate resume text directly",
)
async def upload_resume_text(
    payload: ResumeTextUploadRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ResumeAnalysisResponse:
    """Ingest candidate resume from pasted text, extract claims, and analyze profile."""
    content_bytes = payload.raw_text.encode("utf-8")
    filename = payload.filename or "pasted_resume.txt"

    # 1. Retrieve or create candidate profile for current user
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

    # 2. Store document
    s3_key, file_hash = upload_resume_document(filename, content_bytes)

    # 3. Extract claims with Unicode character provenance
    extracted_claims = extract_claims_from_text(payload.raw_text)

    # 4. Create Resume entity
    resume = Resume(
        candidate_profile_id=profile.id,
        original_filename=filename,
        s3_key=s3_key,
        file_hash=file_hash,
        status="PROCESSED",
        extraction_version=1,
        raw_extracted_text=payload.raw_text,
    )
    db.add(resume)
    await db.flush()

    # 5. Persist claims and collect verified skills
    new_skills: set[str] = set(profile.verified_skills)
    persisted_claims: list[ResumeClaim] = []
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
        persisted_claims.append(claim_entity)
        new_skills.update(c.technologies)

    # 6. Perform holistic profile analysis
    analysis = analyze_resume_profile(payload.raw_text, extracted_claims)
    profile.target_seniority = analysis.detected_seniority
    profile.primary_discipline = analysis.primary_discipline
    profile.years_experience = analysis.years_experience
    profile.verified_skills = sorted(list(new_skills.union(analysis.verified_skills)))

    rec_role_id, rec_role_name = await _find_recommended_role(analysis.primary_discipline, db)

    await db.commit()
    await db.refresh(resume)

    return ResumeAnalysisResponse(
        resume_id=resume.id,
        status=resume.status,
        filename=resume.original_filename,
        detected_seniority=analysis.detected_seniority,
        primary_discipline=analysis.primary_discipline,
        years_experience=analysis.years_experience,
        summary=analysis.summary,
        verified_skills=profile.verified_skills,
        claims=[ResumeClaimRead.model_validate(c) for c in persisted_claims],
        recommended_role_id=rec_role_id,
        recommended_role_name=rec_role_name,
    )


@router.get(
    "/latest",
    response_model=ResumeAnalysisResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve candidate's latest analyzed resume profile",
)
async def get_latest_resume(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ResumeAnalysisResponse:
    """Retrieve the current user's latest processed resume with claims and profile intelligence."""
    stmt_profile = select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    profile = (await db.execute(stmt_profile)).scalar_one_or_none()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No candidate profile found. Please upload a resume first.",
        )

    stmt_resume = (
        select(Resume)
        .options(selectinload(Resume.claims))
        .where(Resume.candidate_profile_id == profile.id)
        .order_by(Resume.created_at.desc())
    )
    resume = (await db.execute(stmt_resume)).scalars().first()
    if not resume:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No resume has been uploaded yet.",
        )

    analysis = analyze_resume_profile(resume.raw_extracted_text or "")
    rec_role_id, rec_role_name = await _find_recommended_role(profile.primary_discipline, db)

    return ResumeAnalysisResponse(
        resume_id=resume.id,
        status=resume.status,
        filename=resume.original_filename,
        detected_seniority=profile.target_seniority,
        primary_discipline=profile.primary_discipline,
        years_experience=profile.years_experience,
        summary=analysis.summary,
        verified_skills=profile.verified_skills,
        claims=[ResumeClaimRead.model_validate(c) for c in resume.claims],
        recommended_role_id=rec_role_id,
        recommended_role_name=rec_role_name,
    )


@router.get(
    "/templates",
    response_model=list[TemplateMetadata],
    status_code=status.HTTP_200_OK,
    summary="List supported Overleaf LaTeX resume templates",
)
async def list_templates() -> list[TemplateMetadata]:
    """Retrieve metadata for all supported Overleaf LaTeX templates."""
    return AVAILABLE_TEMPLATES


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


@router.post(
    "/rewrite",
    response_model=ResumeRewriteResponse,
    status_code=status.HTTP_200_OK,
    summary="Rewrite resume targeting job description with ATS score and LaTeX export",
)
async def rewrite_resume(
    payload: ResumeRewriteRequest,
) -> ResumeRewriteResponse:
    """Analyze resume against target JD, compute ATS score first, generate fact-grounded rewrites, and render Overleaf LaTeX."""
    return rewrite_resume_for_jd(
        resume_text=payload.resume_text,
        jd_text=payload.jd_text,
        candidate_seniority=payload.candidate_seniority,
        template_style=payload.template_style,
    )


@router.post(
    "/render-latex",
    response_model=RenderLatexResponse,
    status_code=status.HTTP_200_OK,
    summary="Re-render LaTeX source for an edited profile with selected template",
)
async def render_latex_endpoint(
    payload: RenderLatexRequest,
) -> RenderLatexResponse:
    """Render ready-to-compile LaTeX source code for a structured resume profile and template style."""
    latex = generate_latex_resume(payload.profile, template_style=payload.template_style)
    return RenderLatexResponse(
        latex_source=latex,
        template_style=payload.template_style,
    )

