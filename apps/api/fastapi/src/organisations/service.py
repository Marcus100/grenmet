"""Platform organisations: creation, HR dual-write, reconciliation, membership reads.

Functions flush but never commit; the caller owns the transaction (HR's create
path writes the platform row in the same transaction as the HR row).
"""

import logging
import re
import uuid
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from src.auth import apps as auth_apps
from src.exceptions import AppException
from src.hr.models import Organisation as HrOrganisation
from src.organisations.exceptions import (
    OrganisationNotFoundError,
    OrganisationRoleError,
    OrganisationSuspendedError,
)
from src.organisations.models import (
    Membership,
    MembershipRole,
    MembershipStatus,
    OrganisationApp,
    OrganisationKind,
    OrganisationStatus,
    PlatformOrganisation,
    new_membership_id,
    new_organisation_id,
)

logger = logging.getLogger(__name__)

BARRELS_ORGANISATION_ID = "barrels"
_ROLE_RANK = {
    MembershipRole.MEMBER.value: 1,
    MembershipRole.ADMIN.value: 2,
    MembershipRole.OWNER.value: 3,
}


def slugify(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")[:100] or "org"


async def _unique_slug(session: AsyncSession, wanted: str) -> str:
    slug = slugify(wanted)
    candidate, n = slug, 1
    while await session.scalar(
        select(PlatformOrganisation.id).where(PlatformOrganisation.slug == candidate)
    ):
        n += 1
        candidate = f"{slug[:90]}-{n}"
    return candidate


async def create_organisation(
    session: AsyncSession,
    *,
    name: str,
    kind: OrganisationKind = OrganisationKind.BUSINESS,
    slug: str | None = None,
    organisation_id: str | None = None,
) -> PlatformOrganisation:
    """Create a new organisation with an immutable ``org_<hex>`` id.

    The id is generated unless a caller needs a deterministic one (idempotent
    cross-database backfills)."""
    clean = name.strip()
    if not clean:
        raise AppException("Organisation name is required", 422)
    organisation = PlatformOrganisation(
        id=organisation_id or new_organisation_id(),
        slug=await _unique_slug(session, slug or clean),
        name=clean,
        kind=kind.value,
        status=OrganisationStatus.ACTIVE.value,
    )
    session.add(organisation)
    await session.flush()
    return organisation


def _hr_mirror(organisation_id: str, name: str, slug: str) -> PlatformOrganisation:
    kind = (
        OrganisationKind.BARRELS
        if organisation_id == BARRELS_ORGANISATION_ID
        else OrganisationKind.CLIENT
    )
    return PlatformOrganisation(
        id=organisation_id,
        slug=slug,
        name=name,
        kind=kind.value,
        status=OrganisationStatus.ACTIVE.value,
    )


async def ensure_for_hr_organisation(
    session: AsyncSession, *, organisation_id: str, name: str, code: str | None = None
) -> PlatformOrganisation:
    """Idempotently mirror an HR employer into the platform (Bridge A, same id)."""
    existing = await session.get(PlatformOrganisation, organisation_id)
    if existing is not None:
        return existing
    organisation = _hr_mirror(
        organisation_id,
        name,
        await _unique_slug(session, organisation_id or code or name),
    )
    session.add(organisation)
    await session.flush()
    return organisation


def ensure_for_hr_organisation_sync(
    session: Session, *, organisation_id: str, name: str
) -> PlatformOrganisation:
    """Synchronous twin of ``ensure_for_hr_organisation`` for the prestart seed."""
    existing = session.get(PlatformOrganisation, organisation_id)
    if existing is not None:
        return existing
    slug = slugify(organisation_id)
    candidate, n = slug, 1
    while session.scalar(
        select(PlatformOrganisation.id).where(PlatformOrganisation.slug == candidate)
    ):
        n += 1
        candidate = f"{slug[:90]}-{n}"
    organisation = _hr_mirror(organisation_id, name, candidate)
    session.add(organisation)
    session.flush()
    return organisation


async def rename_for_hr_organisation(
    session: AsyncSession, *, organisation_id: str, name: str
) -> None:
    """Keep the platform name in step with an HR rename (creating the row if absent)."""
    organisation = await ensure_for_hr_organisation(
        session, organisation_id=organisation_id, name=name
    )
    organisation.name = name
    await session.flush()


async def missing_platform_organisations(session: AsyncSession) -> list[str]:
    """HR organisation ids with no matching ``org.organisation`` row."""
    rows = await session.execute(
        select(HrOrganisation.id)
        .outerjoin(PlatformOrganisation, PlatformOrganisation.id == HrOrganisation.id)
        .where(PlatformOrganisation.id.is_(None))
        .order_by(HrOrganisation.id)
    )
    return list(rows.scalars().all())


async def reconcile_hr_organisations(session: AsyncSession) -> list[str]:
    """Create any missing platform rows; returns the ids repaired (empty when in sync)."""
    repaired: list[str] = []
    for organisation_id in await missing_platform_organisations(session):
        hr_row = await session.get(HrOrganisation, organisation_id)
        if hr_row is None:
            continue
        await ensure_for_hr_organisation(
            session, organisation_id=hr_row.id, name=hr_row.name, code=hr_row.code
        )
        repaired.append(organisation_id)
    if repaired:
        logger.warning(
            "platform organisations reconciled", extra={"repaired": repaired}
        )
    return repaired


async def add_member(
    session: AsyncSession,
    *,
    organisation_id: str,
    user_id: uuid.UUID,
    role: MembershipRole,
    status: MembershipStatus = MembershipStatus.ACTIVE,
    invited_by_user_id: uuid.UUID | None = None,
) -> Membership:
    membership = Membership(
        id=new_membership_id(),
        organisation_id=organisation_id,
        user_id=user_id,
        role=role.value,
        status=status.value,
        invited_by_user_id=invited_by_user_id,
    )
    session.add(membership)
    await session.flush()
    return membership


async def set_app_enabled(
    session: AsyncSession, *, organisation_id: str, app_key: str, enabled: bool
) -> OrganisationApp:
    auth_apps.get_app(app_key)  # raises 404 for an unregistered app key
    row = await session.get(OrganisationApp, (organisation_id, app_key))
    if row is None:
        row = OrganisationApp(
            organisation_id=organisation_id, app_key=app_key, enabled=enabled
        )
        session.add(row)
    else:
        row.enabled = enabled
    await session.flush()
    return row


async def list_my_memberships(
    session: AsyncSession, user_id: uuid.UUID
) -> list[tuple[Membership, PlatformOrganisation]]:
    rows = await session.execute(
        select(Membership, PlatformOrganisation)
        .join(
            PlatformOrganisation, PlatformOrganisation.id == Membership.organisation_id
        )
        .where(
            Membership.user_id == user_id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
        .order_by(PlatformOrganisation.name, PlatformOrganisation.id)
    )
    return [(m, o) for m, o in rows.all()]


@dataclass(frozen=True)
class ResolvedMembership:
    organisation: PlatformOrganisation
    membership: Membership


async def resolve_membership(
    session: AsyncSession, *, user_id: uuid.UUID, organisation_id: str
) -> ResolvedMembership:
    """Active membership in an organisation, or 404 (never reveals existence)."""
    row = (
        await session.execute(
            select(Membership, PlatformOrganisation)
            .join(
                PlatformOrganisation,
                PlatformOrganisation.id == Membership.organisation_id,
            )
            .where(
                Membership.user_id == user_id,
                Membership.organisation_id == organisation_id,
                Membership.status == MembershipStatus.ACTIVE.value,
            )
        )
    ).first()
    if row is None:
        raise OrganisationNotFoundError()
    membership, organisation = row
    if organisation.status != OrganisationStatus.ACTIVE.value:
        raise OrganisationSuspendedError()
    return ResolvedMembership(organisation=organisation, membership=membership)


def role_allows(role: str, minimum: MembershipRole) -> bool:
    return _ROLE_RANK.get(role, 0) >= _ROLE_RANK[minimum.value]


def require_role(role: str, minimum: MembershipRole) -> None:
    if not role_allows(role, minimum):
        raise OrganisationRoleError()


async def list_managed_organisation_ids(
    session: AsyncSession, user_id: uuid.UUID
) -> list[str]:
    """Ids of active organisations where the user is an active admin or owner."""
    rows = await session.scalars(
        select(Membership.organisation_id)
        .join(
            PlatformOrganisation, PlatformOrganisation.id == Membership.organisation_id
        )
        .where(
            Membership.user_id == user_id,
            Membership.status == MembershipStatus.ACTIVE.value,
            Membership.role.in_(
                [MembershipRole.ADMIN.value, MembershipRole.OWNER.value]
            ),
            PlatformOrganisation.status == OrganisationStatus.ACTIVE.value,
        )
    )
    return list(rows.all())
