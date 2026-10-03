"""Contractor, cleaning staff and building grants.

Staff and grant holders are Barrels Login users; this domain stores their ids by
value and reads names through the auth service, never the auth tables directly.
"""

import logging
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import service as auth_service
from src.auth.models import User
from src.exceptions import NotFoundError
from src.janitorial import access, history
from src.janitorial.models import Building, BuildingGrant, Contractor, Staff

from . import schemas

logger = logging.getLogger(__name__)

NO_ACCOUNT = "No Barrels Login account uses that email. Create the account first."


def _name(user: User | None) -> str | None:
    if user is None:
        return None
    return " ".join(part for part in (user.first_name, user.last_name) if part)


def _contractor(contractor: Contractor) -> schemas.JanitorialContractor:
    return schemas.JanitorialContractor(
        id=contractor.id,
        name=contractor.name,
        active=contractor.active,
        revision=contractor.revision,
    )


def _staff(member: Staff, user: User | None) -> schemas.JanitorialStaffMember:
    return schemas.JanitorialStaffMember(
        id=member.id,
        userId=member.user_id,
        name=_name(user),
        email=user.email if user else None,
        accountActive=bool(user and user.is_active),
        contractorId=member.contractor_id,
        role=member.role,  # type: ignore[arg-type]
        badgeNo=member.badge_no,
        active=member.active,
        revision=member.revision,
    )


async def _account(main: AsyncSession, email: str) -> User:
    user = await auth_service.get_user_by_email(session=main, email=email)
    if user is None:
        raise NotFoundError(NO_ACCOUNT)
    return user


# --- Staff list ------------------------------------------------------------


async def staff_list(
    session: AsyncSession, main: AsyncSession, user: User
) -> schemas.JanitorialStaffList:
    access.require_view(user)
    contractors = await session.scalars(select(Contractor).order_by(Contractor.name))
    members = list(await session.scalars(select(Staff)))
    users = await auth_service.get_users_by_ids(
        session=main, user_ids=[member.user_id for member in members]
    )
    rows = [_staff(member, users.get(member.user_id)) for member in members]
    rows.sort(key=lambda row: (not row.active, (row.name or row.email or "").lower()))
    return schemas.JanitorialStaffList(
        contractors=[_contractor(value) for value in contractors], staff=rows
    )


# --- Contractors -----------------------------------------------------------


async def create_contractor(
    session: AsyncSession, user: User, payload: schemas.ContractorCreate
) -> schemas.JanitorialContractor:
    access.require_staff(user)
    contractor = Contractor(name=payload.name.strip(), created_by=user.id)
    session.add(contractor)
    await history.flush(session, "That record already exists")
    history.record(
        session,
        entity="contractor",
        entity_id=contractor.id,
        revision=1,
        action="created",
        actor_id=user.id,
        changes={"name": [None, contractor.name]},
    )
    await history.commit(session, f"Contractor {payload.name} already exists")
    return _contractor(contractor)


async def update_contractor(
    session: AsyncSession,
    user: User,
    contractor_id: UUID,
    payload: schemas.ContractorUpdate,
) -> schemas.JanitorialContractor:
    access.require_staff(user)
    contractor = await session.get(Contractor, contractor_id, with_for_update=True)
    if contractor is None:
        raise NotFoundError("Contractor not found")
    history.check_revision(contractor, payload.expectedRevision)
    changes = history.apply(
        contractor, {"name": payload.name.strip(), "active": payload.active}
    )
    if changes:
        contractor.revision += 1
        contractor.updated_at = func.now()
        history.record(
            session,
            entity="contractor",
            entity_id=contractor.id,
            revision=contractor.revision,
            action="updated",
            actor_id=user.id,
            changes=changes,
        )
    await history.commit(session, f"Contractor {payload.name} already exists")
    return _contractor(contractor)


# --- Staff -----------------------------------------------------------------


async def _active_contractor(session: AsyncSession, contractor_id: UUID) -> None:
    contractor = await session.get(Contractor, contractor_id)
    if contractor is None or not contractor.active:
        raise NotFoundError("Contractor not found")


async def create_staff(
    session: AsyncSession,
    main: AsyncSession,
    user: User,
    payload: schemas.StaffCreate,
) -> schemas.JanitorialStaffMember:
    access.require_staff(user)
    account = await _account(main, str(payload.email))
    await _active_contractor(session, payload.contractorId)
    member = Staff(
        user_id=account.id,
        contractor_id=payload.contractorId,
        role=payload.role,
        badge_no=payload.badgeNo,
        created_by=user.id,
    )
    session.add(member)
    await history.flush(session, "That person or badge number is already on staff")
    history.record(
        session,
        entity="staff",
        entity_id=member.id,
        revision=1,
        action="created",
        actor_id=user.id,
        changes={"userId": [None, str(account.id)], "role": [None, payload.role]},
    )
    await history.commit(session, "That person or badge number is already on staff")
    logger.info("Janitorial staff added", extra={"staff_id": str(member.id)})
    return _staff(member, account)


async def update_staff(
    session: AsyncSession,
    main: AsyncSession,
    user: User,
    staff_id: UUID,
    payload: schemas.StaffUpdate,
) -> schemas.JanitorialStaffMember:
    access.require_staff(user)
    member = await session.get(Staff, staff_id, with_for_update=True)
    if member is None:
        raise NotFoundError("Staff member not found")
    history.check_revision(member, payload.expectedRevision)
    if payload.contractorId != member.contractor_id:
        await _active_contractor(session, payload.contractorId)
    changes = history.apply(
        member,
        {
            "contractor_id": payload.contractorId,
            "role": payload.role,
            "badge_no": payload.badgeNo,
            "active": payload.active,
        },
    )
    if changes:
        member.revision += 1
        member.updated_at = func.now()
        history.record(
            session,
            entity="staff",
            entity_id=member.id,
            revision=member.revision,
            action="updated",
            actor_id=user.id,
            changes=changes,
        )
    await history.commit(session, "That badge number is already in use")
    account = await auth_service.get_user_by_id(session=main, user_id=member.user_id)
    return _staff(member, account)


# --- Building grants -------------------------------------------------------


def _grant(grant: BuildingGrant, holder: User | None) -> schemas.JanitorialGrant:
    return schemas.JanitorialGrant(
        id=grant.id,
        userId=grant.user_id,
        name=_name(holder),
        email=holder.email if holder else None,
        buildingId=grant.building_id,
        grantedBy=grant.granted_by,
        grantedAt=grant.granted_at,
    )


async def grants(
    session: AsyncSession, main: AsyncSession, user: User
) -> list[schemas.JanitorialGrant]:
    access.require_scope_admin(user)
    rows = list(
        await session.scalars(
            select(BuildingGrant)
            .where(BuildingGrant.revoked_at.is_(None))
            .order_by(BuildingGrant.granted_at)
        )
    )
    users = await auth_service.get_users_by_ids(
        session=main, user_ids=[row.user_id for row in rows]
    )
    return [_grant(row, users.get(row.user_id)) for row in rows]


async def create_grants(
    session: AsyncSession,
    main: AsyncSession,
    user: User,
    payload: schemas.GrantCreate,
) -> list[schemas.JanitorialGrant]:
    """Grant each building not already held; existing grants are left alone."""
    access.require_scope_admin(user)
    holder = await _account(main, str(payload.email))
    wanted = set(payload.buildingIds)
    known = set(
        await session.scalars(select(Building.id).where(Building.id.in_(wanted)))
    )
    if known != wanted:
        raise NotFoundError("Building not found")
    held = set(
        await session.scalars(
            select(BuildingGrant.building_id).where(
                BuildingGrant.user_id == holder.id,
                BuildingGrant.revoked_at.is_(None),
            )
        )
    )
    created = [
        BuildingGrant(user_id=holder.id, building_id=building_id, granted_by=user.id)
        for building_id in sorted(wanted - held)
    ]
    session.add_all(created)
    await history.flush(session, "That record already exists")
    for grant in created:
        history.record(
            session,
            entity="building_grant",
            entity_id=grant.id,
            revision=1,
            action="granted",
            actor_id=user.id,
            changes={
                "userId": [None, str(holder.id)],
                "buildingId": [None, grant.building_id],
            },
        )
    await history.commit(session, "That building is already granted")
    for grant in created:
        await session.refresh(grant)
    return [_grant(grant, holder) for grant in created]


async def revoke_grant(session: AsyncSession, user: User, grant_id: UUID) -> None:
    access.require_scope_admin(user)
    grant = await session.get(BuildingGrant, grant_id, with_for_update=True)
    if grant is None or grant.revoked_at is not None:
        raise NotFoundError("Grant not found")
    grant.revoked_by = user.id
    grant.revoked_at = func.now()
    history.record(
        session,
        entity="building_grant",
        entity_id=grant.id,
        revision=2,
        action="revoked",
        actor_id=user.id,
    )
    await history.commit(session, "Grant could not be revoked")
