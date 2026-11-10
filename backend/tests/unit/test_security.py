"""Unit tests for cryptographic security, password hashing, and JWT tokens."""

import uuid
from datetime import timedelta

import pytest
from fastapi import HTTPException

from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)


def test_password_hashing_and_verification() -> None:
    """Verify bcrypt salt hashing and constant-time password verification."""
    password = "SuperSecretPassword123!"
    hashed = hash_password(password)

    assert hashed != password
    assert hashed.startswith("$2b$")
    assert verify_password(password, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False


def test_jwt_lifecycle_and_claims() -> None:
    """Verify JWT access token generation and claims decoding."""
    user_id = uuid.uuid4()
    claims = {"email": "alex@example.com", "role": "CANDIDATE"}
    token = create_access_token(subject=user_id, claims=claims)

    decoded = decode_access_token(token)
    assert decoded["sub"] == str(user_id)
    assert decoded["email"] == "alex@example.com"
    assert decoded["role"] == "CANDIDATE"
    assert "exp" in decoded


def test_jwt_expiration() -> None:
    """Verify expired JWT tokens raise HTTP 401 Unauthorized."""
    user_id = uuid.uuid4()
    token = create_access_token(
        subject=user_id,
        expires_delta=timedelta(seconds=-10),  # expired in past
    )

    with pytest.raises(HTTPException) as exc_info:
        decode_access_token(token)
    assert exc_info.value.status_code == 401
    assert "expired" in exc_info.value.detail.lower()


def test_invalid_jwt_token() -> None:
    """Verify malformed JWT tokens raise HTTP 401 Unauthorized."""
    with pytest.raises(HTTPException) as exc_info:
        decode_access_token("not.a.valid.jwt.token")
    assert exc_info.value.status_code == 401
    assert "invalid" in exc_info.value.detail.lower()
