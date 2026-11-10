"""Integration tests for user registration, authentication, and JWT lifecycle."""

import uuid

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_user_registration_success(async_client: AsyncClient) -> None:
    """Verify successful user registration returns 201 Created with JWT."""
    unique_email = f"alex_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "email": unique_email,
        "password": "SecurePassword123!",
        "full_name": "Alex Rivera",
    }
    response = await async_client.post("/api/v1/auth/register", json=payload)
    assert response.status_code == 201
    data = response.json()
    assert data["email"] == unique_email
    assert data["full_name"] == "Alex Rivera"
    assert "user_id" in data
    assert "access_token" in data
    assert data["token_type"] == "bearer"


@pytest.mark.asyncio
async def test_user_registration_duplicate_email(async_client: AsyncClient) -> None:
    """Verify registering an existing email returns 409 Conflict."""
    unique_email = f"duplicate_{uuid.uuid4().hex[:8]}@example.com"
    payload = {
        "email": unique_email,
        "password": "SecurePassword123!",
        "full_name": "Duplicate Candidate",
    }
    res1 = await async_client.post("/api/v1/auth/register", json=payload)
    assert res1.status_code == 201

    res2 = await async_client.post("/api/v1/auth/register", json=payload)
    assert res2.status_code == 409
    assert res2.json()["detail"] == "USER_ALREADY_EXISTS"


@pytest.mark.asyncio
async def test_user_login_success(async_client: AsyncClient) -> None:
    """Verify authenticating with valid credentials returns 200 OK and JWT."""
    unique_email = f"login_{uuid.uuid4().hex[:8]}@example.com"
    password = "CorrectPassword123!"
    reg_payload = {
        "email": unique_email,
        "password": password,
        "full_name": "Login Tester",
    }
    await async_client.post("/api/v1/auth/register", json=reg_payload)

    login_payload = {
        "email": unique_email,
        "password": password,
    }
    response = await async_client.post("/api/v1/auth/login", json=login_payload)
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == 900


@pytest.mark.asyncio
async def test_user_login_invalid_password(async_client: AsyncClient) -> None:
    """Verify authentication fails with 401 when using wrong password."""
    unique_email = f"wrongpass_{uuid.uuid4().hex[:8]}@example.com"
    await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": unique_email,
            "password": "ValidPassword123!",
            "full_name": "Wrong Pass Tester",
        },
    )

    response = await async_client.post(
        "/api/v1/auth/login",
        json={"email": unique_email, "password": "IncorrectPassword!"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "INVALID_CREDENTIALS"


@pytest.mark.asyncio
async def test_user_login_nonexistent_email(async_client: AsyncClient) -> None:
    """Verify authentication fails with 401 for unregistered email."""
    response = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "AnyPassword123!"},
    )
    assert response.status_code == 401
    assert response.json()["detail"] == "INVALID_CREDENTIALS"


@pytest.mark.asyncio
async def test_backup_codes_lifecycle_and_password_recovery(
    async_client: AsyncClient,
) -> None:
    """Verify backup codes generation, single-use password recovery, and replay prevention."""
    unique_email = f"recovery_{uuid.uuid4().hex[:8]}@example.com"
    initial_password = "InitialPassword123!"
    new_password = "BrandNewPassword456!"

    # 1. Register candidate and verify 8 backup codes are returned
    reg_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": unique_email,
            "password": initial_password,
            "full_name": "Recovery Candidate",
        },
    )
    assert reg_res.status_code == 201
    reg_data = reg_res.json()
    assert "backup_codes" in reg_data
    assert len(reg_data["backup_codes"]) == 8
    first_code = reg_data["backup_codes"][0]

    # 2. Recover password with first backup code
    rec_payload = {
        "email": unique_email,
        "backup_code": first_code,
        "new_password": new_password,
    }
    rec_res = await async_client.post("/api/v1/auth/recover-password", json=rec_payload)
    assert rec_res.status_code == 200
    rec_data = rec_res.json()
    assert "access_token" in rec_data
    assert rec_data["remaining_backup_codes"] == 7

    # 3. Attempting to reuse the exact same backup code must fail (single-use invariant)
    replay_res = await async_client.post(
        "/api/v1/auth/recover-password",
        json={
            "email": unique_email,
            "backup_code": first_code,
            "new_password": "AnotherPassword789!",
        },
    )
    assert replay_res.status_code == 401
    assert replay_res.json()["detail"] == "INVALID_RECOVERY_CODE"

    # 4. Old password must no longer work
    old_login = await async_client.post(
        "/api/v1/auth/login",
        json={"email": unique_email, "password": initial_password},
    )
    assert old_login.status_code == 401

    # 5. New password must authenticate successfully
    new_login = await async_client.post(
        "/api/v1/auth/login",
        json={"email": unique_email, "password": new_password},
    )
    assert new_login.status_code == 200
    assert "access_token" in new_login.json()


@pytest.mark.asyncio
async def test_change_password_and_get_profile(async_client: AsyncClient) -> None:
    """Verify authenticated user can fetch profile details and update their password."""
    unique_email = f"changepass_{uuid.uuid4().hex[:8]}@example.com"
    old_password = "OldSecurePassword123!"
    new_password = "NewSecurePassword456!"

    # 1. Register candidate
    reg_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": unique_email,
            "password": old_password,
            "full_name": "Change Pass Candidate",
        },
    )
    assert reg_res.status_code == 201
    token = reg_res.json()["access_token"]
    auth_headers = {"Authorization": f"Bearer {token}"}

    # 2. Fetch profile (/me)
    profile_res = await async_client.get("/api/v1/auth/me", headers=auth_headers)
    assert profile_res.status_code == 200
    p_data = profile_res.json()
    assert p_data["email"] == unique_email
    assert p_data["full_name"] == "Change Pass Candidate"
    assert p_data["remaining_backup_codes"] == 8

    # 3. Change password with wrong current password must fail 401
    wrong_req = {
        "current_password": "WrongPassword123!",
        "new_password": new_password,
    }
    wrong_res = await async_client.post(
        "/api/v1/auth/change-password",
        json=wrong_req,
        headers=auth_headers,
    )
    assert wrong_res.status_code == 401
    assert wrong_res.json()["detail"] == "INVALID_CURRENT_PASSWORD"

    # 4. Change password with correct current password succeeds
    valid_req = {
        "current_password": old_password,
        "new_password": new_password,
    }
    change_res = await async_client.post(
        "/api/v1/auth/change-password",
        json=valid_req,
        headers=auth_headers,
    )
    assert change_res.status_code == 200

    # 5. Old password no longer authenticates
    old_auth = await async_client.post(
        "/api/v1/auth/login",
        json={"email": unique_email, "password": old_password},
    )
    assert old_auth.status_code == 401

    # 6. New password authenticates successfully
    new_auth = await async_client.post(
        "/api/v1/auth/login",
        json={"email": unique_email, "password": new_password},
    )
    assert new_auth.status_code == 200
