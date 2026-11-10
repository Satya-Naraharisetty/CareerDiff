"""Authentication request and response schemas."""

import uuid

from pydantic import BaseModel, ConfigDict, Field

EMAIL_REGEX = r"^[\w\.\+\-]+@[a-zA-Z0-9\.\-]+\.[a-zA-Z]{2,}$"


class UserRegisterRequest(BaseModel):
    """Payload for registering a new user."""

    email: str = Field(pattern=EMAIL_REGEX, description="Valid email address")
    password: str = Field(min_length=8, description="Minimum 8 characters")
    full_name: str = Field(min_length=1, max_length=100)


class UserRegisterResponse(BaseModel):
    """Response returned upon successful registration."""

    model_config = ConfigDict(from_attributes=True)

    user_id: uuid.UUID
    email: str
    full_name: str
    access_token: str
    token_type: str = "bearer"
    backup_codes: list[str] = Field(
        default_factory=list,
        description="Cryptographic single-use emergency recovery backup codes",
    )


class PasswordRecoveryRequest(BaseModel):
    """Payload to reset password using an emergency single-use backup code."""

    email: str = Field(pattern=EMAIL_REGEX, description="Valid user email address")
    backup_code: str = Field(
        min_length=6,
        max_length=20,
        description="Single-use backup code formatted e.g. A3B4-C5D6",
    )
    new_password: str = Field(min_length=8, description="New password with minimum 8 characters")


class PasswordRecoveryResponse(BaseModel):
    """Confirmation returned after resetting password with a backup code."""

    message: str = "Password successfully reset. You may now sign in with your new password."
    access_token: str
    token_type: str = "bearer"
    remaining_backup_codes: int


class BackupCodesRegenerateResponse(BaseModel):
    """Freshly generated single-use backup recovery codes."""

    backup_codes: list[str]
    count: int
    message: str = (
        "New backup recovery codes generated. Please store them securely. "
        "Any previous backup codes are now permanently invalidated."
    )


class UserLoginRequest(BaseModel):
    """Credentials payload for authenticating a user."""

    email: str = Field(pattern=EMAIL_REGEX, description="Valid email address")
    password: str


class TokenResponse(BaseModel):
    """JWT bearer token response."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int = 900


class PasswordChangeRequest(BaseModel):
    """Payload for authenticated user to update their password."""

    current_password: str = Field(min_length=1, description="Existing plaintext password")
    new_password: str = Field(min_length=8, description="New password with minimum 8 characters")


class PasswordChangeResponse(BaseModel):
    """Confirmation returned after successfully changing password."""

    message: str = "Password successfully updated."


class UserProfileResponse(BaseModel):
    """Profile details for authenticated user."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: str
    role: str
    target_seniority: str
    primary_discipline: str
    years_experience: int
    remaining_backup_codes: int
