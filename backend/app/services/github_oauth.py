"""GitHub OAuth 2.0 Authorization Code Flow Service."""

import logging
import secrets
import urllib.parse
from typing import Any

import httpx
from fastapi import HTTPException, status

from app.core.config import get_settings

logger = logging.getLogger("CareerDiff.github_oauth")

_GITHUB_AUTH_URL = "https://github.com/login/oauth/authorize"
_GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token"
_GITHUB_USERINFO_URL = "https://api.github.com/user"
_GITHUB_EMAILS_URL = "https://api.github.com/user/emails"
_GITHUB_SCOPES = "read:user user:email"


class GitHubOAuthService:
    """Handles GitHub OAuth 2.0 Authorization Code exchange and user profile resolution."""

    @classmethod
    def get_authorization_url(cls, redirect_uri: str) -> tuple[str, str]:
        """Generate GitHub authorization URL and return (authorization_url, state)."""
        settings = get_settings()
        if not settings.github_client_id:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="GITHUB_OAUTH_NOT_CONFIGURED",
            )

        state = secrets.token_urlsafe(32)
        params = {
            "client_id": settings.github_client_id,
            "redirect_uri": redirect_uri,
            "scope": _GITHUB_SCOPES,
            "state": state,
            "allow_signup": "true",
        }
        url = f"{_GITHUB_AUTH_URL}?{urllib.parse.urlencode(params)}"
        return url, state

    @classmethod
    async def exchange_code_for_profile(
        cls,
        code: str,
        redirect_uri: str,
    ) -> dict[str, Any]:
        """Exchange authorization code for GitHub access token and retrieve verified profile."""
        settings = get_settings()
        if not settings.github_client_id or not settings.github_client_secret:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="GITHUB_OAUTH_NOT_CONFIGURED",
            )

        async with httpx.AsyncClient(timeout=10.0) as client:
            # 1. Exchange code for access token
            token_payload = {
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
                "redirect_uri": redirect_uri,
            }
            token_headers = {
                "Accept": "application/json",
                "User-Agent": "CareerDiff-Auth/1.0",
            }
            try:
                token_resp = await client.post(
                    _GITHUB_TOKEN_URL,
                    json=token_payload,
                    headers=token_headers,
                )
                token_resp.raise_for_status()
                token_data = token_resp.json()
            except Exception as e:
                logger.error("GitHub token exchange request failed: %s", e)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"GITHUB_TOKEN_EXCHANGE_FAILED: {str(e)}",
                ) from e

            if "error" in token_data:
                err_desc = token_data.get("error_description") or token_data.get("error")
                logger.warning("GitHub OAuth returned error: %s", err_desc)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"GITHUB_AUTH_ERROR: {err_desc}",
                )

            access_token = token_data.get("access_token")
            if not access_token:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="GITHUB_ACCESS_TOKEN_MISSING",
                )

            auth_headers = {
                "Accept": "application/json",
                "Authorization": f"Bearer {access_token}",
                "User-Agent": "CareerDiff-Auth/1.0",
            }

            # 2. Fetch basic profile
            try:
                user_resp = await client.get(_GITHUB_USERINFO_URL, headers=auth_headers)
                user_resp.raise_for_status()
                user_data = user_resp.json()
            except Exception as e:
                logger.error("Failed to fetch GitHub user info: %s", e)
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=f"GITHUB_USERINFO_FAILED: {str(e)}",
                ) from e

            github_id = str(user_data.get("id"))
            email = user_data.get("email")
            full_name = user_data.get("name") or user_data.get("login") or "Candidate"
            avatar_url = user_data.get("avatar_url")

            # 3. If primary email is private in profile, fetch from emails endpoint
            if not email:
                try:
                    emails_resp = await client.get(_GITHUB_EMAILS_URL, headers=auth_headers)
                    if emails_resp.status_code == 200:
                        emails_data = emails_resp.json()
                        # Prefer primary and verified email
                        for item in emails_data:
                            if item.get("primary") and item.get("verified"):
                                email = item.get("email")
                                break
                        # Fallback to primary
                        if not email:
                            for item in emails_data:
                                if item.get("primary"):
                                    email = item.get("email")
                                    break
                        # Fallback to any verified
                        if not email:
                            for item in emails_data:
                                if item.get("verified"):
                                    email = item.get("email")
                                    break
                        # Fallback to first
                        if not email and emails_data:
                            email = emails_data[0].get("email")
                except Exception as e:
                    logger.warning("Could not fetch GitHub private emails: %s", e)

            if not email:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="GITHUB_NO_VERIFIED_EMAIL_FOUND",
                )

            return {
                "github_id": github_id,
                "email": email.lower().strip(),
                "full_name": full_name,
                "avatar_url": avatar_url,
            }
