from src.models import BaseModel, UtcDateTime
from src.organisations.models import (
    MembershipRole,
    MembershipStatus,
    OrganisationKind,
    OrganisationStatus,
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
