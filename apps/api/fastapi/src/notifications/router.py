import uuid
from typing import Any

from fastapi import APIRouter

from src.dependencies import CurrentUser, SessionDep
from src.pagination import PaginatedResponse, PaginationDep

from . import service
from .schemas import (
    NotificationPreferencePublic,
    NotificationPreferenceUpdate,
    NotificationPublic,
    NotificationSettingPublic,
    NotificationSettingsPublic,
    NotificationSettingUpdate,
    NotificationSnoozeCreate,
    NotificationSnoozePublic,
    UnreadCountPublic,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get(
    "",
    response_model=PaginatedResponse[NotificationPublic],
    status_code=200,
    summary="Read my notifications",
    description="The signed-in person's in-app notifications, newest first.",
    responses={401: {"description": "Not signed in"}},
)
async def read_notifications(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    pagination: PaginationDep,
    unread: bool = False,
) -> Any:
    return await service.list_inbox(
        session=session,
        user=current_user,
        unread_only=unread,
        page=pagination.page,
        size=pagination.size,
    )


@router.get(
    "/unread-count",
    response_model=UnreadCountPublic,
    status_code=200,
    summary="Count my unread notifications",
    description="Unread in-app notifications for the header badge.",
    responses={401: {"description": "Not signed in"}},
)
async def read_unread_count(*, session: SessionDep, current_user: CurrentUser) -> Any:
    return await service.unread_count(session=session, user=current_user)


@router.post(
    "/{notification_id}/read",
    response_model=NotificationPublic,
    status_code=200,
    summary="Mark a notification read",
    description="Marks one of the signed-in person's notifications as read.",
    responses={404: {"description": "Notification not found"}},
)
async def mark_notification_read(
    *, session: SessionDep, current_user: CurrentUser, notification_id: uuid.UUID
) -> Any:
    return await service.mark_read(
        session=session, user=current_user, notification_id=notification_id
    )


@router.post(
    "/read-all",
    response_model=UnreadCountPublic,
    status_code=200,
    summary="Mark all notifications read",
    description="Marks every unread notification of the signed-in person as read.",
    responses={401: {"description": "Not signed in"}},
)
async def mark_all_notifications_read(
    *, session: SessionDep, current_user: CurrentUser
) -> Any:
    return await service.mark_all_read(session=session, user=current_user)


@router.get(
    "/preferences",
    response_model=list[NotificationPreferencePublic],
    status_code=200,
    summary="Read my bell and email preferences",
    description="Per notification: whether the signed-in person gets it in the bell and by email. Urgent notifications always appear in the bell.",
    responses={401: {"description": "Not signed in"}},
)
async def read_notification_preferences(
    *, session: SessionDep, current_user: CurrentUser
) -> Any:
    return await service.list_preferences(session=session, user=current_user)


@router.put(
    "/preferences",
    response_model=list[NotificationPreferencePublic],
    status_code=200,
    summary="Update my bell and email preferences",
    description="Turn the bell and email on or off per notification (leave a channel out to keep it). Urgent notifications always appear in the bell; approval requests cannot be muted by email.",
    responses={
        400: {
            "description": "Unknown notification, or an urgent or approval one that cannot be turned off"
        }
    },
)
async def update_notification_preferences(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: list[NotificationPreferenceUpdate],
) -> Any:
    return await service.update_preferences(
        session=session, user=current_user, payload=payload
    )


@router.get(
    "/settings",
    response_model=NotificationSettingsPublic,
    status_code=200,
    summary="Read organisation notification settings",
    description="Every notification with its effective settings for the organisation. Requires notifications.manage.",
    responses={403: {"description": "Insufficient scope for this organisation"}},
)
async def read_notification_settings(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    organisation_id: str | None = None,
) -> Any:
    return await service.read_settings(
        session=session, actor=current_user, organisation_id=organisation_id
    )


@router.put(
    "/settings/{event_key}",
    response_model=NotificationSettingPublic,
    status_code=200,
    summary="Update an organisation notification setting",
    description="Turn a notification on or off, choose extra recipient roles, edit its wording and timings. Requires notifications.manage.",
    responses={
        400: {"description": "Invalid template, role or timing"},
        403: {"description": "Insufficient scope for this organisation"},
        404: {"description": "Unknown notification"},
    },
)
async def update_notification_setting(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    event_key: str,
    payload: NotificationSettingUpdate,
    organisation_id: str | None = None,
) -> Any:
    return await service.update_setting(
        session=session,
        actor=current_user,
        organisation_id=organisation_id,
        event_key=event_key,
        payload=payload,
    )


@router.get(
    "/snoozes",
    response_model=list[NotificationSnoozePublic],
    status_code=200,
    summary="List active notification snoozes",
    description="Notifications currently silenced for the organisation. Requires notifications.manage.",
    responses={403: {"description": "Insufficient scope for this organisation"}},
)
async def read_notification_snoozes(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    organisation_id: str | None = None,
) -> Any:
    return await service.list_snoozes(
        session=session, actor=current_user, organisation_id=organisation_id
    )


@router.post(
    "/snoozes",
    response_model=NotificationSnoozePublic,
    status_code=201,
    summary="Snooze a notification",
    description="Silence a notification, or one entity of it, until a set time, e.g. during planned work. Requires notifications.manage.",
    responses={
        400: {"description": "Snooze must end in the future, or entity is incomplete"},
        403: {"description": "Insufficient scope for this organisation"},
        404: {"description": "Unknown notification"},
    },
)
async def create_notification_snooze(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    payload: NotificationSnoozeCreate,
    organisation_id: str | None = None,
) -> Any:
    return await service.create_snooze(
        session=session,
        actor=current_user,
        organisation_id=organisation_id,
        payload=payload,
    )


@router.delete(
    "/snoozes/{snooze_id}",
    status_code=204,
    summary="End a notification snooze",
    description="Removes a snooze so the notification resumes. Requires notifications.manage.",
    responses={
        403: {"description": "Insufficient scope for this organisation"},
        404: {"description": "Snooze not found"},
    },
)
async def delete_notification_snooze(
    *,
    session: SessionDep,
    current_user: CurrentUser,
    snooze_id: uuid.UUID,
    organisation_id: str | None = None,
) -> None:
    await service.delete_snooze(
        session=session,
        actor=current_user,
        organisation_id=organisation_id,
        snooze_id=snooze_id,
    )
