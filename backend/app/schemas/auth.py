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


class UserLoginRequest(BaseModel):
    """Credentials payload for authenticating a user."""

    email: str = Field(pattern=EMAIL_REGEX, description="Valid email address")
    password: str


class TokenResponse(BaseModel):
    """JWT bearer token response."""

    access_token: str
    token_type: str = "bearer"
    expires_in: int = 900
