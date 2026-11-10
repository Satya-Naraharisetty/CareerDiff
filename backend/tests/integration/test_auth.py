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
