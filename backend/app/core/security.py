"""Cryptographic security utilities for password hashing and JWT lifecycle."""

import hashlib
import hmac
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

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
