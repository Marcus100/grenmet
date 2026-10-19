"""Change-history registrations for the platform organisation tables (ADR-0022).

Every row groups under the ``platform_organisation`` history subject (HR keeps
``organisation`` for its employer records, which share the same ids), readable by that
organisation's admins and owners (superusers are always allowed by the audit
service). Invitation token hashes are never copied into history.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import registry
from src.auth.models import User

from .models import (
    Invitation,
    Membership,
    MembershipRole,
    MembershipStatus,
    OrganisationApp,
    PlatformOrganisation,
)

_MANAGER_ROLES = (MembershipRole.OWNER.value, MembershipRole.ADMIN.value)


async def _organisation_manager(
    session: AsyncSession, actor: User, entity_id: str
) -> bool:
    found = await session.scalar(
        select(Membership.id).where(
            Membership.organisation_id == entity_id,
            Membership.user_id == actor.id,
            Membership.status == MembershipStatus.ACTIVE.value,
            Membership.role.in_(_MANAGER_ROLES),
        )
    )
    return found is not None


def register() -> None:
    registry.register_entity("platform_organisation", _organisation_manager)
    registry.track(
        PlatformOrganisation,
        record_type="platform_organisation",
        label="Organisation",
    )
    registry.track(
        Membership,
        record_type="organisation_membership",
        entity_type="platform_organisation",
        entity_id_attr="organisation_id",
        label="Membership",
    )
    registry.track(
        Invitation,
        record_type="organisation_invitation",
        entity_type="platform_organisation",
        entity_id_attr="organisation_id",
        exclude=("token_hash",),
        label="Invitation",
    )
    registry.track(
        OrganisationApp,
        record_type="organisation_app",
        entity_type="platform_organisation",
        entity_id_attr="organisation_id",
        label="App access",
    )
