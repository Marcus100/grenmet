"""Incident routes (ADR-0067, ADR-0025 zone ``org``).

Acts for the organisation named in ``X-Barrels-Organisation``; the organisation
needs the ``incidents`` entitlement and the caller the key each route names:

- ``incidents.incidents.read``: list and read incidents and categories;
- ``incidents.incidents.write``: report, edit and open an incident, add timeline
  actions and notes, tick checklist items;
- ``incidents.incidents.private``: see and write private notes;
- ``incidents.incidents.manage``: close and reopen;
- ``incidents.settings.manage``: categories, managers and checklists.

Owners and admins hold every key. No superuser bypass. Routers commit; service
functions flush.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status

from src.dependencies import SessionDep
from src.openapi_responses import AUTHENTICATED, BAD_REQUEST, CONFLICT, NOT_FOUND
from src.organisations import grants
from src.organisations.dependencies import OrgContext, require_org_permission
from src.pagination import PaginationDep

from . import attachments, details, service
from .exceptions import IncidentForbiddenError
from .models import (
    Incident,
    IncidentAffiliation,
    IncidentCategory,
    IncidentChecklistItem,
    IncidentParty,
    IncidentPartyKind,
    IncidentStatus,
    IncidentTimelineEntry,
    IncidentTimelineKind,
)
from .schemas import (
    IncidentAttachmentCreate,
    IncidentAttachmentPublic,
    IncidentCategoryCreate,
    IncidentCategoryList,
    IncidentCategoryPublic,
    IncidentCategoryUpdate,
    IncidentChecklistItemCreate,
    IncidentChecklistItemPublic,
    IncidentChecklistItemUpdate,
    IncidentCheckPublic,
    IncidentCheckUpdate,
    IncidentCreate,
    IncidentDamageCreate,
    IncidentDamagePublic,
    IncidentDetail,
    IncidentNoteCreate,
    IncidentNotePublic,
    IncidentPage,
    IncidentPartyCreate,
    IncidentPartyPublic,
    IncidentPartyUpdate,
    IncidentPublic,
    IncidentReopen,
    IncidentResourceCreate,
    IncidentResourcePublic,
    IncidentTimelineCreate,
    IncidentTimelinePublic,
    IncidentUpdate,
)

router = APIRouter(prefix="/incidents", tags=["incidents"])

PRIVATE_KEY = "incidents.incidents.private"

IncidentsReader = Annotated[
    OrgContext, Depends(require_org_permission("incidents.incidents.read"))
]
IncidentsWriter = Annotated[
    OrgContext, Depends(require_org_permission("incidents.incidents.write"))
]
IncidentsManager = Annotated[
    OrgContext, Depends(require_org_permission("incidents.incidents.manage"))
]
IncidentsSettings = Annotated[
    OrgContext, Depends(require_org_permission("incidents.settings.manage"))
]

READ_ERRORS = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND}
WRITE_ERRORS = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND, **CONFLICT}


async def _can_private(session: SessionDep, org: OrgContext) -> bool:
    return await grants.has_org_permission(
        session, membership=org.membership, permission_key=PRIVATE_KEY
    )


def _category(
    category: IncidentCategory, items: list[IncidentChecklistItem]
) -> IncidentCategoryPublic:
    return IncidentCategoryPublic(
        id=category.id,
        name=category.name,
        description=category.description,
        manager_user_id=category.manager_user_id,
        archived_at=category.archived_at,
        created_at=category.created_at,
        checklist=[
            IncidentChecklistItemPublic.model_validate(i, from_attributes=True)
            for i in items
        ],
    )


def _incident(incident: Incident, reporter_name: str | None) -> IncidentPublic:
    return IncidentPublic(
        id=incident.id,
        reference=incident.reference,
        category_id=incident.category_id,
        title=incident.title,
        summary=incident.summary,
        location=incident.location,
        occurred_at=incident.occurred_at,
        exercise=incident.exercise,
        status=IncidentStatus(incident.status),
        reported_by=incident.reported_by,
        reported_by_name=reporter_name,
        opened_at=incident.opened_at,
        closed_at=incident.closed_at,
        closed_by=incident.closed_by,
        created_at=incident.created_at,
        updated_at=incident.updated_at,
    )


def _timeline(entry: IncidentTimelineEntry, name: str | None) -> IncidentTimelinePublic:
    return IncidentTimelinePublic(
        id=entry.id,
        kind=IncidentTimelineKind(entry.kind),
        occurred_at=entry.occurred_at,
        author_id=entry.author_id,
        author_name=name,
        text=entry.text,
        created_at=entry.created_at,
    )


def _detail(view: service.IncidentDetailView) -> IncidentDetail:
    base = _incident(view.incident, view.names.get(view.incident.reported_by))
    return IncidentDetail(
        **base.model_dump(),
        checks=[
            IncidentCheckPublic.model_validate(c, from_attributes=True)
            for c in view.checks
        ],
        timeline=[_timeline(t, view.names.get(t.author_id)) for t in view.timeline],
        notes=[
            IncidentNotePublic(
                id=n.id,
                author_id=n.author_id,
                author_name=view.names.get(n.author_id),
                text=n.text,
                private=n.private,
                created_at=n.created_at,
            )
            for n in view.notes
        ],
    )


def _party(party: IncidentParty, *, private: bool) -> IncidentPartyPublic:
    """Contact details, injury notes and the statement only for holders of the
    private key: all three are personal data about a named person."""
    return IncidentPartyPublic(
        id=party.id,
        kind=IncidentPartyKind(party.kind),
        name=party.name,
        affiliation=IncidentAffiliation(party.affiliation),
        company=party.company,
        contact_phone=party.contact_phone if private else None,
        contact_email=party.contact_email if private else None,
        injured=party.injured,
        injury_notes=party.injury_notes if private else None,
        statement=party.statement if private else None,
        created_at=party.created_at,
        updated_at=party.updated_at,
    )


async def _with_extras(
    session: SessionDep, detail: IncidentDetail, *, private: bool
) -> IncidentDetail:
    rows = await attachments.for_incident(session, detail.id)
    detail.attachments = [
        IncidentAttachmentPublic.model_validate(a, from_attributes=True) for a in rows
    ]
    parties, damage, resources = await details.for_incident(session, detail.id)
    detail.parties = [_party(p, private=private) for p in parties]
    detail.damage = [
        IncidentDamagePublic.model_validate(d, from_attributes=True) for d in damage
    ]
    detail.resources = [
        IncidentResourcePublic.model_validate(r, from_attributes=True)
        for r in resources
    ]
    return detail


async def _detail_response(
    session: SessionDep, org: OrgContext, incident: Incident
) -> IncidentDetail:
    private = await _can_private(session, org)
    view = await service.detail_of(session, incident, can_read_private=private)
    return await _with_extras(session, _detail(view), private=private)


# --- categories -------------------------------------------------------------------


@router.get(
    "/org/categories",
    response_model=IncidentCategoryList,
    summary="List incident categories",
    description="Each with its checklist. Archived ones only with `include_archived`.",
    operation_id="incidentsListCategories",
    responses=READ_ERRORS,
)
async def list_categories(
    *, session: SessionDep, org: IncidentsReader, include_archived: bool = False
) -> Any:
    rows = await service.list_categories(
        session, organisation_id=org.organisation_id, include_archived=include_archived
    )
    return IncidentCategoryList(data=[_category(c, items) for c, items in rows])


@router.post(
    "/org/categories",
    response_model=IncidentCategoryPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create an incident category",
    description=(
        "`manager_user_id` must be an active member. Names are unique per "
        "organisation, ignoring case."
    ),
    operation_id="incidentsCreateCategory",
    responses=WRITE_ERRORS,
)
async def create_category(
    *, session: SessionDep, org: IncidentsSettings, payload: IncidentCategoryCreate
) -> Any:
    category = await service.create_category(
        session, organisation_id=org.organisation_id, payload=payload
    )
    await session.commit()
    return _category(*await service.category_with_checklist(session, category))


@router.patch(
    "/org/categories/{category_id}",
    response_model=IncidentCategoryPublic,
    summary="Change an incident category",
    description="Only the fields sent change. `archived: true` stops new use.",
    operation_id="incidentsUpdateCategory",
    responses=WRITE_ERRORS,
)
async def update_category(
    *,
    session: SessionDep,
    org: IncidentsSettings,
    category_id: str,
    payload: IncidentCategoryUpdate,
) -> Any:
    category = await service.update_category(
        session,
        organisation_id=org.organisation_id,
        category_id=category_id,
        payload=payload,
    )
    await session.commit()
    return _category(*await service.category_with_checklist(session, category))


@router.post(
    "/org/categories/{category_id}/checklist-items",
    response_model=IncidentChecklistItemPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add a checklist item to a category",
    description=(
        "Incidents opened afterwards get it. A `required` item must be done "
        "before an incident can close."
    ),
    operation_id="incidentsCreateChecklistItem",
    responses=WRITE_ERRORS,
)
async def create_checklist_item(
    *,
    session: SessionDep,
    org: IncidentsSettings,
    category_id: str,
    payload: IncidentChecklistItemCreate,
) -> Any:
    item = await service.add_checklist_item(
        session,
        organisation_id=org.organisation_id,
        category_id=category_id,
        payload=payload,
    )
    await session.commit()
    return IncidentChecklistItemPublic.model_validate(item, from_attributes=True)


@router.patch(
    "/org/checklist-items/{item_id}",
    response_model=IncidentChecklistItemPublic,
    summary="Change a checklist item",
    description="Incidents already open keep the checklist they were given.",
    operation_id="incidentsUpdateChecklistItem",
    responses=WRITE_ERRORS,
)
async def update_checklist_item(
    *,
    session: SessionDep,
    org: IncidentsSettings,
    item_id: str,
    payload: IncidentChecklistItemUpdate,
) -> Any:
    item = await service.update_checklist_item(
        session, organisation_id=org.organisation_id, item_id=item_id, payload=payload
    )
    await session.commit()
    return IncidentChecklistItemPublic.model_validate(item, from_attributes=True)


# --- incidents ----------------------------------------------------------------------


@router.get(
    "/org/incidents",
    response_model=IncidentPage,
    summary="List incidents",
    description=(
        "Newest first. `q` searches the title and reference. `exercise` filters "
        "training exercises in or out."
    ),
    operation_id="incidentsListIncidents",
    responses=READ_ERRORS,
)
async def list_incidents(
    *,
    session: SessionDep,
    org: IncidentsReader,
    pagination: PaginationDep,
    status_filter: Annotated[IncidentStatus | None, Query(alias="status")] = None,
    category_id: Annotated[str | None, Query(max_length=100)] = None,
    exercise: bool | None = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
) -> Any:
    rows, count = await service.list_incidents(
        session,
        organisation_id=org.organisation_id,
        status=status_filter,
        category_id=category_id,
        exercise=exercise,
        q=q,
        pagination=pagination,
    )
    reporters = await service.names(session, {r.reported_by for r in rows})
    size = pagination.size
    return IncidentPage(
        data=[_incident(r, reporters.get(r.reported_by)) for r in rows],
        count=count,
        page=pagination.page,
        size=size,
        total_pages=(count + size - 1) // size if count > 0 else 1,
    )


@router.post(
    "/org/incidents",
    response_model=IncidentDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Report an incident",
    description=(
        "Starts as a draft with a reference such as `INC-2026-0001`. "
        "`occurred_at` defaults to now."
    ),
    operation_id="incidentsCreateIncident",
    responses=WRITE_ERRORS,
)
async def create_incident(
    *, session: SessionDep, org: IncidentsWriter, payload: IncidentCreate
) -> Any:
    incident = await service.create_incident(
        session, organisation_id=org.organisation_id, reporter=org.user, payload=payload
    )
    await session.commit()
    return await _detail_response(session, org, incident)


@router.get(
    "/org/incidents/{incident_id}",
    response_model=IncidentDetail,
    summary="Read an incident",
    description="With its checklist, timeline and the notes you may see.",
    operation_id="incidentsGetIncident",
    responses=READ_ERRORS,
)
async def get_incident(
    *, session: SessionDep, org: IncidentsReader, incident_id: str
) -> Any:
    private = await _can_private(session, org)
    view = await service.detail(
        session,
        organisation_id=org.organisation_id,
        incident_id=incident_id,
        can_read_private=private,
    )
    return await _with_extras(session, _detail(view), private=private)


@router.patch(
    "/org/incidents/{incident_id}",
    response_model=IncidentDetail,
    summary="Change an incident",
    description=(
        "Only the fields sent change. A closed incident is locked (409). The "
        "category can change only while it is a draft. Changes are audited."
    ),
    operation_id="incidentsUpdateIncident",
    responses=WRITE_ERRORS,
)
async def update_incident(
    *,
    session: SessionDep,
    org: IncidentsWriter,
    incident_id: str,
    payload: IncidentUpdate,
) -> Any:
    incident = await service.update_incident(
        session,
        organisation_id=org.organisation_id,
        incident_id=incident_id,
        payload=payload,
    )
    await session.commit()
    return await _detail_response(session, org, incident)


@router.post(
    "/org/incidents/{incident_id}/open",
    response_model=IncidentDetail,
    summary="Open a draft incident",
    description=(
        "Copies the category's checklist, records the opening on the timeline "
        "and posts an automatic entry to the operations log."
    ),
    operation_id="incidentsOpenIncident",
    responses=WRITE_ERRORS,
)
async def open_incident(
    *, session: SessionDep, org: IncidentsWriter, incident_id: str
) -> Any:
    incident = await service.open_incident(
        session,
        organisation_id=org.organisation_id,
        incident_id=incident_id,
        actor=org.user,
    )
    await session.commit()
    return await _detail_response(session, org, incident)


@router.post(
    "/org/incidents/{incident_id}/close",
    response_model=IncidentDetail,
    summary="Close an incident",
    description=(
        "Needs `incidents.incidents.manage`. Refused with 409 while a required "
        "checklist item is not done. Closing locks the incident."
    ),
    operation_id="incidentsCloseIncident",
    responses=WRITE_ERRORS,
)
async def close_incident(
    *, session: SessionDep, org: IncidentsManager, incident_id: str
) -> Any:
    incident = await service.close_incident(
        session,
        organisation_id=org.organisation_id,
        incident_id=incident_id,
        actor=org.user,
    )
    await session.commit()
    return await _detail_response(session, org, incident)


@router.post(
    "/org/incidents/{incident_id}/reopen",
    response_model=IncidentDetail,
    summary="Reopen a closed incident",
    description=(
        "Needs `incidents.incidents.manage` and a reason, which goes on the "
        "timeline and the operations log."
    ),
    operation_id="incidentsReopenIncident",
    responses=WRITE_ERRORS,
)
async def reopen_incident(
    *,
    session: SessionDep,
    org: IncidentsManager,
    incident_id: str,
    payload: IncidentReopen,
) -> Any:
    incident = await service.reopen_incident(
        session,
        organisation_id=org.organisation_id,
        incident_id=incident_id,
        actor=org.user,
        reason=payload.reason,
    )
    await session.commit()
    return await _detail_response(session, org, incident)


@router.post(
    "/org/incidents/{incident_id}/timeline",
    response_model=IncidentTimelinePublic,
    status_code=status.HTTP_201_CREATED,
    summary="Record a response action",
    description=(
        "A time-stamped action on the shared timeline. `occurred_at` defaults to "
        "now. Timeline entries are never changed or removed."
    ),
    operation_id="incidentsCreateTimelineEntry",
    responses=WRITE_ERRORS,
)
async def create_timeline_entry(
    *,
    session: SessionDep,
    org: IncidentsWriter,
    incident_id: str,
    payload: IncidentTimelineCreate,
) -> Any:
    entry = await service.add_action(
        session,
        organisation_id=org.organisation_id,
        incident_id=incident_id,
        author=org.user,
        text=payload.text,
        occurred_at=payload.occurred_at,
    )
    await session.commit()
    return _timeline(entry, org.user.full_name or None)


@router.post(
    "/org/incidents/{incident_id}/notes",
    response_model=IncidentNotePublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add a note to an incident",
    description=(
        "Detail, correspondence or findings, kept apart from the timeline. A "
        "private note needs `incidents.incidents.private`."
    ),
    operation_id="incidentsCreateNote",
    responses=WRITE_ERRORS,
)
async def create_note(
    *,
    session: SessionDep,
    org: IncidentsWriter,
    incident_id: str,
    payload: IncidentNoteCreate,
) -> Any:
    if payload.private and not await _can_private(session, org):
        raise IncidentForbiddenError("You cannot write private notes")
    note = await service.add_note(
        session,
        organisation_id=org.organisation_id,
        incident_id=incident_id,
        author=org.user,
        text=payload.text,
        private=payload.private,
    )
    await session.commit()
    return IncidentNotePublic(
        id=note.id,
        author_id=note.author_id,
        author_name=org.user.full_name or None,
        text=note.text,
        private=note.private,
        created_at=note.created_at,
    )


@router.patch(
    "/org/incidents/{incident_id}/checks/{check_id}",
    response_model=IncidentCheckPublic,
    summary="Tick or untick a checklist item",
    description="Only while the incident is open.",
    operation_id="incidentsUpdateCheck",
    responses=WRITE_ERRORS,
)
async def update_check(
    *,
    session: SessionDep,
    org: IncidentsWriter,
    incident_id: str,
    check_id: str,
    payload: IncidentCheckUpdate,
) -> Any:
    check = await service.set_check(
        session,
        organisation_id=org.organisation_id,
        incident_id=incident_id,
        check_id=check_id,
        actor=org.user,
        done=payload.done,
    )
    await session.commit()
    return IncidentCheckPublic.model_validate(check, from_attributes=True)


@router.post(
    "/org/incidents/{incident_id}/attachments",
    response_model=IncidentAttachmentPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add a photo to an incident",
    description=(
        "Upload first with `POST /storage/uploads` (app `incidents`, purpose "
        "`incident-photo`; private, metadata stripped), then attach its id. At most "
        "50 per incident; never changed or removed. A closed incident refuses (409)."
    ),
    operation_id="incidentsCreateAttachment",
    responses=WRITE_ERRORS,
)
async def create_attachment(
    *,
    session: SessionDep,
    org: IncidentsWriter,
    incident_id: str,
    payload: IncidentAttachmentCreate,
) -> Any:
    attachment = await attachments.add_attachment(
        session,
        organisation_id=org.organisation_id,
        incident_id=incident_id,
        author=org.user,
        file_id=payload.file_id,
        caption=payload.caption,
    )
    await session.commit()
    return IncidentAttachmentPublic.model_validate(attachment, from_attributes=True)


@router.post(
    "/org/incidents/{incident_id}/parties",
    response_model=IncidentPartyPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add a person involved or a witness",
    description=(
        "Contact details and injury notes are personal data: they are returned "
        "only to holders of `incidents.incidents.private`. A closed incident "
        "refuses (409)."
    ),
    operation_id="incidentsCreateParty",
    responses=WRITE_ERRORS,
)
async def create_party(
    *,
    session: SessionDep,
    org: IncidentsWriter,
    incident_id: str,
    payload: IncidentPartyCreate,
) -> Any:
    party = await details.add_party(
        session,
        organisation_id=org.organisation_id,
        incident_id=incident_id,
        author=org.user,
        payload=payload,
    )
    await session.commit()
    return _party(party, private=await _can_private(session, org))


@router.patch(
    "/org/incidents/{incident_id}/parties/{party_id}",
    response_model=IncidentPartyPublic,
    summary="Correct a person's details",
    description="Only the fields sent change; the earlier values stay in the history.",
    operation_id="incidentsUpdateParty",
    responses=WRITE_ERRORS,
)
async def update_party(
    *,
    session: SessionDep,
    org: IncidentsWriter,
    incident_id: str,
    party_id: str,
    payload: IncidentPartyUpdate,
) -> Any:
    party = await details.update_party(
        session,
        organisation_id=org.organisation_id,
        incident_id=incident_id,
        party_id=party_id,
        payload=payload,
    )
    await session.commit()
    return _party(party, private=await _can_private(session, org))


@router.post(
    "/org/incidents/{incident_id}/damage",
    response_model=IncidentDamagePublic,
    status_code=status.HTTP_201_CREATED,
    summary="Record damage",
    description=(
        "What was damaged and an optional cost estimate in minor units "
        "(default currency XCD). Insert only; correct with a note."
    ),
    operation_id="incidentsCreateDamage",
    responses=WRITE_ERRORS,
)
async def create_damage(
    *,
    session: SessionDep,
    org: IncidentsWriter,
    incident_id: str,
    payload: IncidentDamageCreate,
) -> Any:
    damage = await details.add_damage(
        session,
        organisation_id=org.organisation_id,
        incident_id=incident_id,
        author=org.user,
        payload=payload,
    )
    await session.commit()
    return IncidentDamagePublic.model_validate(damage, from_attributes=True)


@router.post(
    "/org/incidents/{incident_id}/resources",
    response_model=IncidentResourcePublic,
    status_code=status.HTTP_201_CREATED,
    summary="Record a resource used in the response",
    description="A vehicle, team or piece of equipment, with optional times. Insert only.",
    operation_id="incidentsCreateResource",
    responses=WRITE_ERRORS,
)
async def create_resource(
    *,
    session: SessionDep,
    org: IncidentsWriter,
    incident_id: str,
    payload: IncidentResourceCreate,
) -> Any:
    resource = await details.add_resource(
        session,
        organisation_id=org.organisation_id,
        incident_id=incident_id,
        author=org.user,
        payload=payload,
    )
    await session.commit()
    return IncidentResourcePublic.model_validate(resource, from_attributes=True)
