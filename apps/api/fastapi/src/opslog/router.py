"""Operations log routes (ADR-0067, ADR-0025 zone ``org``).

Acts for the organisation named in ``X-Barrels-Organisation``; the organisation
needs the ``opslog`` entitlement and the caller the key each route names:

- ``opslog.entries.read``: list logs, categories and entries, read an entry;
- ``opslog.entries.write``: write an entry, edit your own, add a comment;
- ``opslog.entries.private``: see and write private entries (others get 404);
- ``opslog.settings.manage``: create and change logs and categories.

Owners and admins hold every key. No superuser bypass. Routers commit; service
functions flush.
"""

import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status

from src import record_links
from src.dependencies import SessionDep
from src.openapi_responses import AUTHENTICATED, BAD_REQUEST, CONFLICT, NOT_FOUND
from src.organisations import grants
from src.organisations.dependencies import OrgContext, require_org_permission

from . import attachments, service, summary
from .models import OpsLogEntry, OpsLogEntrySource
from .schemas import (
    OpsLogAttachmentCreate,
    OpsLogAttachmentPublic,
    OpsLogCategoryCreate,
    OpsLogCategoryList,
    OpsLogCategoryPublic,
    OpsLogCategoryUpdate,
    OpsLogCommentCreate,
    OpsLogCommentPublic,
    OpsLogCreate,
    OpsLogEntryCreate,
    OpsLogEntryDetail,
    OpsLogEntryPage,
    OpsLogEntryPublic,
    OpsLogEntryUpdate,
    OpsLogList,
    OpsLogPublic,
    OpsLogRecordRef,
    OpsLogSummarySubscription,
    OpsLogUpdate,
)

router = APIRouter(prefix="/opslog", tags=["opslog"])

PRIVATE_KEY = "opslog.entries.private"

OpsLogReader = Annotated[
    OrgContext, Depends(require_org_permission("opslog.entries.read"))
]
OpsLogWriter = Annotated[
    OrgContext, Depends(require_org_permission("opslog.entries.write"))
]
OpsLogManager = Annotated[
    OrgContext, Depends(require_org_permission("opslog.settings.manage"))
]

READ_ERRORS = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND}
WRITE_ERRORS = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND, **CONFLICT}


async def _can_private(session: SessionDep, org: OrgContext) -> bool:
    return await grants.has_org_permission(
        session, membership=org.membership, permission_key=PRIVATE_KEY
    )


def _ref(entry: OpsLogEntry) -> tuple[str, str] | None:
    if entry.source_kind is None or entry.source_id is None:
        return None
    return entry.source_kind, entry.source_id


async def _links(
    session: SessionDep, org: OrgContext, views: list[service.EntryView]
) -> dict[tuple[str, str], record_links.RecordLink]:
    refs = [ref for v in views if (ref := _ref(v.entry)) is not None]
    if not refs:
        return {}
    return await record_links.resolve(
        session,
        organisation_id=org.organisation_id,
        membership=org.membership,
        refs=refs,
    )


async def _entries(
    session: SessionDep, org: OrgContext, views: list[service.EntryView]
) -> list[OpsLogEntryPublic]:
    links = await _links(session, org, views)
    return [_entry(v, links) for v in views]


def _entry(
    view: service.EntryView, links: dict[tuple[str, str], record_links.RecordLink]
) -> OpsLogEntryPublic:
    entry = view.entry
    ref = _ref(entry)
    link = links.get(ref) if ref is not None else None
    record = (
        OpsLogRecordRef(
            kind=ref[0],
            id=ref[1],
            title=link.title if link else None,
            available=link is not None,
        )
        if ref is not None
        else None
    )
    return OpsLogEntryPublic(
        id=entry.id,
        log_id=entry.log_id,
        category_id=entry.category_id,
        occurred_at=entry.occurred_at,
        author_id=entry.author_id,
        author_name=view.author_name,
        text=entry.text,
        location=entry.location,
        private=entry.private,
        source=OpsLogEntrySource(entry.source),
        record=record,
        comment_count=view.comment_count,
        edited_at=entry.edited_at,
        created_at=entry.created_at,
    )


def _comment(view: service.CommentView) -> OpsLogCommentPublic:
    comment = view.comment
    return OpsLogCommentPublic(
        id=comment.id,
        entry_id=comment.entry_id,
        author_id=comment.author_id,
        author_name=view.author_name,
        text=comment.text,
        created_at=comment.created_at,
    )


# --- logs -------------------------------------------------------------------------


@router.get(
    "/org/logs",
    response_model=OpsLogList,
    summary="List my organisation's operations logs",
    description="Archived logs are left out unless `include_archived` is true.",
    operation_id="opslogListLogs",
    responses=READ_ERRORS,
)
async def list_logs(
    *, session: SessionDep, org: OpsLogReader, include_archived: bool = False
) -> Any:
    rows = await service.list_logs(
        session, organisation_id=org.organisation_id, include_archived=include_archived
    )
    return OpsLogList(
        data=[OpsLogPublic.model_validate(r, from_attributes=True) for r in rows]
    )


@router.post(
    "/org/logs",
    response_model=OpsLogPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Create an operations log",
    description=(
        "A named logbook with its own edit rule: `open` (the author may edit, "
        "within `edit_window_minutes` when set), `append_only` (comments only) or "
        "`locked`. Names are unique per organisation, ignoring case."
    ),
    operation_id="opslogCreateLog",
    responses=WRITE_ERRORS,
)
async def create_log(
    *, session: SessionDep, org: OpsLogManager, payload: OpsLogCreate
) -> Any:
    log = await service.create_log(
        session, organisation_id=org.organisation_id, payload=payload
    )
    await session.commit()
    return OpsLogPublic.model_validate(log, from_attributes=True)


@router.patch(
    "/org/logs/{log_id}",
    response_model=OpsLogPublic,
    summary="Change an operations log",
    description="Only the fields sent change. `archived: true` stops new writes.",
    operation_id="opslogUpdateLog",
    responses=WRITE_ERRORS,
)
async def update_log(
    *, session: SessionDep, org: OpsLogManager, log_id: str, payload: OpsLogUpdate
) -> Any:
    log = await service.update_log(
        session, organisation_id=org.organisation_id, log_id=log_id, payload=payload
    )
    await session.commit()
    return OpsLogPublic.model_validate(log, from_attributes=True)


# --- categories -------------------------------------------------------------------


@router.get(
    "/org/logs/{log_id}/categories",
    response_model=OpsLogCategoryList,
    summary="List a log's categories",
    description="Up to three levels, shallowest first. `parent_id` links the tree.",
    operation_id="opslogListCategories",
    responses=READ_ERRORS,
)
async def list_categories(
    *,
    session: SessionDep,
    org: OpsLogReader,
    log_id: str,
    include_archived: bool = False,
) -> Any:
    rows = await service.list_categories(
        session,
        organisation_id=org.organisation_id,
        log_id=log_id,
        include_archived=include_archived,
    )
    return OpsLogCategoryList(
        data=[
            OpsLogCategoryPublic.model_validate(r, from_attributes=True) for r in rows
        ]
    )


@router.post(
    "/org/logs/{log_id}/categories",
    response_model=OpsLogCategoryPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add a category to a log",
    description="`parent_id` nests it under another category of the same log.",
    operation_id="opslogCreateCategory",
    responses=WRITE_ERRORS,
)
async def create_category(
    *,
    session: SessionDep,
    org: OpsLogManager,
    log_id: str,
    payload: OpsLogCategoryCreate,
) -> Any:
    category = await service.create_category(
        session, organisation_id=org.organisation_id, log_id=log_id, payload=payload
    )
    await session.commit()
    return OpsLogCategoryPublic.model_validate(category, from_attributes=True)


@router.patch(
    "/org/categories/{category_id}",
    response_model=OpsLogCategoryPublic,
    summary="Rename or archive a category",
    description="Archived categories stay on existing entries but take no new ones.",
    operation_id="opslogUpdateCategory",
    responses=WRITE_ERRORS,
)
async def update_category(
    *,
    session: SessionDep,
    org: OpsLogManager,
    category_id: str,
    payload: OpsLogCategoryUpdate,
) -> Any:
    category = await service.update_category(
        session,
        organisation_id=org.organisation_id,
        category_id=category_id,
        payload=payload,
    )
    await session.commit()
    return OpsLogCategoryPublic.model_validate(category, from_attributes=True)


# --- entries ----------------------------------------------------------------------


@router.get(
    "/org/logs/{log_id}/entries",
    response_model=OpsLogEntryPage,
    summary="List a log's entries",
    description=(
        "Newest first by `occurred_at`; keyset: pass `next_cursor` back as `cursor`. "
        "`occurred_from` is inclusive and `occurred_to` exclusive. `category_id` "
        "includes the categories under it. `q` searches the text. Private entries "
        "appear only for holders of `opslog.entries.private`."
    ),
    operation_id="opslogListEntries",
    responses=READ_ERRORS,
)
async def list_entries(
    *,
    session: SessionDep,
    org: OpsLogReader,
    log_id: str,
    occurred_from: datetime | None = None,
    occurred_to: datetime | None = None,
    category_id: Annotated[str | None, Query(max_length=100)] = None,
    author_id: uuid.UUID | None = None,
    source: OpsLogEntrySource | None = None,
    q: Annotated[str | None, Query(max_length=200)] = None,
    limit: Annotated[int, Query(ge=1, le=service.MAX_PAGE)] = 50,
    cursor: Annotated[str | None, Query(max_length=500)] = None,
) -> Any:
    views, next_cursor = await service.list_entries(
        session,
        organisation_id=org.organisation_id,
        log_id=log_id,
        can_read_private=await _can_private(session, org),
        filters=service.EntryFilters(
            occurred_from=occurred_from,
            occurred_to=occurred_to,
            category_id=category_id,
            author_id=author_id,
            source=source,
            q=q,
        ),
        limit=limit,
        cursor=cursor,
    )
    return OpsLogEntryPage(
        data=await _entries(session, org, views),
        limit=limit,
        next_cursor=next_cursor,
    )


@router.post(
    "/org/logs/{log_id}/entries",
    response_model=OpsLogEntryPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Write a log entry",
    description=(
        "`occurred_at` defaults to now. A private entry needs "
        "`opslog.entries.private`. Archived logs refuse new entries with 409."
    ),
    operation_id="opslogCreateEntry",
    responses=WRITE_ERRORS,
)
async def create_entry(
    *, session: SessionDep, org: OpsLogWriter, log_id: str, payload: OpsLogEntryCreate
) -> Any:
    view = await service.create_entry(
        session,
        organisation_id=org.organisation_id,
        log_id=log_id,
        author=org.user,
        can_write_private=await _can_private(session, org),
        payload=payload,
    )
    await session.commit()
    [public] = await _entries(session, org, [view])
    return public


@router.get(
    "/org/entries/{entry_id}",
    response_model=OpsLogEntryDetail,
    summary="Read a log entry and its comments",
    description="Comments oldest first.",
    operation_id="opslogGetEntry",
    responses=READ_ERRORS,
)
async def get_entry(*, session: SessionDep, org: OpsLogReader, entry_id: str) -> Any:
    view, comments = await service.get_entry(
        session,
        organisation_id=org.organisation_id,
        entry_id=entry_id,
        can_read_private=await _can_private(session, org),
    )
    return OpsLogEntryDetail(
        **(await _entries(session, org, [view]))[0].model_dump(),
        comments=[_comment(c) for c in comments],
        attachments=[
            OpsLogAttachmentPublic.model_validate(a, from_attributes=True)
            for a in await attachments.for_entry(session, view.entry.id)
        ],
    )


@router.patch(
    "/org/entries/{entry_id}",
    response_model=OpsLogEntryPublic,
    summary="Edit your log entry",
    description=(
        "Only in an `open` log, only by the author, and only inside the log's edit "
        "window. Automatic entries cannot be edited. Every change is kept in the "
        "organisation's history with the earlier text."
    ),
    operation_id="opslogUpdateEntry",
    responses=WRITE_ERRORS,
)
async def update_entry(
    *,
    session: SessionDep,
    org: OpsLogWriter,
    entry_id: str,
    payload: OpsLogEntryUpdate,
) -> Any:
    view = await service.update_entry(
        session,
        organisation_id=org.organisation_id,
        entry_id=entry_id,
        editor=org.user,
        can_read_private=await _can_private(session, org),
        payload=payload,
    )
    await session.commit()
    [public] = await _entries(session, org, [view])
    return public


@router.post(
    "/org/entries/{entry_id}/comments",
    response_model=OpsLogCommentPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add an update to a log entry",
    description="Comments are never changed or removed. Locked logs refuse them.",
    operation_id="opslogCreateComment",
    responses=WRITE_ERRORS,
)
async def create_comment(
    *,
    session: SessionDep,
    org: OpsLogWriter,
    entry_id: str,
    payload: OpsLogCommentCreate,
) -> Any:
    view = await service.add_comment(
        session,
        organisation_id=org.organisation_id,
        entry_id=entry_id,
        author=org.user,
        can_read_private=await _can_private(session, org),
        text=payload.text,
    )
    await session.commit()
    return _comment(view)


@router.post(
    "/org/entries/{entry_id}/attachments",
    response_model=OpsLogAttachmentPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Add a photo to a log entry",
    description=(
        "Upload first with `POST /storage/uploads` (app `opslog`, purpose "
        "`opslog-photo`; private, metadata stripped), then attach its id. At most "
        "20 per entry; never changed or removed. Locked and archived logs refuse."
    ),
    operation_id="opslogCreateAttachment",
    responses=WRITE_ERRORS,
)
async def create_attachment(
    *,
    session: SessionDep,
    org: OpsLogWriter,
    entry_id: str,
    payload: OpsLogAttachmentCreate,
) -> Any:
    attachment = await attachments.add_attachment(
        session,
        organisation_id=org.organisation_id,
        entry_id=entry_id,
        author=org.user,
        can_read_private=await _can_private(session, org),
        file_id=payload.file_id,
        caption=payload.caption,
    )
    await session.commit()
    return OpsLogAttachmentPublic.model_validate(attachment, from_attributes=True)


@router.get(
    "/org/logs/{log_id}/summary-subscription",
    response_model=OpsLogSummarySubscription,
    summary="Whether I get this log's daily summary",
    description="The daily summary goes out once a day by bell and email.",
    operation_id="opslogGetSummarySubscription",
    responses=READ_ERRORS,
)
async def get_summary_subscription(
    *, session: SessionDep, org: OpsLogReader, log_id: str
) -> Any:
    log = await service.get_log(
        session, organisation_id=org.organisation_id, log_id=log_id
    )
    return OpsLogSummarySubscription(
        subscribed=await summary.is_subscribed(
            session, log_id=log.id, user_id=org.user.id
        )
    )


@router.put(
    "/org/logs/{log_id}/summary-subscription",
    response_model=OpsLogSummarySubscription,
    summary="Start or stop my daily summary of this log",
    description=(
        "Once a day you are told how many entries were written in the last 24 "
        "hours, the busiest categories and the latest lines. Private entries are "
        "never included."
    ),
    operation_id="opslogSetSummarySubscription",
    responses=WRITE_ERRORS,
)
async def set_summary_subscription(
    *,
    session: SessionDep,
    org: OpsLogReader,
    log_id: str,
    payload: OpsLogSummarySubscription,
) -> Any:
    subscribed = await summary.set_subscribed(
        session,
        organisation_id=org.organisation_id,
        log_id=log_id,
        user_id=org.user.id,
        subscribed=payload.subscribed,
    )
    await session.commit()
    return OpsLogSummarySubscription(subscribed=subscribed)
