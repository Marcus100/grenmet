"""Barrels staff pickers (admin zone, ADR-0050): find an organiser's event to act on.

Filtered and paginated in SQL. Only organisers linked to an active platform
organisation with the ``events`` entitlement are listed (the org-zone routes need
both). Drafts are listed only for staff who help with listings or settlement. No emails or other personal data.
"""

import uuid
from datetime import datetime

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.organisations.models import (
    OrganisationApp,
    OrganisationStatus,
    PlatformOrganisation,
)
from src.pagination import PaginatedResponse

from .. import schemas
from ..models import Listing, Organiser


def _operable() -> ColumnElement[bool]:
    """The organiser's organisation is active and holds the events entitlement."""
    return (
        select(PlatformOrganisation.id)
        .where(
            PlatformOrganisation.id == Organiser.organisation_id,
            PlatformOrganisation.status == OrganisationStatus.ACTIVE.value,
            select(OrganisationApp.organisation_id)
            .where(
                OrganisationApp.organisation_id == PlatformOrganisation.id,
                OrganisationApp.app_key == "events",
                OrganisationApp.enabled.is_(True),
            )
            .exists(),
        )
        .exists()
    )


async def list_events(
    db: AsyncSession,
    *,
    starts_from: datetime | None,
    starts_to: datetime | None,
    q: str | None,
    organiser_id: uuid.UUID | None,
    include_drafts: bool,
    page: int,
    size: int,
) -> PaginatedResponse[schemas.StaffEventRow]:
    conditions: list[ColumnElement[bool]] = [_operable()]
    if not include_drafts:
        conditions.append(Listing.status != "draft")
    if starts_from is not None:
        conditions.append(Listing.starts_at >= starts_from)
    if starts_to is not None:
        conditions.append(Listing.starts_at < starts_to)
    if organiser_id is not None:
        conditions.append(Listing.organiser_id == organiser_id)
    if q and q.strip():
        term = q.strip()
        conditions.append(
            Listing.title.icontains(term, autoescape=True)
            | Organiser.name.icontains(term, autoescape=True)
        )
    base = select(Listing.id).join(Organiser, Organiser.id == Listing.organiser_id)
    count = await db.scalar(
        select(func.count()).select_from(base.where(*conditions).subquery())
    )
    rows = (
        await db.execute(
            select(
                Listing.id,
                Listing.title,
                Listing.status,
                Listing.starts_at,
                Organiser.id,
                Organiser.name,
                Organiser.organisation_id,
            )
            .join(Organiser, Organiser.id == Listing.organiser_id)
            .where(*conditions)
            .order_by(Listing.starts_at.desc(), Listing.id)
            .limit(size)
            .offset((page - 1) * size)
        )
    ).all()
    return PaginatedResponse(
        data=[
            schemas.StaffEventRow(
                listing_id=row[0],
                title=row[1],
                status=row[2],
                starts_at=row[3],
                organiser_id=row[4],
                organiser_name=row[5],
                organisation_id=str(row[6]),
            )
            for row in rows
        ],
        count=int(count or 0),
        page=page,
        size=size,
    )


async def list_organisers(
    db: AsyncSession, *, q: str | None, include_drafts: bool, page: int, size: int
) -> PaginatedResponse[schemas.StaffOrganiserRow]:
    conditions: list[ColumnElement[bool]] = [_operable()]
    if not include_drafts:
        # A door-only caller sees no organiser that has nothing published.
        conditions.append(
            select(Listing.id)
            .where(Listing.organiser_id == Organiser.id, Listing.status != "draft")
            .exists()
        )
    if q and q.strip():
        conditions.append(Organiser.name.icontains(q.strip(), autoescape=True))
    count = await db.scalar(
        select(func.count()).select_from(Organiser).where(*conditions)
    )
    rows = (
        await db.execute(
            select(Organiser.id, Organiser.name, Organiser.organisation_id)
            .where(*conditions)
            .order_by(func.lower(Organiser.name), Organiser.id)
            .limit(size)
            .offset((page - 1) * size)
        )
    ).all()
    return PaginatedResponse(
        data=[
            schemas.StaffOrganiserRow(
                organiser_id=row[0], name=row[1], organisation_id=str(row[2])
            )
            for row in rows
        ],
        count=int(count or 0),
        page=page,
        size=size,
    )
