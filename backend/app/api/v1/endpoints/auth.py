"""Authentication endpoints for candidate registration, login, and backup code recovery."""

import html

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import HTMLResponse, RedirectResponse
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
from app.models.resume import Resume
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
from app.services.github_oauth import GitHubOAuthService
from app.services.storage import delete_resume_document

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


@router.get(
    "/github/login",
    summary="Initiate GitHub OAuth 2.0 authorization code flow",
)
async def github_login(
    request: Request,
    response: Response,
    redirect_url: str | None = None,
) -> RedirectResponse:
    """Redirect user to GitHub consent page and store CSRF state in secure cookie."""
    base_url = str(request.base_url).rstrip("/")
    proto = request.headers.get("X-Forwarded-Proto")
    if proto == "https" and base_url.startswith("http://"):
        base_url = "https://" + base_url[7:]
    callback_uri = f"{base_url}/api/v1/auth/github/callback"

    auth_url, state = GitHubOAuthService.get_authorization_url(redirect_uri=callback_uri)

    is_prod = settings.environment.lower() == "production"
    redirect_res = RedirectResponse(url=auth_url, status_code=status.HTTP_302_FOUND)
    redirect_res.set_cookie(
        key="cd_github_oauth_state",
        value=state,
        httponly=True,
        secure=is_prod,
        samesite="lax",
        max_age=300,
    )
    if redirect_url:
        redirect_res.set_cookie(
            key="cd_github_redirect_target",
            value=redirect_url,
            httponly=True,
            secure=is_prod,
            samesite="lax",
            max_age=300,
        )
    return redirect_res


@router.get(
    "/github/callback",
    summary="GitHub OAuth 2.0 authorization callback",
)
async def github_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> HTMLResponse:
    """Handle GitHub OAuth callback, exchange code, provision or link user, and return JWT."""
    if error:
        detail = error_description or error or "Access was denied by candidate."
        return HTMLResponse(
            content=f"""<!DOCTYPE html>
<html>
<head><title>CareerDiff Auth Error</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #09090b; color: #f43f5e; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
  <div style="background: #18181b; border: 1px solid #27272a; padding: 24px; border-radius: 12px; max-width: 400px; text-align: center;">
    <h3 style="margin-top: 0;">GitHub Authentication Cancelled</h3>
    <p style="color: #a1a1aa; font-size: 14px;">{html.escape(detail)}</p>
    <button onclick="window.close()" style="background: #27272a; color: white; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer;">Close</button>
  </div>
</body>
</html>""",
            status_code=status.HTTP_400_BAD_REQUEST,
        )

    saved_state = request.cookies.get("cd_github_oauth_state")
    if not state or not saved_state or state != saved_state:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="INVALID_OAUTH_STATE",
        )

    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="MISSING_AUTHORIZATION_CODE",
        )

    base_url = str(request.base_url).rstrip("/")
    proto = request.headers.get("X-Forwarded-Proto")
    if proto == "https" and base_url.startswith("http://"):
        base_url = "https://" + base_url[7:]
    callback_uri = f"{base_url}/api/v1/auth/github/callback"

    profile = await GitHubOAuthService.exchange_code_for_profile(
        code=code,
        redirect_uri=callback_uri,
    )

    github_sub = profile["github_id"]
    email = profile["email"]
    full_name = profile["full_name"]
    picture = profile.get("avatar_url")

    # 1. Look up existing user by github_id
    stmt = select(User).where(User.github_id == github_sub)
    user = (await db.execute(stmt)).scalar_one_or_none()

    if user:
        if not user.is_active:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="USER_INACTIVE",
            )
        if picture and not user.avatar_url:
            user.avatar_url = picture
            await db.commit()
    else:
        # 2. Check if user with verified email exists (account linking)
        stmt_email = select(User).where(User.email == email)
        user = (await db.execute(stmt_email)).scalar_one_or_none()

        if user:
            if not user.is_active:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="USER_INACTIVE",
                )
            user.github_id = github_sub
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
                auth_provider="GITHUB",
                github_id=github_sub,
                avatar_url=picture,
                hashed_backup_codes=hashed_records,
            )
            db.add(user)
            await db.flush()

            cand_profile = CandidateProfile(
                user_id=user.id,
                target_seniority="MID",
                primary_discipline="BACKEND",
                years_experience=0,
                verified_skills=[],
            )
            db.add(cand_profile)
            await db.commit()
            await db.refresh(user)

    token = create_access_token(
        subject=user.id,
        claims={"email": user.email, "role": user.role},
    )

    target_redirect = request.cookies.get("cd_github_redirect_target") or "/"
    res = HTMLResponse(
        content=f"""<!DOCTYPE html>
<html>
<head><title>CareerDiff Auth</title></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; background: #09090b; color: #fafafa; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0;">
  <div style="text-align: center;">
    <div style="display: inline-block; width: 24px; height: 24px; border: 3px solid #27272a; border-top-color: #fafafa; border-radius: 50%; animation: spin 0.8s linear infinite;"></div>
    <p style="color: #a1a1aa; font-size: 13px; margin-top: 12px; font-family: monospace;">Authenticating session...</p>
  </div>
  <style>@keyframes spin {{ to {{ transform: rotate(360deg); }} }}</style>
  <script>
    const token = "{token}";
    const target = "{html.escape(target_redirect)}";
    if (window.opener && !window.opener.closed) {{
      window.opener.postMessage({{ type: "CAREERDIFF_OAUTH_SUCCESS", token: token }}, "*");
      window.close();
    }} else {{
      const separator = target.includes("?") ? "&" : "?";
      window.location.href = target + separator + "auth_token=" + encodeURIComponent(token);
    }}
  </script>
</body>
</html>""",
        status_code=status.HTTP_200_OK,
    )
    res.delete_cookie(key="cd_github_oauth_state")
    res.delete_cookie(key="cd_github_redirect_target")
    return res


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

    # 1. Permanently delete all associated physical resume files from disk/S3 (GDPR Right to Erasure)
    stmt_resumes = (
        select(Resume)
        .join(CandidateProfile, Resume.candidate_profile_id == CandidateProfile.id)
        .where(CandidateProfile.user_id == current_user.id)
    )
    user_resumes = (await db.execute(stmt_resumes)).scalars().all()
    for res in user_resumes:
        if res.s3_key:
            delete_resume_document(res.s3_key)

    # 2. Delete user and cascade database records
    await db.delete(current_user)
    await db.commit()

    return AccountDeletionResponse()
