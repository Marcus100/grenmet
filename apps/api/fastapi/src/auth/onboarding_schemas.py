import uuid
from enum import Enum

from pydantic import EmailStr, Field

from src.models import BaseModel, UtcDateTime


class ActivationAccountCreate(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=255)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)


class ActivationIssue(BaseModel):
    identity_confirmed: bool


class ActivationLink(BaseModel):
    activation_url: str
    expires_at: UtcDateTime


class ActivationConfirm(BaseModel):
    token: str = Field(min_length=32, max_length=200)
    new_password: str = Field(min_length=12, max_length=128)


class AccessBlocker(str, Enum):
    INACTIVE = "inactive"
    PASSWORD_SETUP = "password_setup"
    EMAIL_VERIFICATION = "email_verification"
    STAFF_APPROVAL = "staff_approval"
    CMS_GRANT = "cms_grant"


class AppAccessStatus(BaseModel):
    app: str
    label: str
    available: bool
    blockers: list[AccessBlocker]


class OnboardingStatus(BaseModel):
    user_id: uuid.UUID
    email_verified: bool
    password_setup_pending: bool
    activation_pending: bool
    can_issue_activation: bool
    apps: list[AppAccessStatus]
