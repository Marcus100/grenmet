"""Platform organisations: creation, HR dual-write, reconciliation, membership reads.

Functions flush but never commit; the caller owns the transaction (HR's create
path writes the platform row in the same transaction as the HR row).
"""

import logging
import re
import uuid
from dataclasses import dataclass

from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from src.audit import service as audit_service
from src.auth.email_verification import require_verified_or_admin_activated
from src.auth.models import User
from src.exceptions import AppException
from src.hr.models import Organisation as HrOrganisation
from src.organisations import entitlements
from src.organisations.exceptions import (
    OrganisationAppNotEntitledError,
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
from src.utils.datetime import utc_now

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
    skip_email_check: bool = False,
) -> Membership:
    # ADR-0018: owning or administering an organisation needs a verified email.
    # Callers that must stay exempt pass skip_email_check=True with a comment
    # and are listed in src/auth/AGENTS.md.
    if not skip_email_check and role in (MembershipRole.OWNER, MembershipRole.ADMIN):
        user = await session.get(User, user_id)
        if user is None:
            raise AppException("User not found", 404)
        await require_verified_or_admin_activated(
            session, user, f"become an organisation {role.value}"
        )
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
    if not entitlements.is_known(app_key):
        raise AppException("Unknown app", 404)
    row = await session.get(OrganisationApp, (organisation_id, app_key))
    if row is None:
        row = OrganisationApp(
            organisation_id=organisation_id, app_key=app_key, enabled=enabled
        )
        session.add(row)
    else:
        row.enabled = enabled
    await session.flush()
    if enabled:
        for bundled in entitlements.BUNDLED_WITH.get(app_key, ()):
            await _ensure_enabled(session, organisation_id, bundled)
    return row


async def _ensure_enabled(
    session: AsyncSession, organisation_id: str, app_key: str
) -> None:
    """Switch an entitlement on if it is missing or off (never touches others)."""
    row = await session.get(OrganisationApp, (organisation_id, app_key))
    if row is None:
        session.add(
            OrganisationApp(
                organisation_id=organisation_id, app_key=app_key, enabled=True
            )
        )
    elif not row.enabled:
        row.enabled = True
    await session.flush()


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


async def is_app_enabled(
    session: AsyncSession, *, organisation_id: str, app_key: str
) -> bool:
    """Whether the organisation holds an enabled entitlement to ``app_key``."""
    enabled = await session.scalar(
        select(OrganisationApp.enabled).where(
            OrganisationApp.organisation_id == organisation_id,
            OrganisationApp.app_key == app_key,
        )
    )
    return bool(enabled)


async def require_app_enabled(
    session: AsyncSession, *, organisation_id: str, app_key: str
) -> None:
    if not await is_app_enabled(
        session, organisation_id=organisation_id, app_key=app_key
    ):
        raise OrganisationAppNotEntitledError()


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


async def _member_counts(
    session: AsyncSession, organisation_ids: list[str]
) -> dict[str, int]:
    if not organisation_ids:
        return {}
    rows = await session.execute(
        select(Membership.organisation_id, func.count())
        .where(
            Membership.organisation_id.in_(organisation_ids),
            Membership.status == MembershipStatus.ACTIVE.value,
        )
        .group_by(Membership.organisation_id)
    )
    return dict(rows.tuples().all())


async def admin_list_organisations(
    session: AsyncSession,
    *,
    skip: int,
    limit: int,
    query: str | None = None,
    status: OrganisationStatus | None = None,
    kind: OrganisationKind | None = None,
) -> tuple[list[tuple[PlatformOrganisation, int]], int]:
    """Control-plane list: every organisation with its active member count."""
    conditions = []
    if query and query.strip():
        pattern = f"%{query.strip().lower()}%"
        conditions.append(
            or_(
                func.lower(PlatformOrganisation.name).like(pattern),
                func.lower(PlatformOrganisation.slug).like(pattern),
            )
        )
    if status is not None:
        conditions.append(PlatformOrganisation.status == status.value)
    if kind is not None:
        conditions.append(PlatformOrganisation.kind == kind.value)
    total = await session.scalar(
        select(func.count()).select_from(PlatformOrganisation).where(*conditions)
    )
    rows = (
        (
            await session.execute(
                select(PlatformOrganisation)
                .where(*conditions)
                .order_by(PlatformOrganisation.name, PlatformOrganisation.id)
                .offset(skip)
                .limit(limit)
            )
        )
        .scalars()
        .all()
    )
    counts = await _member_counts(session, [row.id for row in rows])
    return [(row, counts.get(row.id, 0)) for row in rows], total or 0


async def admin_get_organisation(
    session: AsyncSession, organisation_id: str
) -> tuple[PlatformOrganisation, int, list[OrganisationApp]]:
    """Control-plane detail: the organisation, member count and app entitlements."""
    organisation = await session.get(PlatformOrganisation, organisation_id)
    if organisation is None:
        raise OrganisationNotFoundError()
    counts = await _member_counts(session, [organisation.id])
    apps = (
        (
            await session.execute(
                select(OrganisationApp)
                .where(OrganisationApp.organisation_id == organisation.id)
                .order_by(OrganisationApp.app_key)
            )
        )
        .scalars()
        .all()
    )
    return organisation, counts.get(organisation.id, 0), list(apps)


# ── Control plane writes (C2, superuser only) ────────────────────────────────

_SLUG_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


async def _load(session: AsyncSession, organisation_id: str) -> PlatformOrganisation:
    organisation = await session.get(
        PlatformOrganisation, organisation_id, with_for_update=True
    )
    if organisation is None:
        raise OrganisationNotFoundError()
    return organisation


def _clean_reason(reason: str) -> str:
    clean = reason.strip()
    if not clean:
        raise AppException("A reason is required", 422)
    return clean


async def _ensure_slug_free(
    session: AsyncSession, slug: str, *, exclude_id: str | None
) -> None:
    if not _SLUG_PATTERN.match(slug):
        raise AppException("Slug must be lowercase letters, digits and hyphens", 422)
    taken = await session.scalar(
        select(PlatformOrganisation.id).where(
            PlatformOrganisation.slug == slug,
            PlatformOrganisation.id != (exclude_id or ""),
        )
    )
    if taken is not None:
        raise AppException("That slug is already in use", 409)


async def admin_create_organisation(
    session: AsyncSession,
    actor: User,
    *,
    name: str,
    kind: OrganisationKind,
    slug: str | None,
) -> PlatformOrganisation:
    audit_service.set_actor(session, actor.id)
    if slug is not None:
        await _ensure_slug_free(session, slug, exclude_id=None)
    return await create_organisation(session, name=name, kind=kind, slug=slug)


async def admin_update_organisation(
    session: AsyncSession,
    actor: User,
    organisation_id: str,
    *,
    name: str | None,
    slug: str | None,
    status: OrganisationStatus | None,
    kind: OrganisationKind | None,
) -> PlatformOrganisation:
    if name is None and slug is None and status is None and kind is None:
        raise AppException("Nothing to change", 422)
    organisation = await _load(session, organisation_id)
    audit_service.set_actor(session, actor.id)
    if name is not None:
        clean = name.strip()
        if not clean:
            raise AppException("Organisation name is required", 422)
        organisation.name = clean
    if slug is not None and slug != organisation.slug:
        await _ensure_slug_free(session, slug, exclude_id=organisation.id)
        organisation.slug = slug
    if status is not None:
        organisation.status = status.value
    if kind is not None:
        organisation.kind = kind.value
    await session.flush()
    return organisation


async def admin_set_verified(
    session: AsyncSession,
    actor: User,
    organisation_id: str,
    *,
    verified: bool,
    reason: str,
) -> PlatformOrganisation:
    clean = _clean_reason(reason)
    organisation = await _load(session, organisation_id)
    audit_service.set_actor(session, actor.id)
    if verified:
        if organisation.verified_at is not None:
            raise AppException("Organisation is already verified", 409)
        organisation.verified_at = utc_now()
    else:
        if organisation.verified_at is None:
            raise AppException("Organisation is not verified", 409)
        organisation.verified_at = None
    await audit_service.record_change(
        session,
        entity_type="platform_organisation",
        entity_id=organisation.id,
        record_type="platform_organisation",
        record_id=organisation.id,
        action="verify" if verified else "unverify",
        changes={"reason": (None, clean)},
        organisation_id=organisation.id,
    )
    await session.flush()
    return organisation


async def admin_set_app(
    session: AsyncSession,
    actor: User,
    organisation_id: str,
    app_key: str,
    *,
    enabled: bool,
) -> OrganisationApp:
    if not entitlements.is_known(app_key):
        raise AppException("Unknown app", 422)
    await _load(session, organisation_id)
    audit_service.set_actor(session, actor.id)
    return await set_app_enabled(
        session, organisation_id=organisation_id, app_key=app_key, enabled=enabled
    )
