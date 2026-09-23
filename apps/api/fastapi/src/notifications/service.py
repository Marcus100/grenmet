import logging
import uuid
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import Role, RoleAssignmentScope, User, UserRoleAssignment
from src.exceptions import AppException, NotFoundError
from src.pagination import PaginatedResponse
from src.utils.datetime import utc_now

from . import events
from .config import notification_settings
from .models import (
    DeliveryStatus,
    Notification,
    NotificationDelivery,
    NotificationPreference,
    NotificationSetting,
)
from .schemas import (
    NotificationParams,
    NotificationPreferencePublic,
    NotificationPreferenceUpdate,
    NotificationPublic,
    NotificationSettingPublic,
    NotificationSettingsPublic,
    NotificationSettingUpdate,
    UnreachableRecipientPublic,
    UnreadCountPublic,
)

logger = logging.getLogger(__name__)

MANAGE_PERMISSION = "notifications.manage"


@dataclass(frozen=True)
class EffectiveSetting:
    enabled: bool
    email_enabled: bool
    roles: tuple[str, ...]
    title: str
    body: str
    params: dict[str, Any]


def _effective(
    event: events.EventDef, row: NotificationSetting | None
) -> EffectiveSetting:
    if row is None:
        return EffectiveSetting(
            enabled=True,
            email_enabled=True,
            roles=event.default_roles,
            title=event.title,
            body=event.body,
            params=dict(event.default_params),
        )
    return EffectiveSetting(
        enabled=row.enabled,
        email_enabled=row.email_enabled,
        roles=tuple(row.recipient_roles),
        title=row.title_template or event.title,
        body=row.body_template or event.body,
        params={**event.default_params, **(row.params or {})},
    )


async def effective_setting(
    session: AsyncSession, organisation_id: str | None, event_key: str
) -> EffectiveSetting:
    event = events.get(event_key)
    row = None
    if organisation_id:
        row = await session.scalar(
            select(NotificationSetting).where(
                NotificationSetting.organisation_id == organisation_id,
                NotificationSetting.event_key == event_key,
            )
        )
    return _effective(event, row)


async def users_with_roles(
    session: AsyncSession,
    role_names: Iterable[str],
    *,
    organisation_id: str | None,
    department_id: str | None = None,
) -> set[uuid.UUID]:
    """Active holders of any of ``role_names`` whose grant covers the department.

    An ALL-scope grant covers the whole organisation; a DEPARTMENT grant only its
    department. SELF grants never make someone a recipient for other people.
    """
    names = list(role_names)
    if not names or organisation_id is None:
        return set()
    now = utc_now()
    scope = UserRoleAssignment.scope == RoleAssignmentScope.ALL
    if department_id:
        scope = scope | (
            (UserRoleAssignment.scope == RoleAssignmentScope.DEPARTMENT)
            & (UserRoleAssignment.department_id == department_id)
        )
    result = await session.execute(
        select(UserRoleAssignment.user_id)
        .join(Role, Role.id == UserRoleAssignment.role_id)
        .join(User, User.id == UserRoleAssignment.user_id)
        .where(
            Role.name.in_(names),
            UserRoleAssignment.organisation_id == organisation_id,
            UserRoleAssignment.effective_from <= now,
            UserRoleAssignment.effective_to.is_(None)
            | (UserRoleAssignment.effective_to > now),
            scope,
            User.is_active.is_(True),
        )
    )
    return set(result.scalars().all())


async def notify(
    session: AsyncSession,
    *,
    event_key: str,
    organisation_id: str | None,
    recipients: Iterable[uuid.UUID],
    context: dict[str, Any],
    link_path: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
    department_id: str | None = None,
    dedupe_key: str | None = None,
    exclude: Iterable[uuid.UUID] = (),
) -> int:
    """Queue ``event_key`` for ``recipients`` plus the event's configured roles.

    Adds rows to the caller's transaction and never sends anything itself. The
    person who caused the event is normally in ``exclude``. With ``dedupe_key``
    each recipient is told at most once for that key. Returns how many people
    were notified.
    """
    event = events.get(event_key)
    setting = await effective_setting(session, organisation_id, event_key)
    if not setting.enabled:
        return 0
    targets = set(recipients) | await users_with_roles(
        session,
        setting.roles,
        organisation_id=organisation_id,
        department_id=department_id,
    )
    targets -= set(exclude)
    if not targets:
        return 0
    active = set(
        (
            await session.execute(
                select(User.id).where(User.id.in_(targets), User.is_active.is_(True))
            )
        )
        .scalars()
        .all()
    )
    keys = (
        {user_id: f"{dedupe_key}:{user_id}" for user_id in active} if dedupe_key else {}
    )
    if keys:
        sent = set(
            (
                await session.execute(
                    select(Notification.dedupe_key).where(
                        Notification.dedupe_key.in_(keys.values())
                    )
                )
            )
            .scalars()
            .all()
        )
        active = {user_id for user_id in active if keys[user_id] not in sent}
    if not active:
        return 0
    muted = set(
        (
            await session.execute(
                select(NotificationPreference.user_id).where(
                    NotificationPreference.user_id.in_(active),
                    NotificationPreference.event_key == event_key,
                    NotificationPreference.email_enabled.is_(False),
                )
            )
        )
        .scalars()
        .all()
    )
    title = events.render(setting.title, context)[:200]
    body = events.render(setting.body, context)[:1000]
    deliveries: list[NotificationDelivery] = []
    for user_id in active:
        notification = Notification(
            id=uuid.uuid4(),
            recipient_user_id=user_id,
            event_key=event_key,
            organisation_id=organisation_id,
            title=title,
            body=body,
            link_path=link_path,
            entity_type=entity_type,
            entity_id=entity_id,
            dedupe_key=keys.get(user_id),
        )
        session.add(notification)
        wants_email = user_id not in muted or not event.email_mutable
        if setting.email_enabled and wants_email:
            deliveries.append(
                NotificationDelivery(
                    notification_id=notification.id,
                    status=DeliveryStatus.PENDING.value,
                )
            )
    # No ORM relationship orders the inserts, so land parents before the outbox.
    await session.flush()
    session.add_all(deliveries)
    logger.info(
        "Notification queued",
        extra={"event_key": event_key, "recipients": len(active)},
    )
    return len(active)


# ── Inbox ─────────────────────────────────────────────────────────────────────


async def list_inbox(
    *,
    session: AsyncSession,
    user: User,
    unread_only: bool = False,
    page: int = 1,
    size: int = 20,
) -> PaginatedResponse[NotificationPublic]:
    statement = select(Notification).where(Notification.recipient_user_id == user.id)
    if unread_only:
        statement = statement.where(Notification.read_at.is_(None))
    total = await session.scalar(select(func.count()).select_from(statement.subquery()))
    rows = (
        await session.execute(
            statement.order_by(Notification.created_at.desc(), Notification.id)
            .offset((page - 1) * size)
            .limit(size)
        )
    ).scalars()
    return PaginatedResponse(
        data=[
            NotificationPublic.model_validate(row, from_attributes=True) for row in rows
        ],
        count=total or 0,
        page=page,
        size=size,
    )


async def unread_count(*, session: AsyncSession, user: User) -> UnreadCountPublic:
    count = await session.scalar(
        select(func.count()).where(
            Notification.recipient_user_id == user.id, Notification.read_at.is_(None)
        )
    )
    return UnreadCountPublic(count=count or 0)


async def mark_read(
    *, session: AsyncSession, user: User, notification_id: uuid.UUID
) -> Notification:
    notification = await session.get(Notification, notification_id)
    # Another person's notification is reported as missing, not forbidden.
    if notification is None or notification.recipient_user_id != user.id:
        raise NotFoundError("Notification not found")
    if notification.read_at is None:
        notification.read_at = utc_now()
        await session.commit()
        await session.refresh(notification)
    return notification


async def mark_all_read(*, session: AsyncSession, user: User) -> UnreadCountPublic:
    await session.execute(
        update(Notification)
        .where(
            Notification.recipient_user_id == user.id, Notification.read_at.is_(None)
        )
        .values(read_at=utc_now())
    )
    await session.commit()
    return UnreadCountPublic(count=0)


# ── Personal email preferences ────────────────────────────────────────────────


async def list_preferences(
    *, session: AsyncSession, user: User
) -> list[NotificationPreferencePublic]:
    rows = (
        await session.execute(
            select(NotificationPreference).where(
                NotificationPreference.user_id == user.id
            )
        )
    ).scalars()
    chosen = {row.event_key: row.email_enabled for row in rows}
    return [
        NotificationPreferencePublic(
            event_key=event.key,
            label=event.label,
            description=event.description,
            email_mutable=event.email_mutable,
            email_enabled=chosen.get(event.key, True) or not event.email_mutable,
        )
        for event in events.all_events()
    ]


async def update_preferences(
    *,
    session: AsyncSession,
    user: User,
    payload: list[NotificationPreferenceUpdate],
) -> list[NotificationPreferencePublic]:
    for item in payload:
        try:
            event = events.get(item.event_key)
        except KeyError:
            raise AppException(
                f"Unknown notification '{item.event_key}'", 400
            ) from None
        if not item.email_enabled and not event.email_mutable:
            raise AppException(f"'{event.label}' emails cannot be turned off", 400)
        row = await session.get(NotificationPreference, (user.id, item.event_key))
        if row is None:
            row = NotificationPreference(user_id=user.id, event_key=item.event_key)
            session.add(row)
        row.email_enabled = item.email_enabled
        row.updated_at = utc_now()
    await session.commit()
    return await list_preferences(session=session, user=user)


# ── Organisation settings (HR Setup) ──────────────────────────────────────────


async def _require_manage(
    session: AsyncSession, actor: User, organisation_id: str | None
) -> str:
    from src.hr import organisations

    organisation_id = await organisations.resolve_organisation(
        session, actor, organisation_id
    )
    await organisations.require_organisation_permission(
        session, actor, organisation_id, MANAGE_PERMISSION
    )
    return organisation_id


async def _unreachable(
    session: AsyncSession, organisation_id: str
) -> list[UnreachableRecipientPublic]:
    from src.hr.models import EmploymentRecord

    if not notification_settings.allowed_domains:
        return []
    rows = await session.execute(
        select(User)
        .join(EmploymentRecord, EmploymentRecord.user_id == User.id)
        .where(
            EmploymentRecord.organisation_id == organisation_id,
            User.is_active.is_(True),
        )
        .order_by(User.email)
    )
    return [
        UnreachableRecipientPublic(
            user_id=user.id, name=user.full_name, email=user.email
        )
        for user in rows.scalars()
        if not notification_settings.email_allowed(user.email)
    ]


async def read_settings(
    *, session: AsyncSession, actor: User, organisation_id: str | None
) -> NotificationSettingsPublic:
    organisation_id = await _require_manage(session, actor, organisation_id)
    rows = {
        row.event_key: row
        for row in (
            await session.execute(
                select(NotificationSetting).where(
                    NotificationSetting.organisation_id == organisation_id
                )
            )
        ).scalars()
    }
    return NotificationSettingsPublic(
        organisation_id=organisation_id,
        allowed_domains=sorted(notification_settings.allowed_domains),
        events=[
            _setting_public(event, rows.get(event.key)) for event in events.all_events()
        ],
        unreachable=await _unreachable(session, organisation_id),
    )


def _setting_public(
    event: events.EventDef, row: NotificationSetting | None
) -> NotificationSettingPublic:
    effective = _effective(event, row)
    return NotificationSettingPublic(
        event_key=event.key,
        label=event.label,
        description=event.description,
        audience=event.audience,
        variables=list(event.variables),
        email_mutable=event.email_mutable,
        enabled=effective.enabled,
        email_enabled=effective.email_enabled,
        recipient_roles=list(effective.roles),
        title_template=effective.title,
        body_template=effective.body,
        default_title_template=event.title,
        default_body_template=event.body,
        params=NotificationParams(**effective.params),
        customised=row is not None,
    )


async def update_setting(
    *,
    session: AsyncSession,
    actor: User,
    organisation_id: str | None,
    event_key: str,
    payload: NotificationSettingUpdate,
) -> NotificationSettingPublic:
    organisation_id = await _require_manage(session, actor, organisation_id)
    try:
        event = events.get(event_key)
    except KeyError:
        raise NotFoundError("Unknown notification") from None
    for template in (payload.title_template, payload.body_template):
        if template:
            error = events.validate_template(template, event.variables)
            if error:
                raise AppException(error, 400)
    params = payload.params.model_dump(exclude_none=True)
    unknown = set(params) - set(event.default_params)
    if unknown:
        raise AppException(f"Unknown settings: {', '.join(sorted(unknown))}", 400)
    if any(not 1 <= day <= 365 for day in params.get("expiry_days_before", [])):
        raise AppException("Reminder days must be between 1 and 365", 400)
    known_roles = set(
        (
            await session.execute(
                select(Role.name).where(Role.name.in_(payload.recipient_roles))
            )
        )
        .scalars()
        .all()
    )
    missing = set(payload.recipient_roles) - known_roles
    if missing:
        raise AppException(f"Unknown roles: {', '.join(sorted(missing))}", 400)

    row = await session.scalar(
        select(NotificationSetting).where(
            NotificationSetting.organisation_id == organisation_id,
            NotificationSetting.event_key == event_key,
        )
    )
    if row is None:
        row = NotificationSetting(organisation_id=organisation_id, event_key=event_key)
        session.add(row)
    row.enabled = payload.enabled
    row.email_enabled = payload.email_enabled
    row.recipient_roles = sorted(set(payload.recipient_roles))
    # Saving the default text stores "no override", so later default changes apply.
    row.title_template = (
        payload.title_template if payload.title_template != event.title else None
    ) or None
    row.body_template = (
        payload.body_template if payload.body_template != event.body else None
    ) or None
    row.params = params
    row.updated_by_user_id = actor.id
    row.updated_at = utc_now()
    await session.commit()
    await session.refresh(row)
    logger.info(
        "Notification setting updated",
        extra={"event_key": event_key, "organisation_id": organisation_id},
    )
    return _setting_public(event, row)
