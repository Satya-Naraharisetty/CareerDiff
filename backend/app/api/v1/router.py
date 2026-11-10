"""API v1 Route Aggregator."""

from fastapi import APIRouter

from app.api.v1.endpoints import auth, health, interviews, resumes, roles

api_v1_router = APIRouter()
api_v1_router.include_router(health.router, tags=["Health"])
api_v1_router.include_router(auth.router, prefix="/auth", tags=["Authentication"])
api_v1_router.include_router(resumes.router, prefix="/resumes", tags=["Resumes"])
api_v1_router.include_router(roles.router, prefix="/roles", tags=["Roles"])
api_v1_router.include_router(interviews.router, prefix="/interviews", tags=["Interviews"])
