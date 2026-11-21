"""Integration tests for user registration, authentication, and JWT lifecycle."""

import uuid
from unittest.mock import patch

import pytest
from httpx import AsyncClient
from sqlalchemy import select

from app.core.config import get_settings
from app.core.database import async_session_factory
from app.models.user import User

settings = get_settings()


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
    assert data["expires_in"] == settings.jwt_access_token_expire_minutes * 60


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

    # 3. Change password with wrong current password must fail 400 (not 401, which the
    #    client treats as an expired session and signs the user out)
    wrong_req = {
        "current_password": "WrongPassword123!",
        "new_password": new_password,
    }
    wrong_res = await async_client.post(
        "/api/v1/auth/change-password",
        json=wrong_req,
        headers=auth_headers,
    )
    assert wrong_res.status_code == 400
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


@pytest.mark.asyncio
async def test_delete_account_lifecycle(async_client: AsyncClient) -> None:
    """Verify authenticated user can permanently erase their account and data cascades."""
    unique_email = f"delete_{uuid.uuid4().hex[:8]}@example.com"
    password = "DeletePassword123!"

    # 1. Register candidate
    reg_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": unique_email,
            "password": password,
            "full_name": "Erasure Candidate",
        },
    )
    assert reg_res.status_code == 201
    token = reg_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # 2. Deletion without auth header fails 401
    no_auth_res = await async_client.request(
        "DELETE",
        "/api/v1/auth/me",
        json={"current_password": password, "confirmation_text": "DELETE"},
    )
    assert no_auth_res.status_code == 401

    # 3. Deletion with invalid confirmation text fails 400
    bad_confirm = await async_client.request(
        "DELETE",
        "/api/v1/auth/me",
        json={"current_password": password, "confirmation_text": "WRONG_TEXT"},
        headers=headers,
    )
    assert bad_confirm.status_code == 400
    assert bad_confirm.json()["detail"] == "INVALID_CONFIRMATION_TEXT"

    # 4. Deletion with wrong password fails 400
    wrong_pw = await async_client.request(
        "DELETE",
        "/api/v1/auth/me",
        json={"current_password": "WrongPassword999!", "confirmation_text": "DELETE"},
        headers=headers,
    )
    assert wrong_pw.status_code == 400
    assert wrong_pw.json()["detail"] == "INVALID_CURRENT_PASSWORD"

    # 5. Valid deletion succeeds with 200 OK
    delete_res = await async_client.request(
        "DELETE",
        "/api/v1/auth/me",
        json={"current_password": password, "confirmation_text": "DELETE"},
        headers=headers,
    )
    assert delete_res.status_code == 200
    assert "erased" in delete_res.json()["message"].lower()

    # 6. User can no longer log in
    login_after = await async_client.post(
        "/api/v1/auth/login",
        json={"email": unique_email, "password": password},
    )
    assert login_after.status_code == 401

    # 7. Old JWT token cannot access protected /me endpoint
    profile_after = await async_client.get("/api/v1/auth/me", headers=headers)
    assert profile_after.status_code == 401

    # 8. The email is completely freed up and can be re-registered
    re_register = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": unique_email,
            "password": "BrandNewPassword123!",
            "full_name": "Reborn Candidate",
        },
    )
    assert re_register.status_code == 201


@pytest.mark.asyncio
async def test_google_oauth_new_user_registration(async_client: AsyncClient) -> None:
    """Verify new user registration via valid Google OIDC token returns JWT and creates profile."""
    unique_sub = f"google-sub-{uuid.uuid4().hex[:12]}"
    unique_email = f"google_cand_{uuid.uuid4().hex[:8]}@gmail.com"
    mock_claims = {
        "sub": unique_sub,
        "email": unique_email,
        "email_verified": True,
        "name": "Alex Google Candidate",
        "picture": "https://lh3.googleusercontent.com/photo.jpg",
        "iss": "https://accounts.google.com",
    }

    with patch("app.api.v1.endpoints.auth.verify_google_id_token", return_value=mock_claims):
        response = await async_client.post(
            "/api/v1/auth/google",
            json={"id_token": "valid.google.id.token"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

        # Verify profile can be fetched with returned JWT
        headers = {"Authorization": f"Bearer {data['access_token']}"}
        profile_res = await async_client.get("/api/v1/auth/me", headers=headers)
        assert profile_res.status_code == 200
        pdata = profile_res.json()
        assert pdata["email"] == unique_email
        assert pdata["full_name"] == "Alex Google Candidate"
        assert pdata["auth_provider"] == "GOOGLE"
        assert pdata["avatar_url"] == "https://lh3.googleusercontent.com/photo.jpg"
        assert pdata["remaining_backup_codes"] == 8


@pytest.mark.asyncio
async def test_google_oauth_existing_user_linking(async_client: AsyncClient) -> None:
    """Verify existing password-registered candidate can sign in and link Google account."""
    unique_email = f"linking_{uuid.uuid4().hex[:8]}@example.com"
    password = "SecurePassword123!"

    # 1. Register with email + password
    reg_res = await async_client.post(
        "/api/v1/auth/register",
        json={
            "email": unique_email,
            "password": password,
            "full_name": "Password User",
        },
    )
    assert reg_res.status_code == 201

    # 2. Sign in via Google with the matching verified email
    google_sub = f"google-sub-{uuid.uuid4().hex[:12]}"
    mock_claims = {
        "sub": google_sub,
        "email": unique_email,
        "email_verified": True,
        "name": "Password User Linked",
        "picture": "https://lh3.googleusercontent.com/avatar.png",
        "iss": "https://accounts.google.com",
    }

    with patch("app.api.v1.endpoints.auth.verify_google_id_token", return_value=mock_claims):
        google_res = await async_client.post(
            "/api/v1/auth/google",
            json={"id_token": "valid.google.token"},
        )
        assert google_res.status_code == 200
        token = google_res.json()["access_token"]

        # Profile reflects updated avatar
        headers = {"Authorization": f"Bearer {token}"}
        profile_res = await async_client.get("/api/v1/auth/me", headers=headers)
        assert profile_res.status_code == 200
        assert profile_res.json()["email"] == unique_email
        assert profile_res.json()["avatar_url"] == "https://lh3.googleusercontent.com/avatar.png"


@pytest.mark.asyncio
async def test_google_oauth_subsequent_login(async_client: AsyncClient) -> None:
    """Verify returning Google user authenticates cleanly by google_id."""
    google_sub = f"google-sub-{uuid.uuid4().hex[:12]}"
    unique_email = f"returning_{uuid.uuid4().hex[:8]}@gmail.com"
    mock_claims = {
        "sub": google_sub,
        "email": unique_email,
        "email_verified": True,
        "name": "Returning Candidate",
        "picture": None,
        "iss": "https://accounts.google.com",
    }

    with patch("app.api.v1.endpoints.auth.verify_google_id_token", return_value=mock_claims):
        # First login (provisions user)
        res1 = await async_client.post("/api/v1/auth/google", json={"id_token": "token1"})
        assert res1.status_code == 200

        # Second login (authenticates existing user by google_id)
        res2 = await async_client.post("/api/v1/auth/google", json={"id_token": "token2"})
        assert res2.status_code == 200
        assert "access_token" in res2.json()


@pytest.mark.asyncio
async def test_oauth_user_cannot_change_password_without_password(async_client: AsyncClient) -> None:
    """Verify an OAuth-only user (no password) gets a 400 when attempting password change."""
    unique_sub = f"google-sub-{uuid.uuid4().hex[:12]}"
    unique_email = f"oauthonly_{uuid.uuid4().hex[:8]}@gmail.com"
    mock_claims = {
        "sub": unique_sub,
        "email": unique_email,
        "email_verified": True,
        "name": "No Password User",
        "picture": None,
        "iss": "https://accounts.google.com",
    }

    with patch("app.api.v1.endpoints.auth.verify_google_id_token", return_value=mock_claims):
        res = await async_client.post("/api/v1/auth/google", json={"id_token": "valid.token"})
        assert res.status_code == 200
        token = res.json()["access_token"]

        headers = {"Authorization": f"Bearer {token}"}
        change_res = await async_client.post(
            "/api/v1/auth/change-password",
            json={"current_password": "any", "new_password": "NewPassword123!"},
            headers=headers,
        )
        assert change_res.status_code == 400
        assert change_res.json()["detail"] == "ACCOUNT_USES_OAUTH_NO_PASSWORD"


@pytest.mark.asyncio
async def test_oauth_user_can_delete_account_without_password(async_client: AsyncClient) -> None:
    """Verify an OAuth-only user can exercise GDPR Right to Erasure without a password."""
    unique_sub = f"google-sub-{uuid.uuid4().hex[:12]}"
    unique_email = f"deleteoauth_{uuid.uuid4().hex[:8]}@gmail.com"
    mock_claims = {
        "sub": unique_sub,
        "email": unique_email,
        "email_verified": True,
        "name": "Erasure OAuth User",
        "picture": None,
        "iss": "https://accounts.google.com",
    }

    with patch("app.api.v1.endpoints.auth.verify_google_id_token", return_value=mock_claims):
        res = await async_client.post("/api/v1/auth/google", json={"id_token": "valid.token"})
        assert res.status_code == 200
        token = res.json()["access_token"]

        headers = {"Authorization": f"Bearer {token}"}
        del_res = await async_client.request(
            "DELETE",
            "/api/v1/auth/me",
            json={"confirmation_text": "DELETE"},
            headers=headers,
        )
        assert del_res.status_code == 200
        assert "erased" in del_res.json()["message"].lower()

        # Token is now invalid
        me_res = await async_client.get("/api/v1/auth/me", headers=headers)
        assert me_res.status_code == 401


@pytest.mark.asyncio
async def test_github_oauth_login_redirect_and_state_cookie(async_client: AsyncClient) -> None:
    """Verify /github/login sets secure CSRF state cookie and redirects to GitHub authorization."""
    with patch.object(settings, "github_client_id", "mock-gh-client-id"), patch(
        "app.services.github_oauth.get_settings", return_value=settings
    ):
        res = await async_client.get("/api/v1/auth/github/login?redirect_url=http://localhost:5173", follow_redirects=False)
        assert res.status_code == 302
        assert "https://github.com/login/oauth/authorize" in res.headers["location"]
        assert "client_id=mock-gh-client-id" in res.headers["location"]
        assert "cd_github_oauth_state" in res.cookies


@pytest.mark.asyncio
async def test_github_oauth_login_rejects_untrusted_redirect(async_client: AsyncClient) -> None:
    """An attacker-controlled redirect_url must be rejected (prevents token exfiltration)."""
    with patch.object(settings, "github_client_id", "mock-gh-client-id"), patch(
        "app.services.github_oauth.get_settings", return_value=settings
    ):
        for bad in ("https://evil.example", "javascript:alert(1)", "//evil.example"):
            res = await async_client.get(
                "/api/v1/auth/github/login", params={"redirect_url": bad}, follow_redirects=False
            )
            assert res.status_code == 400
            assert res.json()["detail"] == "INVALID_REDIRECT_URL"


@pytest.mark.asyncio
async def test_github_oauth_callback_new_user_provisioning(async_client: AsyncClient) -> None:
    """Verify GitHub OAuth callback provisions new user and dispatches token in opener response."""
    unique_gh_id = f"gh-{uuid.uuid4().hex[:10]}"
    unique_email = f"gh_cand_{uuid.uuid4().hex[:8]}@github.com"
    mock_gh_profile = {
        "github_id": unique_gh_id,
        "email": unique_email,
        "full_name": "Octocat Candidate",
        "avatar_url": "https://avatars.githubusercontent.com/u/1?v=4",
    }
    test_state = "valid-csrf-state-token-12345"

    with patch(
        "app.api.v1.endpoints.auth.GitHubOAuthService.exchange_code_for_profile",
        return_value=mock_gh_profile,
    ):
        async_client.cookies.set("cd_github_oauth_state", test_state)
        res = await async_client.get(
            f"/api/v1/auth/github/callback?code=mock_github_code&state={test_state}"
        )
        assert res.status_code == 200
        assert "CAREERDIFF_OAUTH_SUCCESS" in res.text

        # Verify user was created in database
        async with async_session_factory() as db:
            stmt = select(User).where(User.github_id == unique_gh_id)
            user = (await db.execute(stmt)).scalar_one_or_none()
            assert user is not None
            assert user.email == unique_email
            assert user.auth_provider == "GITHUB"
            assert user.full_name == "Octocat Candidate"


@pytest.mark.asyncio
async def test_github_oauth_callback_account_linking(async_client: AsyncClient) -> None:
    """Verify GitHub OAuth links to existing user matching verified email."""
    unique_email = f"link_gh_{uuid.uuid4().hex[:8]}@example.com"
    password = "ExistingPassword123!"

    # 1. Register existing local user
    reg = await async_client.post(
        "/api/v1/auth/register",
        json={"email": unique_email, "password": password, "full_name": "Local Candidate"},
    )
    assert reg.status_code == 201

    # 2. Callback with GitHub account having the same email
    unique_gh_id = f"gh-{uuid.uuid4().hex[:10]}"
    mock_gh_profile = {
        "github_id": unique_gh_id,
        "email": unique_email,
        "full_name": "Local Candidate",
        "avatar_url": "https://avatars.githubusercontent.com/u/2?v=4",
    }
    test_state = "valid-csrf-state-token-linking"

    with patch(
        "app.api.v1.endpoints.auth.GitHubOAuthService.exchange_code_for_profile",
        return_value=mock_gh_profile,
    ):
        async_client.cookies.set("cd_github_oauth_state", test_state)
        res = await async_client.get(
            f"/api/v1/auth/github/callback?code=mock_link_code&state={test_state}"
        )
        assert res.status_code == 200

        # Verify account was linked
        async with async_session_factory() as db:
            stmt = select(User).where(User.email == unique_email)
            user = (await db.execute(stmt)).scalar_one_or_none()
            assert user is not None
            assert user.github_id == unique_gh_id


@pytest.mark.asyncio
async def test_github_oauth_callback_state_mismatch_fails(async_client: AsyncClient) -> None:
    """Verify callback rejects invalid CSRF state tokens."""
    async_client.cookies.set("cd_github_oauth_state", "real-state")
    res = await async_client.get(
        "/api/v1/auth/github/callback?code=mock_code&state=attacker-forged-state"
    )
    assert res.status_code == 400
    assert res.json()["detail"] == "INVALID_OAUTH_STATE"

