"""Authentication endpoints for candidate registration, login, and backup code recovery."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import (
    count_remaining_backup_codes,
    create_access_token,
    generate_backup_codes,
    get_current_user,
    hash_password,
    verify_and_consume_backup_code,
    verify_password,
)
from app.models.user import CandidateProfile, User
from app.schemas.auth import (
    BackupCodesRegenerateResponse,
    PasswordChangeRequest,
    PasswordChangeResponse,
    PasswordRecoveryRequest,
    PasswordRecoveryResponse,
    TokenResponse,
    UserLoginRequest,
    UserProfileResponse,
    UserRegisterRequest,
    UserRegisterResponse,
)

router = APIRouter()
settings = get_settings()


@router.post(
    "/register",
    response_model=UserRegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Register a new user account with emergency backup codes",
)
async def register_user(
    payload: UserRegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> UserRegisterResponse:
    """Create candidate account, provision single-use backup recovery codes, and return JWT."""
    normalized_email = payload.email.lower()

    # Check for duplicate email
    stmt = select(User).where(User.email == normalized_email)
    existing_user = (await db.execute(stmt)).scalar_one_or_none()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="USER_ALREADY_EXISTS",
        )

    # Generate single-use backup recovery codes
    plain_codes, hashed_records = generate_backup_codes(count=8)

    # Hash password and create User record
    hashed = hash_password(payload.password)
    user = User(
        email=normalized_email,
        hashed_password=hashed,
        full_name=payload.full_name,
        role="CANDIDATE",
        is_active=True,
        hashed_backup_codes=hashed_records,
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
        backup_codes=plain_codes,
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


@router.post(
    "/recover-password",
    response_model=PasswordRecoveryResponse,
    status_code=status.HTTP_200_OK,
    summary="Recover account and reset password using a single-use backup code",
)
async def recover_password_with_backup_code(
    payload: PasswordRecoveryRequest,
    db: AsyncSession = Depends(get_db),
) -> PasswordRecoveryResponse:
    """Verify single-use backup code, reset user password, and issue new session token."""
    normalized_email = payload.email.lower()
    stmt = select(User).where(User.email == normalized_email)
    user = (await db.execute(stmt)).scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="INVALID_RECOVERY_CODE",
        )

    matched, updated_records = verify_and_consume_backup_code(
        payload.backup_code, user.hashed_backup_codes
    )
    if not matched:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="INVALID_RECOVERY_CODE",
        )

    # Reset password and persist atomically
    user.hashed_password = hash_password(payload.new_password)
    user.hashed_backup_codes = updated_records
    await db.commit()
    await db.refresh(user)

    token = create_access_token(
        subject=user.id,
        claims={"email": user.email, "role": user.role},
    )
    remaining = count_remaining_backup_codes(updated_records)

    return PasswordRecoveryResponse(
        message="Password successfully reset. You are now signed in.",
        access_token=token,
        token_type="bearer",
        remaining_backup_codes=remaining,
    )


@router.post(
    "/backup-codes/regenerate",
    response_model=BackupCodesRegenerateResponse,
    status_code=status.HTTP_200_OK,
    summary="Regenerate fresh single-use emergency backup recovery codes",
)
async def regenerate_backup_codes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BackupCodesRegenerateResponse:
    """Generate a fresh set of 8 recovery codes and invalidate prior codes."""
    plain_codes, hashed_records = generate_backup_codes(count=8)
    current_user.hashed_backup_codes = hashed_records
    await db.commit()
    await db.refresh(current_user)

    return BackupCodesRegenerateResponse(
        backup_codes=plain_codes,
        count=len(plain_codes),
    )


@router.get(
    "/me",
    response_model=UserProfileResponse,
    status_code=status.HTTP_200_OK,
    summary="Retrieve authenticated user profile and security state",
)
async def get_current_user_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> UserProfileResponse:
    """Retrieve authenticated user details, candidate profile, and remaining recovery codes."""
    stmt = (
        select(User).options(selectinload(User.candidate_profile)).where(User.id == current_user.id)
    )
    user = (await db.execute(stmt)).scalar_one()

    profile = user.candidate_profile
    seniority = profile.target_seniority if profile else "MID"
    discipline = profile.primary_discipline if profile else "BACKEND"
    years_exp = profile.years_experience if profile else 0

    return UserProfileResponse(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=user.role,
        target_seniority=seniority,
        primary_discipline=discipline,
        years_experience=years_exp,
        remaining_backup_codes=count_remaining_backup_codes(user.hashed_backup_codes),
    )


@router.post(
    "/change-password",
    response_model=PasswordChangeResponse,
    status_code=status.HTTP_200_OK,
    summary="Update authenticated user password",
)
async def change_password(
    payload: PasswordChangeRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> PasswordChangeResponse:
    """Verify existing password, hash new password with bcrypt, and update credentials."""
    if not verify_password(payload.current_password, current_user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="INVALID_CURRENT_PASSWORD",
        )

    if payload.current_password == payload.new_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="NEW_PASSWORD_SAME_AS_CURRENT",
        )

    current_user.hashed_password = hash_password(payload.new_password)
    await db.commit()
    await db.refresh(current_user)

    return PasswordChangeResponse(message="Password successfully updated.")
