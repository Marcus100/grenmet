from pydantic import EmailStr, Field

from src.models import BaseModel


class EmailRequest(BaseModel):
    email: EmailStr


class EmailConfirm(BaseModel):
    token: str = Field(min_length=32, max_length=256)
    new_password: str = Field(min_length=12, max_length=128)


class GoogleStart(BaseModel):
    browser_binding: str = Field(pattern="^[a-f0-9]{64}$")


class GoogleStartPublic(BaseModel):
    authorization_url: str


class GoogleComplete(GoogleStart):
    code: str = Field(min_length=1, max_length=4096)
    state: str = Field(min_length=32, max_length=256)


class GoogleChallengePublic(BaseModel):
    challenge: str
    requires_totp: bool


class GoogleFinish(BaseModel):
    challenge: str = Field(min_length=32, max_length=256)
    totp_code: str | None = Field(default=None, max_length=64)


class SecuritySessionPublic(BaseModel):
    id: str
    app_name: str | None = None
    client_type: str
    last_used_at: str
    expires_at: str


class AccountSecurityPublic(BaseModel):
    recovery_codes_remaining: int = 0
    email_verified: bool
    google_configured: bool
    google_linked: bool
    totp_enabled: bool
    sessions: list[SecuritySessionPublic]


class SecurityProof(BaseModel):
    password: str = Field(min_length=1, max_length=128)
    code: str = Field(min_length=6, max_length=64)


class RecoveryCodesPublic(BaseModel):
    codes: list[str]
