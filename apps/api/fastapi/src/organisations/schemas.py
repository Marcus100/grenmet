import uuid
from typing import Annotated

from pydantic import EmailStr, Field, StringConstraints

from src.models import BaseModel, UtcDateTime
from src.organisations.models import (
    MembershipRole,
    MembershipStatus,
    OrganisationKind,
    OrganisationStatus,
    TurnstileMode,
)


class OrganisationSummary(BaseModel):
    id: str
    slug: str
    name: str
    kind: OrganisationKind
    status: OrganisationStatus
    verified_at: UtcDateTime | None = None


class MyMembershipPublic(BaseModel):
    membership_id: str
    role: MembershipRole
    status: MembershipStatus
    joined_at: UtcDateTime
    organisation: OrganisationSummary


class CurrentOrganisationPublic(BaseModel):
    """The organisation resolved from ``X-Barrels-Organisation`` and the caller's role."""

    organisation: OrganisationSummary
    role: MembershipRole


class MemberPublic(BaseModel):
    membership_id: str
    user_id: uuid.UUID
    email: str
    full_name: str
    role: MembershipRole
    joined_at: UtcDateTime


class MemberListPublic(BaseModel):
    data: list[MemberPublic]
    count: int
    page: int
    size: int


class MemberRoleUpdate(BaseModel):
    role: MembershipRole


class InvitationCreate(BaseModel):
    email: EmailStr
    role: MembershipRole = MembershipRole.MEMBER


class InvitationPublic(BaseModel):
    """A pending offer. The token is only ever emailed, never returned."""

    id: str
    email: str
    role: MembershipRole
    expires_at: UtcDateTime
    created_at: UtcDateTime
    invited_by_user_id: uuid.UUID | None = None


class InvitationAccept(BaseModel):
    token: str = Field(min_length=10, max_length=200)


class OrganisationAdminPublic(OrganisationSummary):
    """Control-plane row (superuser only): the summary plus size and dates."""

    active_member_count: int
    created_at: UtcDateTime
    updated_at: UtcDateTime


class OrganisationAppPublic(BaseModel):
    app_key: str
    enabled: bool


class AppOptionPublic(BaseModel):
    """An app in the registry that an entitlement can be set for."""

    key: str
    label: str


class OrganisationAdminDetail(OrganisationAdminPublic):
    apps: list[OrganisationAppPublic]
    available_apps: list[AppOptionPublic]


class OrganisationAdminListPublic(BaseModel):
    data: list[OrganisationAdminPublic]
    count: int
    page: int
    size: int


SLUG_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"

OrganisationName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)
]


class PlatformOrganisationCreate(BaseModel):
    name: OrganisationName
    kind: OrganisationKind
    slug: str | None = Field(default=None, max_length=100, pattern=SLUG_PATTERN)


class PlatformOrganisationUpdate(BaseModel):
    """Only the fields sent change. At least one is required."""

    name: OrganisationName | None = None
    slug: str | None = Field(default=None, max_length=100, pattern=SLUG_PATTERN)
    status: OrganisationStatus | None = None
    kind: OrganisationKind | None = None


class VerificationDecision(BaseModel):
    reason: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=3, max_length=500)
    ]


class AppEntitlementUpdate(BaseModel):
    enabled: bool


SITE_KEY_PATTERN = r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
SiteName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)
]
SiteUrl = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, max_length=255, pattern=r"^https?://[^/\s?#]+$"
    ),
]


class PublicSitePublic(BaseModel):
    """What a public website needs to render its forms. Never holds a secret."""

    key: str
    name: str
    accepts_contact: bool
    accepts_subscriptions: bool
    turnstile_site_key: str | None = None


class PublicSiteAdmin(BaseModel):
    """A public site's settings for organisation admins and the control plane.

    The Turnstile secret is write-only: only whether it is set is returned.
    """

    id: str
    organisation_id: str
    key: str
    name: str
    site_url: str | None = None
    contact_recipient: str | None = None
    accepts_contact: bool
    accepts_subscriptions: bool
    turnstile_mode: TurnstileMode
    turnstile_site_key: str | None = None
    turnstile_secret_set: bool
    created_at: UtcDateTime
    updated_at: UtcDateTime


class PublicSiteCreate(BaseModel):
    organisation_id: str = Field(min_length=1, max_length=100)
    key: str = Field(min_length=1, max_length=40, pattern=SITE_KEY_PATTERN)
    name: SiteName
    site_url: SiteUrl | None = Field(
        default=None, description="Origin only, e.g. https://barrels.gd"
    )
    contact_recipient: EmailStr | None = None
    accepts_contact: bool = False
    accepts_subscriptions: bool = False
    turnstile_mode: TurnstileMode = TurnstileMode.INHERIT
    turnstile_site_key: str | None = Field(default=None, max_length=255)
    turnstile_secret: str | None = Field(default=None, min_length=1, max_length=255)


class PublicSiteUpdate(BaseModel):
    """Only the fields sent change. Send ``null`` to clear a nullable setting,
    including ``turnstile_secret``. The key and owner never change."""

    name: SiteName | None = None
    site_url: SiteUrl | None = None
    contact_recipient: EmailStr | None = None
    accepts_contact: bool | None = None
    accepts_subscriptions: bool | None = None
    turnstile_mode: TurnstileMode | None = None
    turnstile_site_key: str | None = Field(default=None, max_length=255)
    turnstile_secret: str | None = Field(default=None, min_length=1, max_length=255)


class PublicSiteListPublic(BaseModel):
    data: list[PublicSiteAdmin]
    count: int


# ── API keys (PF5, ADR-0029) ─────────────────────────────────────────────────

ApiKeyName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
]


class ApiKeyCreate(BaseModel):
    name: ApiKeyName
    scopes: list[str] = Field(
        min_length=1,
        max_length=20,
        description="Scopes such as `bookings.read`; see the scope catalogue.",
    )
    expires_in_days: int = Field(
        default=90, ge=1, le=365, description="Lifetime in days (at most one year)."
    )


class ApiKeyRotate(BaseModel):
    overlap_hours: int = Field(
        default=24,
        ge=0,
        le=720,
        description="How long the old key keeps working. 0 revokes it immediately.",
    )
    expires_in_days: int = Field(
        default=90, ge=1, le=365, description="Lifetime of the new key in days."
    )


class ApiKeyPublic(BaseModel):
    id: str
    organisation_id: str
    name: str
    key_prefix: str
    scopes: list[str]
    created_by_user_id: uuid.UUID | None = None
    expires_at: UtcDateTime | None = None
    last_used_at: UtcDateTime | None = None
    revoked_at: UtcDateTime | None = None
    rotated_from_id: str | None = None
    created_at: UtcDateTime


class ApiKeyCreated(ApiKeyPublic):
    secret: str = Field(
        description="The full key. Shown once; only its hash is stored."
    )


class ApiKeyListPublic(BaseModel):
    data: list[ApiKeyPublic]
    count: int
    page: int
    size: int


class ApiKeyScopeCatalogue(BaseModel):
    scopes: list[str]


class ApiKeyInfoPublic(BaseModel):
    organisation_id: str
    key_id: str
    name: str
    key_prefix: str
    scopes: list[str]
    expires_at: UtcDateTime | None = None
