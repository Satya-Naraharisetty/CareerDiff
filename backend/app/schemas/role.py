"""Schemas for Job Roles and Competency Catalog."""

import uuid

from pydantic import BaseModel, ConfigDict


class CompetencyRead(BaseModel):
    """Competency information schema."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    description: str | None = None
    display_order: int


class JobRoleRead(BaseModel):
    """Job role details with associated competencies."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    slug: str
    description: str | None = None
    competencies: list[CompetencyRead] = []


class RoleListResponse(BaseModel):
    """Collection wrapper for role catalog listings."""

    items: list[JobRoleRead]
