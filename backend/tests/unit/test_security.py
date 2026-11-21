"""Unit tests for cryptographic security, password hashing, and JWT tokens."""

import uuid
from datetime import timedelta
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_google_id_token,
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


def test_verify_google_id_token_success() -> None:
    """Verify successful Google ID token verification returns claims."""
    mock_payload = {
        "sub": "google-user-12345",
        "email": "candidate@gmail.com",
        "email_verified": True,
        "name": "Jane Doe",
        "picture": "https://lh3.googleusercontent.com/photo.jpg",
        "iss": "https://accounts.google.com",
    }
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=mock_payload):
        claims = verify_google_id_token("mock-google-id-token", client_id="test-client-id")
        assert claims["sub"] == "google-user-12345"
        assert claims["email"] == "candidate@gmail.com"
        assert claims["email_verified"] is True
        assert claims["name"] == "Jane Doe"


def test_verify_google_id_token_unverified_email() -> None:
    """Verify token with email_verified=False is rejected with 401."""
    mock_payload = {
        "sub": "google-user-12345",
        "email": "unverified@gmail.com",
        "email_verified": False,
        "iss": "https://accounts.google.com",
    }
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=mock_payload):
        with pytest.raises(HTTPException) as exc_info:
            verify_google_id_token("mock-google-id-token")
        assert exc_info.value.status_code == 401
        assert "GOOGLE_EMAIL_NOT_VERIFIED" in exc_info.value.detail


def test_verify_google_id_token_invalid_issuer() -> None:
    """Verify token with forged/unrecognized issuer is rejected with 401."""
    mock_payload = {
        "sub": "google-user-12345",
        "email": "attacker@fake.com",
        "email_verified": True,
        "iss": "https://rogue-issuer.com",
    }
    with patch("google.oauth2.id_token.verify_oauth2_token", return_value=mock_payload):
        with pytest.raises(HTTPException) as exc_info:
            verify_google_id_token("mock-google-id-token")
        assert exc_info.value.status_code == 401
        assert "INVALID_TOKEN_ISSUER" in exc_info.value.detail


def test_verify_google_id_token_invalid_signature() -> None:
    """Verify ValueError from Google verification raises 401 INVALID_GOOGLE_TOKEN."""
    with patch(
        "google.oauth2.id_token.verify_oauth2_token",
        side_effect=ValueError("Token expired or invalid signature"),
    ):
        with pytest.raises(HTTPException) as exc_info:
            verify_google_id_token("corrupt-token")
        assert exc_info.value.status_code == 401
        assert "INVALID_GOOGLE_TOKEN" in exc_info.value.detail


def test_skip_auth_token_bypass() -> None:
    """Verify decode_access_token resolves mock claims when skip_auth is enabled in non-production."""
    from unittest.mock import patch

    from app.core.config import Settings
    from app.core.security import decode_access_token

    dev_settings = Settings(environment="development", skip_auth=True)
    with patch("app.core.security.settings", dev_settings):
        payload = decode_access_token("dev-local-bypass-token")
        assert payload["sub"] == "dev-local-user"
        assert payload["email"] == "dev@careerdiff.local"
        assert payload["role"] == "CANDIDATE"
