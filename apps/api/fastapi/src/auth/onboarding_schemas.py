import uuid
from enum import Enum
from typing import Annotated

from pydantic import EmailStr, Field, StringConstraints

from src.models import BaseModel, UtcDateTime


class ActivationAccountCreate(BaseModel):
    email: EmailStr
    username: str = Field(min_length=3, max_length=255)
    first_name: str = Field(min_length=1, max_length=100)
    last_name: str = Field(min_length=1, max_length=100)


class ActivationIssue(BaseModel):
    identity_confirmed: bool


class SignInSetupIssue(BaseModel):
    identity_confirmed: bool
    # Required unless the person's email is unverified or their password setup is pending.
    # When the email is verified the service requires at least 10 characters (422).
    reason: Annotated[
        str | None,
        StringConstraints(strip_whitespace=True, min_length=3, max_length=500),
    ] = None


class ActivationLink(BaseModel):
    activation_url: str
    expires_at: UtcDateTime


class ActivationConfirm(BaseModel):
    token: str = Field(min_length=32, max_length=200)
    new_password: str = Field(min_length=12, max_length=128)


class AccessBlocker(str, Enum):
    INACTIVE = "inactive"
    PASSWORD_SETUP = "password_setup"
    STAFF_APPROVAL = "staff_approval"
    CMS_GRANT = "cms_grant"
    MFA_ENROLMENT = "mfa_enrolment"


class AppAccessStatus(BaseModel):
    app: str
    label: str
    available: bool
    blockers: list[AccessBlocker]
    # Account readiness never proves that a future sign-in has verified a factor.
    requires_mfa_sign_in: bool = False


class OnboardingStatus(BaseModel):
    user_id: uuid.UUID
    email_verified: bool
    password_setup_pending: bool
    activation_pending: bool
    can_issue_activation: bool
    # True when an administrator vouched for the account (unlocks roles and
    # memberships, never the deposit gate); email_verified stays False then.
    admin_activated: bool = False
    apps: list[AppAccessStatus]


AdminReasonText = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=10, max_length=500)
]


class SuperuserActionReason(BaseModel):
    """Why a superuser is using an admin power; stored in the audit trail."""

    reason: AdminReasonText


class AdminActivation(SuperuserActionReason):
    """The operator vouches for the exact address they saw on the account."""

    expected_email: EmailStr


class VerificationResend(BaseModel):
    delivered: bool
    message: str
