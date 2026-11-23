"""Cryptographic security utilities for password hashing and JWT lifecycle."""

import hashlib
import hmac
import secrets
import uuid
from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any, cast

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.config import get_settings
from app.core.database import get_db
from app.models.user import User

settings = get_settings()
security_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    """Generate a secure salted bcrypt hash for a plaintext password."""
    salt = bcrypt.gensalt(rounds=12)
    hashed = bcrypt.hashpw(password.encode("utf-8"), salt)
    return hashed.decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a stored bcrypt hash in constant time."""
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def hash_backup_code(code: str) -> str:
    """Normalize and hash a backup recovery code using HMAC-SHA256."""
    normalized = code.strip().upper().replace("-", "").replace(" ", "")
    return hmac.new(
        settings.jwt_secret_key.encode("utf-8"),
        normalized.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def generate_backup_codes(
    count: int = 8,
) -> tuple[list[str], list[dict[str, str | None]]]:
    """Generate cryptographically secure single-use recovery codes.

    Returns:
        tuple of (plain_codes, hashed_records)
    """
    alphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
    plain_codes: list[str] = []
    hashed_records: list[dict[str, str | None]] = []

    for _ in range(count):
        part1 = "".join(secrets.choice(alphabet) for _ in range(4))
        part2 = "".join(secrets.choice(alphabet) for _ in range(4))
        plain = f"{part1}-{part2}"
        plain_codes.append(plain)
        hashed_records.append(
            {
                "code_hash": hash_backup_code(plain),
                "used_at": None,
            }
        )

    return plain_codes, hashed_records


def verify_and_consume_backup_code(
    candidate_code: str,
    hashed_records: list[dict[str, str | None]],
) -> tuple[bool, list[dict[str, str | None]]]:
    """Verify a candidate backup code and mark it consumed if valid and unused."""
    cand_hash = hash_backup_code(candidate_code)
    updated_records: list[dict[str, str | None]] = []
    matched = False

    for record in hashed_records:
        rec_copy = dict(record)
        is_unused = rec_copy.get("used_at") is None
        code_hash = rec_copy.get("code_hash") or ""
        if is_unused and hmac.compare_digest(code_hash, cand_hash) and not matched:
            matched = True
            rec_copy["used_at"] = datetime.now(timezone.utc).isoformat()
        updated_records.append(rec_copy)

    return matched, updated_records


def count_remaining_backup_codes(
    hashed_records: list[dict[str, str | None]],
) -> int:
    """Return count of unused backup recovery codes."""
    return sum(1 for r in hashed_records if r.get("used_at") is None)


def create_access_token(
    subject: str | uuid.UUID,
    claims: dict[str, Any] | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    """Encode a cryptographically signed JWT access token."""
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.jwt_access_token_expire_minutes)
    )
    payload: dict[str, Any] = {
        "sub": str(subject),
        "exp": int(expire.timestamp()),
        "iat": int(datetime.now(timezone.utc).timestamp()),
    }
    if claims:
        payload.update(claims)
    return jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode and cryptographically verify a JWT access token."""
    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            settings.jwt_secret_key,
            algorithms=[settings.jwt_algorithm],
        )
        return payload
    except jwt.ExpiredSignatureError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Access token has expired",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e
    except jwt.InvalidTokenError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """FastAPI dependency resolving the authenticated User from the Bearer token."""
    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Local development bypass token handler
    if credentials.credentials == "dev-local-bypass-token":
        if settings.environment != "production":
            stmt_dev = select(User).where(User.email == "venkatnaraharisetty.01@gmail.com")
            dev_user = (await db.execute(stmt_dev)).scalar_one_or_none()
            if not dev_user:
                stmt_dev = select(User).order_by(User.created_at.desc())
                dev_user = (await db.execute(stmt_dev)).scalars().first()
            if dev_user:
                return dev_user

    payload = decode_access_token(credentials.credentials)
    user_id_str = payload.get("sub")
    if not user_id_str:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject identifier",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        user_uuid = uuid.UUID(user_id_str)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Malformed subject identifier",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    stmt = select(User).where(User.id == user_uuid)
    result = await db.execute(stmt)
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is inactive",
        )

    return user


def verify_google_id_token(token: str, client_id: str | None = None) -> dict[str, Any]:
    """Verify Google OIDC ID token and return verified claims.

    Verifies signature using Google's public JWKS, expiration, and audience.
    """
    try:
        request = google_requests.Request()
        target_audience = client_id or settings.google_client_id
        id_info: dict[str, Any] = cast(
            dict[str, Any],
            google_id_token.verify_oauth2_token(  # type: ignore[no-untyped-call]
                token,
                request,
                audience=target_audience,
            ),
        )
        issuer = id_info.get("iss")
        if issuer not in ("accounts.google.com", "https://accounts.google.com"):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="INVALID_TOKEN_ISSUER",
                headers={"WWW-Authenticate": "Bearer"},
            )
        if not id_info.get("email_verified", False):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="GOOGLE_EMAIL_NOT_VERIFIED",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return id_info
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"INVALID_GOOGLE_TOKEN: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"GOOGLE_AUTH_ERROR: {str(e)}",
            headers={"WWW-Authenticate": "Bearer"},
        ) from e


def get_client_ip(request: Request) -> str:
    """Extract the real client IP.

    Only the entries appended by our own trusted proxies (the right-hand side of
    X-Forwarded-For) are trusted. The left-most entries and headers such as
    CF-Connecting-IP / X-Real-IP are client-controlled and trivially spoofed.
    """
    hops = max(0, settings.trusted_proxy_hops)
    x_forwarded = request.headers.get("X-Forwarded-For")
    if hops and x_forwarded:
        chain = [p.strip() for p in x_forwarded.split(",") if p.strip()]
        if len(chain) >= hops:
            return chain[-hops]
    return request.client.host if request.client else "127.0.0.1"


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Enforce defense-in-depth OWASP HTTP security response headers."""

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Any],
    ) -> Response:
        response: Response = await call_next(request)

        # 1. Prevent MIME-sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # 2. Prevent clickjacking / frame embedding
        response.headers["X-Frame-Options"] = "DENY"

        # 3. HTTP Strict Transport Security (HSTS)
        if settings.environment.lower() == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"

        # 4. Strict Referrer Policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # 5. Content Security Policy (CSP)
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "img-src 'self' data: https:; "
            "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
            "font-src 'self' data: https://fonts.gstatic.com; "
            "connect-src 'self' wss: ws: https:; "
            "object-src 'none'; "
            "frame-ancestors 'none';"
        )

        # 6. Permissions Policy
        response.headers["Permissions-Policy"] = "geolocation=(), camera=(), microphone=(self)"

        # 7. Cache-Control for sensitive API routes
        path = request.url.path
        if (
            path.startswith("/api/v1/auth")
            or path.startswith("/api/v1/interviews")
            or path.startswith("/api/v1/resumes")
        ):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
            response.headers["Pragma"] = "no-cache"

        return response


async def assert_interview_owner(
    interview: Any,
    current_user: User,
    db: AsyncSession,
) -> None:
    """Authoritative BOLA/IDOR defense: verify that interview belongs to current_user.

    Raises 404 Not Found rather than 403 Forbidden to prevent session ID enumeration.
    """
    if current_user.role in ("ADMIN", "RECRUITER"):
        return

    from app.models.user import CandidateProfile

    stmt = select(CandidateProfile.user_id).where(CandidateProfile.id == interview.candidate_profile_id)
    owner_user_id = (await db.execute(stmt)).scalar_one_or_none()

    if owner_user_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Interview '{interview.id}' not found.",
        )

