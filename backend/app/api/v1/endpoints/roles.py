"""Job Role, Competency Catalog, and Job Description (JD) Intelligence endpoints."""

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.role import JobRole
from app.schemas.role import (
    CompetencyRead,
    JdAnalysisRequest,
    JdAnalysisResponse,
    JobRoleRead,
    RoleListResponse,
)
from app.services.jd_analyzer import analyze_job_description, get_or_create_custom_role_from_jd

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
    )
