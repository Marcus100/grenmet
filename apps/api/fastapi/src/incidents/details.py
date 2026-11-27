"""Persons involved, witnesses, damage and resources of an incident (#1876).

Service functions flush; routers commit. Every write locks the incident row and is
refused on a closed incident. Persons may be corrected (audited, earlier values
kept in the history); damage and resource lines are insert only, corrected with a
note. Contact details and injury notes are personal data: they are returned only
to holders of ``incidents.incidents.private`` and marked sensitive in the audit.
"""

from collections.abc import Sequence
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.exceptions import AppValidationError

from . import service
from .exceptions import IncidentConflictError, IncidentNotFoundError
from .models import (
    Incident,
    IncidentDamage,
    IncidentParty,
    IncidentResource,
    IncidentStatus,
)
from .schemas import (
    IncidentDamageCreate,
    IncidentPartyCreate,
    IncidentPartyUpdate,
    IncidentResourceCreate,
)


async def _open_for_writes(
    session: AsyncSession, *, organisation_id: str, incident_id: str
) -> Incident:
    incident = await service.get_incident(
        session, organisation_id=organisation_id, incident_id=incident_id, lock=True
    )
    if incident.status == IncidentStatus.CLOSED.value:
        raise IncidentConflictError("This incident is closed; reopen it to change it")
    return incident


def _clean(value: str | None) -> str | None:
    return (value or "").strip() or None


async def add_party(
    session: AsyncSession,
    *,
    organisation_id: str,
    incident_id: str,
    author: User,
    payload: IncidentPartyCreate,
) -> IncidentParty:
    incident = await _open_for_writes(
        session, organisation_id=organisation_id, incident_id=incident_id
    )
    name = _clean(payload.name)
    if name is None:
        raise AppValidationError("A person needs a name")
    party = IncidentParty(
        incident_id=incident.id,
        organisation_id=organisation_id,
        kind=payload.kind.value,
        name=name,
        affiliation=payload.affiliation.value,
        company=_clean(payload.company),
        contact_phone=_clean(payload.contact_phone),
        contact_email=str(payload.contact_email) if payload.contact_email else None,
        injured=payload.injured,
        injury_notes=_clean(payload.injury_notes),
        statement=_clean(payload.statement),
        added_by=author.id,
    )
    session.add(party)
    await session.flush()
    return party


async def update_party(
    session: AsyncSession,
    *,
    organisation_id: str,
    incident_id: str,
    party_id: str,
    payload: IncidentPartyUpdate,
) -> IncidentParty:
    incident = await _open_for_writes(
        session, organisation_id=organisation_id, incident_id=incident_id
    )
    party = await session.scalar(
        select(IncidentParty).where(
            IncidentParty.id == party_id,
            IncidentParty.incident_id == incident.id,
            IncidentParty.organisation_id == organisation_id,
        )
    )
    if party is None:
        raise IncidentNotFoundError()
    sent = payload.model_fields_set
    if "name" in sent:
        name = _clean(payload.name)
        if name is None:
            raise AppValidationError("A person needs a name")
        party.name = name
    if "affiliation" in sent and payload.affiliation is not None:
        party.affiliation = payload.affiliation.value
    if "company" in sent:
        party.company = _clean(payload.company)
    if "contact_phone" in sent:
        party.contact_phone = _clean(payload.contact_phone)
    if "contact_email" in sent:
        party.contact_email = (
            str(payload.contact_email) if payload.contact_email else None
        )
    if "injured" in sent and payload.injured is not None:
        party.injured = payload.injured
    if "injury_notes" in sent:
        party.injury_notes = _clean(payload.injury_notes)
    if "statement" in sent:
        party.statement = _clean(payload.statement)
    await session.flush()
    return party


async def add_damage(
    session: AsyncSession,
    *,
    organisation_id: str,
    incident_id: str,
    author: User,
    payload: IncidentDamageCreate,
) -> IncidentDamage:
    incident = await _open_for_writes(
        session, organisation_id=organisation_id, incident_id=incident_id
    )
    description = _clean(payload.description)
    if description is None:
        raise AppValidationError("Describe the damage")
    damage = IncidentDamage(
        incident_id=incident.id,
        organisation_id=organisation_id,
        item=_clean(payload.item),
        description=description,
        estimated_cost_minor=payload.estimated_cost_minor,
        currency=payload.currency,
        added_by=author.id,
    )
    session.add(damage)
    await session.flush()
    return damage


def _naive(moment: datetime | None) -> datetime | None:
    return service.naive_utc(moment) if moment is not None else None


async def add_resource(
    session: AsyncSession,
    *,
    organisation_id: str,
    incident_id: str,
    author: User,
    payload: IncidentResourceCreate,
) -> IncidentResource:
    incident = await _open_for_writes(
        session, organisation_id=organisation_id, incident_id=incident_id
    )
    name = _clean(payload.name)
    if name is None:
        raise AppValidationError("Name the resource")
    started, ended = _naive(payload.started_at), _naive(payload.ended_at)
    if started is not None and ended is not None and ended < started:
        raise AppValidationError("A resource cannot be released before it started")
    resource = IncidentResource(
        incident_id=incident.id,
        organisation_id=organisation_id,
        name=name,
        quantity=payload.quantity,
        started_at=started,
        ended_at=ended,
        notes=_clean(payload.notes),
        added_by=author.id,
    )
    session.add(resource)
    await session.flush()
    return resource


async def for_incident(
    session: AsyncSession, incident_id: str
) -> tuple[
    Sequence[IncidentParty], Sequence[IncidentDamage], Sequence[IncidentResource]
]:
    parties = (
        await session.scalars(
            select(IncidentParty)
            .where(IncidentParty.incident_id == incident_id)
            .order_by(IncidentParty.created_at, IncidentParty.id)
        )
    ).all()
    damage = (
        await session.scalars(
            select(IncidentDamage)
            .where(IncidentDamage.incident_id == incident_id)
            .order_by(IncidentDamage.created_at, IncidentDamage.id)
        )
    ).all()
    resources = (
        await session.scalars(
            select(IncidentResource)
            .where(IncidentResource.incident_id == incident_id)
            .order_by(IncidentResource.created_at, IncidentResource.id)
        )
    ).all()
    return parties, damage, resources
