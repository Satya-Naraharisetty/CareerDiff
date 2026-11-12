"""Job Role, Competency Catalog, and Job Description (JD) Intelligence endpoints."""

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.role import JobRole
from app.schemas.role import (
    CompanyAnalysisRequest,
    CompanyAnalysisResponse,
    CompetencyRead,
    JdAnalysisRequest,
    JdAnalysisResponse,
    JobRoleRead,
    ResumeJdMatchRequest,
    ResumeJdMatchResponse,
    RoleListResponse,
)
from app.services.company_analyzer import classify_company_persona
from app.services.jd_analyzer import (
    analyze_job_description,
    get_or_create_custom_role_from_jd,
    match_resume_against_jd,
)

router = APIRouter()


@router.get(
    "",
    response_model=RoleListResponse,
    status_code=status.HTTP_200_OK,
    summary="List available engineering roles and competencies",
)
async def list_job_roles(
    db: AsyncSession = Depends(get_db),
) -> RoleListResponse:
    """Retrieve catalog of active engineering roles with associated competencies."""
    stmt = (
        select(JobRole)
        .options(selectinload(JobRole.competencies))
        .where(JobRole.is_active.is_(True))
        .order_by(JobRole.name)
    )
    result = await db.execute(stmt)
    roles = list(result.scalars().all())

    items = [JobRoleRead.model_validate(role) for role in roles]
    return RoleListResponse(items=items)


@router.post(
    "/analyze-jd",
    response_model=JdAnalysisResponse,
    status_code=status.HTTP_200_OK,
    summary="Analyze Job Description and calibrate custom role competencies",
)
async def analyze_jd(
    payload: JdAnalysisRequest,
    db: AsyncSession = Depends(get_db),
) -> JdAnalysisResponse:
    """Extract role title, seniority, discipline, and competencies from a raw Job Description."""
    analysis = analyze_job_description(payload.jd_text, payload.job_title)
    role_entity = await get_or_create_custom_role_from_jd(db, analysis)

    role_read = JobRoleRead.model_validate(role_entity)
    comp_reads = [CompetencyRead.model_validate(c) for c in role_entity.competencies]

    return JdAnalysisResponse(
        role=role_read,
        extracted_title=analysis.extracted_title,
        detected_seniority=analysis.detected_seniority,
        primary_discipline=analysis.primary_discipline,
        key_requirements=analysis.key_requirements,
        matched_technologies=analysis.matched_technologies,
        tailored_competencies=comp_reads,
        suggested_company_name=analysis.suggested_company_name,
        suggested_persona=analysis.suggested_persona,  # type: ignore[arg-type]
    )


@router.post(
    "/match-resume-jd",
    response_model=ResumeJdMatchResponse,
    status_code=status.HTTP_200_OK,
    summary="Compute comparative alignment and gap analysis between resume and job description",
)
async def match_resume_jd_endpoint(
    payload: ResumeJdMatchRequest,
) -> ResumeJdMatchResponse:
    """Analyze candidate resume directly against target JD, identifying matched skills, gaps, and strategy."""
    result = match_resume_against_jd(
        resume_text=payload.resume_text,
        jd_text=payload.jd_text,
        resume_skills=payload.resume_skills,
        jd_technologies=payload.jd_technologies,
        candidate_seniority=payload.candidate_seniority,
        required_seniority=payload.required_seniority,
    )
    return ResumeJdMatchResponse(
        match_score_pct=result.match_score_pct,
        alignment_summary=result.alignment_summary,
        seniority_fit=result.seniority_fit,
        matched_skills=result.matched_skills,
        missing_skills=result.missing_skills,
        differentiating_skills=result.differentiating_skills,
        adaptive_interview_strategy=result.adaptive_interview_strategy,
    )


@router.post(
    "/analyze-company",
    response_model=CompanyAnalysisResponse,
    status_code=status.HTTP_200_OK,
    summary="Classify company engineering scale, archetype, and recommended persona",
)
async def analyze_company_endpoint(
    payload: CompanyAnalysisRequest,
) -> CompanyAnalysisResponse:
    """Classify any company name or JD context into an interview persona."""
    res = await classify_company_persona(payload.company_name, payload.jd_text)
    return CompanyAnalysisResponse(
        company_name=str(res["company_name"]),
        detected_persona=res["detected_persona"],
        scale_tier=str(res["scale_tier"]),
        rationale=str(res["rationale"]),
        architectural_focus=res["architectural_focus"],
        confidence=float(res.get("confidence", 0.9)),
    )


