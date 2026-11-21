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
    verify_google_id_token,
    verify_password,
)
from app.models.user import CandidateProfile, User
from app.schemas.auth import (
    AccountDeletionRequest,
    AccountDeletionResponse,
    BackupCodesRegenerateResponse,
    GoogleLoginRequest,
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

    if not user or not user.hashed_password or not verify_password(payload.password, user.hashed_password):
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
    "/google",
    response_model=TokenResponse,
    status_code=status.HTTP_200_OK,
    summary="Authenticate or register user via Google OIDC ID token",
)
async def login_with_google(
    payload: GoogleLoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenResponse:
    """Verify Google OIDC ID token, provision or link user, and return JWT access token."""
    id_info = verify_google_id_token(payload.id_token)

    google_sub = id_info.get("sub")
    email = id_info.get("email", "").lower().strip()
    full_name = id_info.get("name") or email.split("@")[0] or "Candidate"
    picture = id_info.get("picture")

    if not google_sub or not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GOOGLE_TOKEN_MISSING_REQUIRED_CLAIMS",
        )

    # 1. Look up existing user by google_id
    stmt = select(User).where(User.google_id == google_sub)
    user = (await db.execute(stmt)).scalar_one_or_none()

    if user:
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="USER_INACTIVE",
            )
        # Update avatar or name if changed
        if picture and not user.avatar_url:
            user.avatar_url = picture
            await db.commit()
    else:
        # 2. Check if a user with this verified email already exists (account linking)
        stmt_email = select(User).where(User.email == email)
        user = (await db.execute(stmt_email)).scalar_one_or_none()

        if user:
            if not user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="USER_INACTIVE",
                )
            # Link Google credentials to existing account
            user.google_id = google_sub
            if picture and not user.avatar_url:
                user.avatar_url = picture
            await db.commit()
        else:
            # 3. Provision brand new user
            _, hashed_records = generate_backup_codes(count=8)
            user = User(
                email=email,
                hashed_password=None,
                full_name=full_name,
                role="CANDIDATE",
                is_active=True,
                auth_provider="GOOGLE",
                google_id=google_sub,
                avatar_url=picture,
                hashed_backup_codes=hashed_records,
            )
            db.add(user)
            await db.flush()

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
        auth_provider=user.auth_provider,
        avatar_url=user.avatar_url,
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
    if not current_user.hashed_password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="ACCOUNT_USES_OAUTH_NO_PASSWORD",
        )

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


@router.delete(
    "/me",
    response_model=AccountDeletionResponse,
    status_code=status.HTTP_200_OK,
    summary="Permanently delete user account and cascade all data (GDPR Right to Erasure)",
)
async def delete_current_user_account(
    payload: AccountDeletionRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AccountDeletionResponse:
    """Permanently delete user record and cascade deletion across all associated data."""
    if payload.confirmation_text.strip().upper() != "DELETE":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="INVALID_CONFIRMATION_TEXT",
        )

    if current_user.hashed_password:
        if not payload.current_password or not verify_password(
            payload.current_password, current_user.hashed_password
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="INVALID_CURRENT_PASSWORD",
            )

    await db.delete(current_user)
    await db.commit()

    return AccountDeletionResponse()
