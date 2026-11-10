"""Job Role and Competency Catalog endpoints."""

from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.models.role import JobRole
from app.schemas.role import JobRoleRead, RoleListResponse

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
