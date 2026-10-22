"""Organiser verification cases for the admin moderation queue.

The decision itself is ``organisations.service.admin_set_verified`` (one write
path, one audit entry); this module reads the queue and case, mirrors the legacy
organiser flag, writes the Events activity row and queues the notification.
"""

from typing import Literal, cast

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth.models import User
from src.organisations import service as organisations
from src.organisations import verification
from src.organisations.models import (
    Membership,
    MembershipRole,
    MembershipStatus,
    PlatformOrganisation,
    VerificationStatus,
)

from .. import activity, outbox, schemas
from ..exceptions import EventsNotFound
from ..models import Listing, Organiser

_ACTIONS = ("verify", "unverify", "reject", "resubmit")


def _case(
    organisation: PlatformOrganisation, organiser: Organiser
) -> schemas.VerificationCase:
    return schemas.VerificationCase(
        organisation_id=organisation.id,
        organiser_id=organiser.id,
        organiser_slug=organiser.slug,
        name=organiser.name,
        verification_status=cast(
            "schemas.VerificationStatusName", organisation.verification_status
        ),
        requested_at=organiser.created_at,
        decided_at=organisation.verification_decided_at,
    )


async def list_cases(
    db: AsyncSession,
    *,
    status: VerificationStatus,
    page: int,
    size: int,
) -> schemas.VerificationCaseList:
    """Organisers backed by an organisation in ``status``, oldest request first."""
    base = (
        select(PlatformOrganisation, Organiser)
        .join(Organiser, Organiser.organisation_id == PlatformOrganisation.id)
        .where(PlatformOrganisation.verification_status == status.value)
    )
    total = await db.scalar(select(func.count()).select_from(base.subquery())) or 0
    rows = (
        await db.execute(
            base.order_by(Organiser.created_at, Organiser.id)
            .offset((page - 1) * size)
            .limit(size)
        )
    ).all()
    return schemas.VerificationCaseList(
        data=[_case(org, organiser) for org, organiser in rows],
        count=total,
        page=page,
        size=size,
    )


async def _load(
    db: AsyncSession, organisation_id: str
) -> tuple[PlatformOrganisation, Organiser]:
    row = (
        await db.execute(
            select(PlatformOrganisation, Organiser)
            .join(Organiser, Organiser.organisation_id == PlatformOrganisation.id)
            .where(PlatformOrganisation.id == organisation_id)
        )
    ).first()
    if row is None:
        raise EventsNotFound("Verification case not found")
    return row[0], row[1]


async def get_case(
    db: AsyncSession, organisation_id: str
) -> schemas.VerificationCaseDetail:
    organisation, organiser = await _load(db, organisation_id)
    owners = (
        await db.execute(
            select(User, Membership.role)
            .join(Membership, Membership.user_id == User.id)
            .where(
                Membership.organisation_id == organisation.id,
                Membership.status == MembershipStatus.ACTIVE.value,
                Membership.role.in_(
                    [MembershipRole.OWNER.value, MembershipRole.ADMIN.value]
                ),
            )
            .order_by(Membership.role.desc(), User.id)
        )
    ).all()
    counts = (
        await db.execute(
            select(Listing.status, func.count())
            .where(Listing.organiser_id == organiser.id)
            .group_by(Listing.status)
        )
    ).all()
    entries = (
        await db.execute(
            select(AuditEntry, User)
            .outerjoin(User, User.id == AuditEntry.actor_user_id)
            .where(
                AuditEntry.entity_type == "platform_organisation",
                AuditEntry.entity_id == organisation.id,
                AuditEntry.action.in_(_ACTIONS),
            )
            .order_by(AuditEntry.created_at.desc(), AuditEntry.id)
            .limit(50)
        )
    ).all()
    history = []
    for entry, actor in entries:
        reason = next(
            (c.get("new") for c in entry.changes if c.get("field") == "reason"), None
        )
        history.append(
            schemas.VerificationCaseEvent(
                action=entry.action,
                reason=reason if isinstance(reason, str) else None,
                actor_name=(actor.full_name or actor.email) if actor else "System",
                at=entry.created_at,
            )
        )
    return schemas.VerificationCaseDetail(
        **_case(organisation, organiser).model_dump(),
        bio=organiser.bio,
        logo_file_id=organiser.logo_file_id,
        verification_reason=organisation.verification_reason,
        owners=[
            schemas.VerificationCaseOwner(
                name=user.full_name or "Unnamed",
                role=cast("Literal['owner', 'admin']", role),
            )
            for user, role in owners
        ],
        listing_counts={status: int(n) for status, n in counts},
        history=history,
    )


async def decide(
    db: AsyncSession,
    organisation_id: str,
    actor: User,
    *,
    approve: bool,
    reason: str,
) -> schemas.VerificationCaseDetail:
    """Approve or reject. 404 unless the organisation backs an Events organiser."""
    organisation, organiser = await _load(db, organisation_id)
    await organisations.admin_set_verified(
        db,
        actor,
        organisation.id,
        verified=approve,
        rejected=not approve,
        reason=reason,
    )
    if approve:
        organiser.verified = True  # the legacy flag the unlinked fallback reads
        await outbox.enqueue(
            db,
            kind=outbox.ORGANISER_APPROVED,
            entity_type="organiser",
            entity_id=str(organiser.id),
            dedupe_key=f"organiser.approved:{organiser.id}",
            payload={"actor_id": str(actor.id)},
        )
    else:
        decided = organisation.verification_decided_at
        stamp = decided.isoformat() if decided else ""
        await outbox.enqueue(
            db,
            kind=outbox.ORGANISER_REJECTED,
            entity_type="organiser",
            entity_id=str(organiser.id),
            dedupe_key=f"organiser.rejected:{organiser.id}:{stamp}",
            payload={
                "actor_id": str(actor.id),
                "reason": organisation.verification_reason or "",
            },
        )
    activity.record(
        db,
        actor_id=actor.id,
        action="organiser.verified" if approve else "organiser.rejected",
        entity_type="organiser",
        entity_id=str(organiser.id),
        organiser_id=organiser.id,
        summary={"verified": approve},
    )
    await db.commit()
    verification.clear_cache(organisation.id)
    return await get_case(db, organisation.id)


async def resubmit(db: AsyncSession, actor: User, organiser: Organiser) -> None:
    """The organiser's own owner/admin asks for another review after a rejection."""
    if organiser.organisation_id is None:
        raise EventsNotFound("Verification case not found")
    await organisations.resubmit_verification(db, actor, organiser.organisation_id)
    activity.record(
        db,
        actor_id=actor.id,
        action="organiser.resubmitted",
        entity_type="organiser",
        entity_id=str(organiser.id),
        organiser_id=organiser.id,
        summary={"status": "pending"},
    )
    await db.commit()
