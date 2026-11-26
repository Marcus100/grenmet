"""Incident rules (ADR-0067). Service functions flush; routers commit.

Every lookup filters on the caller's organisation in SQL, so another
organisation's record is 404. A closed incident is locked: nothing about it
changes until a holder of ``incidents.incidents.manage`` reopens it, and the
reopening is a timeline entry with its reason. Opening, closing and reopening
post an automatic operations-log entry through the outbox (topic
``opslog.entry_post``, ADR-0067 decision 3); this module never imports opslog.
"""

import uuid
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.auth.models import User
from src.exceptions import AppValidationError
from src.organisations.models import Membership, MembershipStatus
from src.pagination import PaginationParams
from src.utils.datetime import utc_now

from . import transitions
from .exceptions import (
    IncidentCategoryNotFoundError,
    IncidentChecklistItemNotFoundError,
    IncidentCheckNotFoundError,
    IncidentConflictError,
    IncidentNotFoundError,
)
from .models import (
    Incident,
    IncidentCategory,
    IncidentCheck,
    IncidentChecklistItem,
    IncidentCounter,
    IncidentNote,
    IncidentStatus,
    IncidentTimelineEntry,
    IncidentTimelineKind,
)
from .schemas import (
    IncidentCategoryCreate,
    IncidentCategoryUpdate,
    IncidentChecklistItemCreate,
    IncidentChecklistItemUpdate,
    IncidentCreate,
    IncidentUpdate,
)

#: The operations log's outbox topic (payload: ``src/opslog/messages.py``).
OPSLOG_TOPIC = "opslog.entry_post"
RECORD_KIND = "incidents.incident"


def naive_utc(moment: datetime) -> datetime:
    """A request datetime as stored: naive UTC (a naive value is read as UTC)."""
    if moment.tzinfo is None:
        return moment
    return moment.astimezone(UTC).replace(tzinfo=None)


def _text(value: str | None, message: str) -> str:
    """``value`` without surrounding spaces; 422 when nothing is left."""
    cleaned = (value or "").strip()
    if not cleaned:
        raise AppValidationError(message)
    return cleaned


def _escaped(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


async def names(
    session: AsyncSession, user_ids: set[uuid.UUID]
) -> dict[uuid.UUID, str | None]:
    if not user_ids:
        return {}
    users = await session.scalars(select(User).where(User.id.in_(user_ids)))
    return {user.id: (user.full_name or None) for user in users}


# --- categories and checklists ----------------------------------------------------


async def _require_member(
    session: AsyncSession, *, organisation_id: str, user_id: uuid.UUID
) -> None:
    found = await session.scalar(
        select(Membership.id).where(
            Membership.organisation_id == organisation_id,
            Membership.user_id == user_id,
            Membership.status == MembershipStatus.ACTIVE.value,
        )
    )
    if found is None:
        raise AppValidationError("The manager must be an active member")


async def _category_name_taken(
    session: AsyncSession, *, organisation_id: str, name: str, except_id: str | None
) -> bool:
    query = select(IncidentCategory.id).where(
        IncidentCategory.organisation_id == organisation_id,
        func.lower(IncidentCategory.name) == name.lower(),
    )
    if except_id is not None:
        query = query.where(IncidentCategory.id != except_id)
    return (await session.scalar(query)) is not None


async def list_categories(
    session: AsyncSession, *, organisation_id: str, include_archived: bool
) -> list[tuple[IncidentCategory, list[IncidentChecklistItem]]]:
    query = select(IncidentCategory).where(
        IncidentCategory.organisation_id == organisation_id
    )
    if not include_archived:
        query = query.where(IncidentCategory.archived_at.is_(None))
    categories = (await session.scalars(query.order_by(IncidentCategory.name))).all()
    items = await _checklists(
        session, [c.id for c in categories], include_archived=include_archived
    )
    return [(c, items.get(c.id, [])) for c in categories]


async def _checklists(
    session: AsyncSession, category_ids: list[str], *, include_archived: bool
) -> dict[str, list[IncidentChecklistItem]]:
    if not category_ids:
        return {}
    query = select(IncidentChecklistItem).where(
        IncidentChecklistItem.category_id.in_(category_ids)
    )
    if not include_archived:
        query = query.where(IncidentChecklistItem.archived_at.is_(None))
    rows = await session.scalars(
        query.order_by(IncidentChecklistItem.position, IncidentChecklistItem.created_at)
    )
    grouped: dict[str, list[IncidentChecklistItem]] = {}
    for row in rows:
        grouped.setdefault(row.category_id, []).append(row)
    return grouped


async def category_with_checklist(
    session: AsyncSession, category: IncidentCategory
) -> tuple[IncidentCategory, list[IncidentChecklistItem]]:
    items = await _checklists(session, [category.id], include_archived=True)
    return category, items.get(category.id, [])


async def get_category(
    session: AsyncSession, *, organisation_id: str, category_id: str
) -> IncidentCategory:
    category = await session.scalar(
        select(IncidentCategory).where(
            IncidentCategory.id == category_id,
            IncidentCategory.organisation_id == organisation_id,
        )
    )
    if category is None:
        raise IncidentCategoryNotFoundError()
    return category


async def create_category(
    session: AsyncSession, *, organisation_id: str, payload: IncidentCategoryCreate
) -> IncidentCategory:
    name = payload.name.strip()
    if not name:
        raise AppValidationError("A category needs a name")
    if await _category_name_taken(
        session, organisation_id=organisation_id, name=name, except_id=None
    ):
        raise IncidentConflictError("A category with this name already exists")
    if payload.manager_user_id is not None:
        await _require_member(
            session, organisation_id=organisation_id, user_id=payload.manager_user_id
        )
    category = IncidentCategory(
        organisation_id=organisation_id,
        name=name,
        description=payload.description,
        manager_user_id=payload.manager_user_id,
    )
    session.add(category)
    await session.flush()
    return category


async def update_category(
    session: AsyncSession,
    *,
    organisation_id: str,
    category_id: str,
    payload: IncidentCategoryUpdate,
) -> IncidentCategory:
    category = await get_category(
        session, organisation_id=organisation_id, category_id=category_id
    )
    sent = payload.model_fields_set
    if "name" in sent:
        name = (payload.name or "").strip()
        if not name:
            raise AppValidationError("A category needs a name")
        if await _category_name_taken(
            session, organisation_id=organisation_id, name=name, except_id=category.id
        ):
            raise IncidentConflictError("A category with this name already exists")
        category.name = name
    if "description" in sent:
        category.description = payload.description
    if "manager_user_id" in sent:
        if payload.manager_user_id is not None:
            await _require_member(
                session,
                organisation_id=organisation_id,
                user_id=payload.manager_user_id,
            )
        category.manager_user_id = payload.manager_user_id
    if "archived" in sent and payload.archived is not None:
        if payload.archived and category.archived_at is None:
            category.archived_at = utc_now()
        elif not payload.archived:
            category.archived_at = None
    await session.flush()
    return category


async def add_checklist_item(
    session: AsyncSession,
    *,
    organisation_id: str,
    category_id: str,
    payload: IncidentChecklistItemCreate,
) -> IncidentChecklistItem:
    category = await get_category(
        session, organisation_id=organisation_id, category_id=category_id
    )
    item = IncidentChecklistItem(
        category_id=category.id,
        organisation_id=organisation_id,
        label=_text(payload.label, "A checklist item needs a label"),
        required=payload.required,
        position=payload.position,
    )
    session.add(item)
    await session.flush()
    return item


async def update_checklist_item(
    session: AsyncSession,
    *,
    organisation_id: str,
    item_id: str,
    payload: IncidentChecklistItemUpdate,
) -> IncidentChecklistItem:
    item = await session.scalar(
        select(IncidentChecklistItem).where(
            IncidentChecklistItem.id == item_id,
            IncidentChecklistItem.organisation_id == organisation_id,
        )
    )
    if item is None:
        raise IncidentChecklistItemNotFoundError()
    sent = payload.model_fields_set
    if "label" in sent:
        item.label = _text(payload.label, "A checklist item needs a label")
    if "required" in sent and payload.required is not None:
        item.required = payload.required
    if "position" in sent and payload.position is not None:
        item.position = payload.position
    if "archived" in sent and payload.archived is not None:
        if payload.archived and item.archived_at is None:
            item.archived_at = utc_now()
        elif not payload.archived:
            item.archived_at = None
    await session.flush()
    return item


async def _active_category(
    session: AsyncSession, *, organisation_id: str, category_id: str | None
) -> str | None:
    if category_id is None:
        return None
    found = await session.scalar(
        select(IncidentCategory.id).where(
            IncidentCategory.id == category_id,
            IncidentCategory.organisation_id == organisation_id,
            IncidentCategory.archived_at.is_(None),
        )
    )
    if found is None:
        raise AppValidationError("The category is not an active category")
    return found


# --- incidents ----------------------------------------------------------------------


@dataclass(frozen=True)
class IncidentDetailView:
    incident: Incident
    checks: Sequence[IncidentCheck]
    timeline: Sequence[IncidentTimelineEntry]
    notes: Sequence[IncidentNote]
    names: dict[uuid.UUID, str | None]


async def _next_reference(
    session: AsyncSession, *, organisation_id: str, year: int
) -> str:
    """``INC-<year>-<nnnn>``: one atomic upsert, so two drafts never share a number."""
    number = await session.scalar(
        pg_insert(IncidentCounter)
        .values(organisation_id=organisation_id, year=year, last_number=1)
        .on_conflict_do_update(
            index_elements=["organisation_id", "year"],
            set_={"last_number": IncidentCounter.last_number + 1},
        )
        .returning(IncidentCounter.last_number)
    )
    return f"INC-{year}-{int(number or 0):04d}"


async def get_incident(
    session: AsyncSession,
    *,
    organisation_id: str,
    incident_id: str,
    lock: bool = False,
) -> Incident:
    """The organisation's incident; ``lock`` holds its row until the transaction ends,
    so status changes, checklist ticks and writes to a closing incident queue up."""
    query = select(Incident).where(
        Incident.id == incident_id, Incident.organisation_id == organisation_id
    )
    if lock:
        query = query.with_for_update()
    incident = await session.scalar(query)
    if incident is None:
        raise IncidentNotFoundError()
    return incident


def _require_unlocked(incident: Incident) -> None:
    if incident.status == IncidentStatus.CLOSED.value:
        raise IncidentConflictError("This incident is closed; reopen it to change it")


async def list_incidents(
    session: AsyncSession,
    *,
    organisation_id: str,
    status: IncidentStatus | None,
    category_id: str | None,
    exercise: bool | None,
    q: str | None,
    pagination: PaginationParams,
) -> tuple[Sequence[Incident], int]:
    query = select(Incident).where(Incident.organisation_id == organisation_id)
    if status is not None:
        query = query.where(Incident.status == status.value)
    if category_id is not None:
        query = query.where(Incident.category_id == category_id)
    if exercise is not None:
        query = query.where(Incident.exercise.is_(exercise))
    if q:
        term = f"%{_escaped(q)}%"
        query = query.where(
            Incident.title.ilike(term, escape="\\")
            | Incident.reference.ilike(term, escape="\\")
        )
    count = await session.scalar(select(func.count()).select_from(query.subquery()))
    rows = await session.scalars(
        query.order_by(Incident.created_at.desc(), Incident.id.desc())
        .offset(pagination.skip)
        .limit(pagination.limit)
    )
    return rows.all(), int(count or 0)


async def create_incident(
    session: AsyncSession,
    *,
    organisation_id: str,
    reporter: User,
    payload: IncidentCreate,
) -> Incident:
    category_id = await _active_category(
        session, organisation_id=organisation_id, category_id=payload.category_id
    )
    occurred_at = naive_utc(payload.occurred_at) if payload.occurred_at else utc_now()
    incident = Incident(
        organisation_id=organisation_id,
        reference=await _next_reference(
            session, organisation_id=organisation_id, year=utc_now().year
        ),
        category_id=category_id,
        title=_text(payload.title, "An incident needs a title"),
        summary=payload.summary,
        location=payload.location,
        occurred_at=occurred_at,
        exercise=payload.exercise,
        status=IncidentStatus.DRAFT.value,
        reported_by=reporter.id,
    )
    session.add(incident)
    await session.flush()
    return incident


async def update_incident(
    session: AsyncSession,
    *,
    organisation_id: str,
    incident_id: str,
    payload: IncidentUpdate,
) -> Incident:
    incident = await get_incident(
        session, organisation_id=organisation_id, incident_id=incident_id, lock=True
    )
    _require_unlocked(incident)
    sent = payload.model_fields_set
    if "title" in sent:
        incident.title = _text(payload.title, "An incident needs a title")
    if "occurred_at" in sent:
        if payload.occurred_at is None:
            raise AppValidationError("An incident needs a time")
        incident.occurred_at = naive_utc(payload.occurred_at)
    if "summary" in sent:
        incident.summary = payload.summary
    if "location" in sent:
        incident.location = payload.location
    if "category_id" in sent and payload.category_id != incident.category_id:
        if incident.status != IncidentStatus.DRAFT.value:
            raise IncidentConflictError(
                "The category is fixed once the incident is open"
            )
        incident.category_id = await _active_category(
            session, organisation_id=organisation_id, category_id=payload.category_id
        )
    await session.flush()
    return incident


async def _timeline(
    session: AsyncSession,
    incident: Incident,
    *,
    kind: IncidentTimelineKind,
    author: User,
    text: str,
    occurred_at: datetime | None = None,
) -> IncidentTimelineEntry:
    entry = IncidentTimelineEntry(
        incident_id=incident.id,
        organisation_id=incident.organisation_id,
        kind=kind.value,
        occurred_at=occurred_at or utc_now(),
        author_id=author.id,
        text=text,
    )
    session.add(entry)
    await session.flush()
    return entry


async def _post_to_log(
    session: AsyncSession, incident: Incident, entry: IncidentTimelineEntry, text: str
) -> None:
    """Ask the operations log for an automatic entry about this change."""
    prefix = "Exercise: " if incident.exercise else ""
    await outbox.enqueue(
        session,
        topic=OPSLOG_TOPIC,
        organisation_id=incident.organisation_id,
        dedupe_key=f"incidents.timeline:{entry.id}",
        payload={
            "text": f"{prefix}{text}"[:5000],
            "occurred_at": entry.occurred_at.replace(tzinfo=UTC).isoformat(),
            "record": {"kind": RECORD_KIND, "id": incident.id},
        },
    )


async def open_incident(
    session: AsyncSession, *, organisation_id: str, incident_id: str, actor: User
) -> Incident:
    """Draft to open: copy the category's checklist and post to the log."""
    incident = await get_incident(
        session, organisation_id=organisation_id, incident_id=incident_id, lock=True
    )
    if incident.status != IncidentStatus.DRAFT.value:
        raise IncidentConflictError("Only a draft can be opened")
    if incident.category_id is not None:
        items = await _checklists(
            session, [incident.category_id], include_archived=False
        )
        for item in items.get(incident.category_id, []):
            session.add(
                IncidentCheck(
                    incident_id=incident.id,
                    organisation_id=organisation_id,
                    label=item.label,
                    required=item.required,
                    position=item.position,
                )
            )
    transitions.move_incident(incident, IncidentStatus.OPEN, actor_id=actor.id)
    entry = await _timeline(
        session,
        incident,
        kind=IncidentTimelineKind.OPENED,
        author=actor,
        text="Incident opened",
    )
    await _post_to_log(
        session,
        incident,
        entry,
        f"Incident {incident.reference} opened: {incident.title}",
    )
    await session.flush()
    return incident


async def close_incident(
    session: AsyncSession, *, organisation_id: str, incident_id: str, actor: User
) -> Incident:
    incident = await get_incident(
        session, organisation_id=organisation_id, incident_id=incident_id, lock=True
    )
    if incident.status != IncidentStatus.OPEN.value:
        raise IncidentConflictError("Only an open incident can be closed")
    outstanding = await session.scalar(
        select(func.count())
        .select_from(IncidentCheck)
        .where(
            IncidentCheck.incident_id == incident.id,
            IncidentCheck.required.is_(True),
            IncidentCheck.done_at.is_(None),
        )
    )
    if outstanding:
        raise IncidentConflictError(
            f"{outstanding} required checklist item(s) are not done"
        )
    transitions.move_incident(incident, IncidentStatus.CLOSED, actor_id=actor.id)
    now = incident.closed_at
    entry = await _timeline(
        session,
        incident,
        kind=IncidentTimelineKind.CLOSED,
        author=actor,
        text="Incident closed",
        occurred_at=now,
    )
    await _post_to_log(
        session,
        incident,
        entry,
        f"Incident {incident.reference} closed: {incident.title}",
    )
    await session.flush()
    return incident


async def reopen_incident(
    session: AsyncSession,
    *,
    organisation_id: str,
    incident_id: str,
    actor: User,
    reason: str,
) -> Incident:
    incident = await get_incident(
        session, organisation_id=organisation_id, incident_id=incident_id, lock=True
    )
    if incident.status != IncidentStatus.CLOSED.value:
        raise IncidentConflictError("Only a closed incident can be reopened")
    transitions.move_incident(incident, IncidentStatus.OPEN, actor_id=actor.id)
    entry = await _timeline(
        session,
        incident,
        kind=IncidentTimelineKind.REOPENED,
        author=actor,
        text=f"Incident reopened: {reason}",
    )
    await _post_to_log(
        session,
        incident,
        entry,
        f"Incident {incident.reference} reopened: {reason}",
    )
    await session.flush()
    return incident


async def add_action(
    session: AsyncSession,
    *,
    organisation_id: str,
    incident_id: str,
    author: User,
    text: str,
    occurred_at: datetime | None,
) -> IncidentTimelineEntry:
    incident = await get_incident(
        session, organisation_id=organisation_id, incident_id=incident_id, lock=True
    )
    _require_unlocked(incident)
    return await _timeline(
        session,
        incident,
        kind=IncidentTimelineKind.ACTION,
        author=author,
        text=text,
        occurred_at=naive_utc(occurred_at) if occurred_at else None,
    )


async def add_note(
    session: AsyncSession,
    *,
    organisation_id: str,
    incident_id: str,
    author: User,
    text: str,
    private: bool,
) -> IncidentNote:
    incident = await get_incident(
        session, organisation_id=organisation_id, incident_id=incident_id, lock=True
    )
    _require_unlocked(incident)
    note = IncidentNote(
        incident_id=incident.id,
        organisation_id=organisation_id,
        author_id=author.id,
        text=text,
        private=private,
    )
    session.add(note)
    await session.flush()
    return note


async def set_check(
    session: AsyncSession,
    *,
    organisation_id: str,
    incident_id: str,
    check_id: str,
    actor: User,
    done: bool,
) -> IncidentCheck:
    incident = await get_incident(
        session, organisation_id=organisation_id, incident_id=incident_id, lock=True
    )
    if incident.status != IncidentStatus.OPEN.value:
        raise IncidentConflictError("Checklists change only while the incident is open")
    check = await session.scalar(
        select(IncidentCheck).where(
            IncidentCheck.id == check_id,
            IncidentCheck.incident_id == incident.id,
            IncidentCheck.organisation_id == organisation_id,
        )
    )
    if check is None:
        raise IncidentCheckNotFoundError()
    if done and check.done_at is None:
        check.done_at = utc_now()
        check.done_by = actor.id
    elif not done:
        check.done_at = None
        check.done_by = None
    await session.flush()
    return check


async def detail(
    session: AsyncSession,
    *,
    organisation_id: str,
    incident_id: str,
    can_read_private: bool,
) -> IncidentDetailView:
    incident = await get_incident(
        session, organisation_id=organisation_id, incident_id=incident_id
    )
    return await detail_of(session, incident, can_read_private=can_read_private)


async def detail_of(
    session: AsyncSession, incident: Incident, *, can_read_private: bool
) -> IncidentDetailView:
    checks = (
        await session.scalars(
            select(IncidentCheck)
            .where(IncidentCheck.incident_id == incident.id)
            .order_by(IncidentCheck.position, IncidentCheck.created_at)
        )
    ).all()
    timeline = (
        await session.scalars(
            select(IncidentTimelineEntry)
            .where(IncidentTimelineEntry.incident_id == incident.id)
            .order_by(
                IncidentTimelineEntry.occurred_at,
                IncidentTimelineEntry.created_at,
                IncidentTimelineEntry.id,
            )
        )
    ).all()
    notes_query = select(IncidentNote).where(IncidentNote.incident_id == incident.id)
    if not can_read_private:
        notes_query = notes_query.where(IncidentNote.private.is_(False))
    notes = (
        await session.scalars(
            notes_query.order_by(IncidentNote.created_at, IncidentNote.id)
        )
    ).all()
    people = {incident.reported_by}
    people |= {t.author_id for t in timeline} | {n.author_id for n in notes}
    return IncidentDetailView(
        incident=incident,
        checks=checks,
        timeline=timeline,
        notes=notes,
        names=await names(session, people),
    )
