"""Authentication endpoints for candidate registration and login."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import create_access_token, hash_password, verify_password
from app.models.user import CandidateProfile, User
from app.schemas.auth import (
    TokenResponse,
    UserLoginRequest,
    UserRegisterRequest,
    UserRegisterResponse,
)

router = APIRouter()
settings = get_settings()


@router.post(
    "/register",
    response_model=UserRegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account",
)
async def register_user(
    payload: UserRegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> UserRegisterResponse:
    """Create a new candidate account, initialize candidate profile, and return JWT."""
    normalized_email = payload.email.lower()

    # Check for duplicate email
    stmt = select(User).where(User.email == normalized_email)
    existing_user = (await db.execute(stmt)).scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="USER_ALREADY_EXISTS",
        )

    # Hash password and create User record
    hashed = hash_password(payload.password)
    user = User(
        email=normalized_email,
        hashed_password=hashed,
        full_name=payload.full_name,
        role="CANDIDATE",
        is_active=True,
    )
    db.add(user)
    await db.flush()

    # Create associated default CandidateProfile
    profile = CandidateProfile(
        user_id=user.id,
        target_seniority="MID",
        primary_discipline="BACKEND",
        years_experience=0,
        verified_skills=[],
    )
    db.add(profile)
    await db.commit()
    await db.refresh(user)

    # Issue initial access token
    token = create_access_token(
        subject=user.id,
        claims={"email": user.email, "role": user.role},
    )

    return UserRegisterResponse(
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        access_token=token,
        token_type="bearer",
    )


@router.post(
    "/login",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Authenticate user and issue JWT access token",
)
async def login_user(
    payload: UserLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Verify credentials and return a bearer JWT access token."""
    normalized_email = payload.email.lower()

    stmt = select(User).where(User.email == normalized_email)
    user = (await db.execute(stmt)).scalar_one_or_none()

    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="INVALID_CREDENTIALS",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="USER_INACTIVE",
        )

    token = create_access_token(
        subject=user.id,
        claims={"email": user.email, "role": user.role},
    )

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        expires_in=settings.jwt_access_token_expire_minutes * 60,
    )
