import logging
import uuid
from collections.abc import Collection, Iterable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from sqlalchemy import func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.auth import policy as auth_policy
from src.auth.models import Role, RoleAssignmentScope, User, UserRoleAssignment
from src.exceptions import AppException, NotFoundError
from src.pagination import PaginatedResponse
from src.utils import email_hash as email_hash_util
from src.utils.datetime import utc_now
from src.utils.email_hash import hash_email

from . import events
from .config import notification_settings
from .models import (
    DeliveryStatus,
    EmailSuppression,
    Notification,
    NotificationDelivery,
    NotificationOccurrence,
    NotificationPreference,
    NotificationSetting,
    NotificationSnooze,
    OutboundEmail,
    OutboundEmailStatus,
    SuppressionReason,
)
from .schemas import (
    NotificationParams,
    NotificationPreferencePublic,
    NotificationPreferenceUpdate,
    NotificationPublic,
    NotificationSettingPublic,
    NotificationSettingsPublic,
    NotificationSettingUpdate,
    NotificationSnoozeCreate,
    NotificationSnoozePublic,
    UnreachableRecipientPublic,
    UnreadCountPublic,
)

logger = logging.getLogger(__name__)

MANAGE_PERMISSION = "notifications.manage"

# Outbox topic that sends one ``OutboundEmail`` row (payload: its id only).
EMAIL_DELIVER = "email.deliver"


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
    department_ids: Collection[str] = (),
) -> set[uuid.UUID]:
    """Active holders of any of ``role_names`` whose grant covers the department.

    An ALL-scope grant covers the whole organisation; a DEPARTMENT grant only its
    department (``department_id``, or any of ``department_ids`` for an audience
    spread over several departments). SELF grants never make someone a recipient
    for other people.
    """
    names = list(role_names)
    if not names or organisation_id is None:
        return set()
    now = utc_now()
    scope = UserRoleAssignment.scope == RoleAssignmentScope.ALL
    covered = {*department_ids, *([department_id] if department_id else [])}
    if covered:
        scope = scope | (
            (UserRoleAssignment.scope == RoleAssignmentScope.DEPARTMENT)
            & UserRoleAssignment.department_id.in_(covered)
        )
    result = await session.execute(
        select(UserRoleAssignment)
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
    grants = list(result.scalars().all())
    live_ids = {
        user_id: {
            assignment.id
            for assignment in await auth_policy._active_assignments(
                session=session, user_id=user_id
            )
        }
        for user_id in {grant.user_id for grant in grants}
    }
    return {grant.user_id for grant in grants if grant.id in live_ids[grant.user_id]}


async def is_snoozed(
    session: AsyncSession,
    organisation_id: str | None,
    event_key: str,
    entity_type: str | None,
    entity_id: str | None,
) -> bool:
    """True while a snooze covers this event for the organisation.

    A snooze with no entity covers the whole event; one with an entity covers
    only that entity.
    """
    statement = select(NotificationSnooze.id).where(
        NotificationSnooze.event_key == event_key,
        NotificationSnooze.until > utc_now(),
        NotificationSnooze.organisation_id.is_(None)
        if organisation_id is None
        else (
            NotificationSnooze.organisation_id.is_(None)
            | (NotificationSnooze.organisation_id == organisation_id)
        ),
        (NotificationSnooze.entity_id.is_(None))
        | (
            (NotificationSnooze.entity_type == entity_type)
            & (NotificationSnooze.entity_id == entity_id)
        ),
    )
    return (await session.execute(statement.limit(1))).first() is not None


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
    suppress_within: timedelta | None = None,
    exclude: Iterable[uuid.UUID] = (),
    group_key: str | None = None,
) -> int:
    """Queue ``event_key`` for ``recipients`` plus the event's configured roles.

    Adds rows to the caller's transaction and never sends anything itself. The
    person who caused the event is normally in ``exclude``. With ``dedupe_key``
    each recipient is told at most once for that key. With ``suppress_within``
    a recipient already told about the same event and entity inside that window
    is skipped, and an active snooze for the event (or entity) silences it.
    A grouped event folds into the recipient's unread notification of the same
    ``group_key`` (count up, newest text, no second email). Each person's bell
    and email choice applies; an urgent event always reaches the bell.
    Returns how many people were notified.
    """
    event = events.get(event_key)
    setting = await effective_setting(session, organisation_id, event_key)
    if not setting.enabled:
        return 0
    if await is_snoozed(session, organisation_id, event_key, entity_type, entity_id):
        logger.info(
            "Notification snoozed",
            extra={"event_key": event_key, "entity_id": entity_id},
        )
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
        seen_column = (
            NotificationOccurrence.dedupe_key
            if event.grouped
            else Notification.dedupe_key
        )
        sent = set(
            (
                await session.execute(
                    select(seen_column).where(seen_column.in_(keys.values()))
                )
            )
            .scalars()
            .all()
        )
        active = {user_id for user_id in active if keys[user_id] not in sent}
    if suppress_within is not None and active:
        recent = select(Notification.recipient_user_id).where(
            Notification.recipient_user_id.in_(active),
            Notification.event_key == event_key,
            Notification.created_at >= utc_now() - suppress_within,
        )
        recent = recent.where(
            Notification.entity_type.is_(None)
            if entity_type is None
            else Notification.entity_type == entity_type,
            Notification.entity_id.is_(None)
            if entity_id is None
            else Notification.entity_id == entity_id,
        )
        active -= set((await session.execute(recent)).scalars().all())
    if not active:
        return 0
    choices = {
        row.user_id: row
        for row in (
            await session.execute(
                select(NotificationPreference).where(
                    NotificationPreference.user_id.in_(active),
                    NotificationPreference.event_key == event_key,
                )
            )
        ).scalars()
    }
    title = events.render(setting.title, context)[:200]
    body = events.render(setting.body, context)[:1000]
    folded: dict[uuid.UUID, Notification] = {}
    if event.grouped:
        open_rows = (
            await session.execute(
                select(Notification).where(
                    Notification.recipient_user_id.in_(active),
                    Notification.event_key == event_key,
                    Notification.read_at.is_(None),
                    # A hidden (bell-off) row is never read, so folding into it
                    # would silence every later email: those recipients get a
                    # fresh row and an email each time.
                    Notification.in_bell.is_(True),
                    Notification.group_key.is_(None)
                    if group_key is None
                    else Notification.group_key == group_key,
                )
            )
        ).scalars()
        for row in open_rows:
            folded.setdefault(row.recipient_user_id, row)
    refresh: list[Notification] = []
    deliveries: list[NotificationDelivery] = []
    occurrences: list[tuple[str, uuid.UUID | None]] = []
    queued = 0
    now = utc_now()
    for user_id in active:
        choice = choices.get(user_id)
        wants_email = (
            choice.email_enabled if choice is not None else event.default_email
        ) or not event.email_mutable
        in_bell = event.urgent or (
            choice.bell_enabled if choice is not None else event.default_bell
        )
        email = setting.email_enabled and wants_email
        if not in_bell and not email:
            # Both channels off: nothing to show or send, but remember the item so
            # turning a channel back on does not re-announce it.
            if event.grouped and keys.get(user_id):
                occurrences.append((keys[user_id], None))
            continue
        queued += 1
        existing = folded.get(user_id)
        if existing is not None:
            # SQL expression: concurrent folds each add one instead of
            # overwriting each other's count.
            existing.repeat_count = Notification.repeat_count + 1
            refresh.append(existing)
            existing.title, existing.body = title, body
            existing.link_path = link_path
            existing.entity_type, existing.entity_id = entity_type, entity_id
            existing.created_at = now
            existing.in_bell = existing.in_bell or in_bell
            if keys.get(user_id):
                occurrences.append((keys[user_id], existing.id))
            continue
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
            dedupe_key=None if event.grouped else keys.get(user_id),
            in_bell=in_bell,
            group_key=group_key if event.grouped else None,
        )
        session.add(notification)
        if event.grouped and keys.get(user_id):
            occurrences.append((keys[user_id], notification.id))
        if email:
            deliveries.append(
                NotificationDelivery(
                    notification_id=notification.id,
                    status=DeliveryStatus.PENDING.value,
                )
            )
    # No ORM relationship orders the inserts, so land parents before the outbox.
    await session.flush()
    for row in refresh:
        await session.refresh(row, ["repeat_count"])
    session.add_all(deliveries)
    session.add_all(
        NotificationOccurrence(dedupe_key=key, notification_id=notification_id)
        for key, notification_id in occurrences
    )
    logger.info(
        "Notification queued",
        extra={"event_key": event_key, "recipients": queued},
    )
    return queued


# ── Inbox ─────────────────────────────────────────────────────────────────────


async def list_inbox(
    *,
    session: AsyncSession,
    user: User,
    unread_only: bool = False,
    page: int = 1,
    size: int = 20,
) -> PaginatedResponse[NotificationPublic]:
    statement = select(Notification).where(
        Notification.recipient_user_id == user.id, Notification.in_bell.is_(True)
    )
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
        data=[_public(row) for row in rows],
        count=total or 0,
        page=page,
        size=size,
    )


def _public(row: Notification) -> NotificationPublic:
    try:
        urgent = events.get(row.event_key).urgent
    except KeyError:
        urgent = False
    return NotificationPublic.model_validate(row, from_attributes=True).model_copy(
        update={"urgent": urgent}
    )


async def unread_count(*, session: AsyncSession, user: User) -> UnreadCountPublic:
    count = await session.scalar(
        select(func.count()).where(
            Notification.recipient_user_id == user.id,
            Notification.in_bell.is_(True),
            Notification.read_at.is_(None),
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
    chosen = {row.event_key: row for row in rows}
    return [
        _preference_public(event, chosen.get(event.key))
        for event in events.all_events()
    ]


def _preference_public(
    event: events.EventDef, row: NotificationPreference | None
) -> NotificationPreferencePublic:
    email = row.email_enabled if row is not None else event.default_email
    bell = row.bell_enabled if row is not None else event.default_bell
    return NotificationPreferencePublic(
        event_key=event.key,
        label=event.label,
        description=event.description,
        email_mutable=event.email_mutable,
        email_enabled=email or not event.email_mutable,
        bell_mutable=not event.urgent,
        bell_enabled=bell or event.urgent,
        urgent=event.urgent,
    )


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
        if item.email_enabled is False and not event.email_mutable:
            raise AppException(f"'{event.label}' emails cannot be turned off", 400)
        if item.bell_enabled is False and event.urgent:
            raise AppException(
                f"'{event.label}' is urgent and always appears in the bell", 400
            )
        row = await session.get(NotificationPreference, (user.id, item.event_key))
        if row is None:
            row = NotificationPreference(
                user_id=user.id,
                event_key=item.event_key,
                email_enabled=event.default_email,
                bell_enabled=event.default_bell,
            )
            session.add(row)
        if item.email_enabled is not None:
            row.email_enabled = item.email_enabled
        if item.bell_enabled is not None:
            row.bell_enabled = item.bell_enabled
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


async def count_stalled_deliveries(
    session: AsyncSession, *, older_than: timedelta
) -> int:
    """Emails that are due but still unsent: the outbox worker is not draining."""
    now = utc_now()
    return (
        await session.scalar(
            select(func.count())
            .select_from(NotificationDelivery)
            .where(
                NotificationDelivery.status == DeliveryStatus.PENDING.value,
                NotificationDelivery.created_at < now - older_than,
                (NotificationDelivery.next_retry_at.is_(None))
                | (NotificationDelivery.next_retry_at <= now),
            )
        )
        or 0
    )


# ── Snoozes ───────────────────────────────────────────────────────────────────


async def create_snooze(
    *,
    session: AsyncSession,
    actor: User,
    organisation_id: str | None,
    payload: NotificationSnoozeCreate,
) -> NotificationSnoozePublic:
    organisation_id = await _require_manage(session, actor, organisation_id)
    try:
        events.get(payload.event_key)
    except KeyError:
        raise NotFoundError("Unknown notification") from None
    if (payload.entity_type is None) != (payload.entity_id is None):
        raise AppException("Give both entity type and entity id, or neither", 400)
    if payload.until <= utc_now():
        raise AppException("A snooze must end in the future", 400)
    row = NotificationSnooze(
        organisation_id=organisation_id,
        event_key=payload.event_key,
        entity_type=payload.entity_type,
        entity_id=payload.entity_id,
        until=payload.until,
        reason=payload.reason,
        created_by_user_id=actor.id,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return NotificationSnoozePublic.model_validate(row, from_attributes=True)


async def list_snoozes(
    *, session: AsyncSession, actor: User, organisation_id: str | None
) -> list[NotificationSnoozePublic]:
    """Active snoozes for the organisation, soonest to end first."""
    organisation_id = await _require_manage(session, actor, organisation_id)
    rows = (
        (
            await session.execute(
                select(NotificationSnooze)
                .where(
                    NotificationSnooze.organisation_id == organisation_id,
                    NotificationSnooze.until > utc_now(),
                )
                .order_by(NotificationSnooze.until)
            )
        )
        .scalars()
        .all()
    )
    return [
        NotificationSnoozePublic.model_validate(row, from_attributes=True)
        for row in rows
    ]


async def delete_snooze(
    *,
    session: AsyncSession,
    actor: User,
    organisation_id: str | None,
    snooze_id: uuid.UUID,
) -> None:
    organisation_id = await _require_manage(session, actor, organisation_id)
    row = await session.scalar(
        select(NotificationSnooze).where(
            NotificationSnooze.id == snooze_id,
            NotificationSnooze.organisation_id == organisation_id,
        )
    )
    if row is None:
        raise NotFoundError("Snooze not found")
    await session.delete(row)
    await session.commit()


# ── Suppression list and public-flow outbox ──────────────────────────────────


def normalise_email(email: str) -> str:
    return email_hash_util.normalise_email(email)


async def suppress_email(
    *,
    session: AsyncSession,
    email: str,
    reason: SuppressionReason,
    source_event_id: str | None,
) -> bool:
    """Add an address to the suppression list. Returns False if already listed.

    Only the keyed hash of the address is stored. Idempotent: the unique hash
    makes a replayed webhook a no-op. A legacy row that still holds the
    plaintext address gets its hash filled in. The caller commits.
    """
    clean = normalise_email(email)
    address_hash = hash_email(clean)
    legacy = await session.scalar(
        select(EmailSuppression).where(
            EmailSuppression.email == clean, EmailSuppression.email_hash.is_(None)
        )
    )
    if legacy is not None:
        legacy.email_hash = address_hash
        return False
    result = await session.execute(
        pg_insert(EmailSuppression)
        .values(
            id=uuid.uuid4(),
            email=None,
            email_hash=address_hash,
            reason=reason.value,
            source_event_id=source_event_id,
            created_at=utc_now(),
        )
        .on_conflict_do_nothing(index_elements=["email_hash"])
    )
    return bool(getattr(result, "rowcount", 0))


async def is_suppressed(*, session: AsyncSession, email: str) -> bool:
    """True when the address is suppressed (hash match, or a legacy plaintext row)."""
    clean = normalise_email(email)
    found = await session.scalar(
        select(EmailSuppression.id).where(
            or_(
                EmailSuppression.email_hash == hash_email(clean),
                EmailSuppression.email == clean,
            )
        )
    )
    return found is not None


def _queue_delivery(
    session: AsyncSession, email_id: uuid.UUID, *, run_at: datetime | None = None
) -> None:
    """Add the outbox row that sends ``email_id``; the payload holds no personal data.

    ``run_at`` paces a batch: the row is not due before that time."""
    now = utc_now()
    session.add(
        outbox.Outbox(
            id=uuid.uuid4(),
            topic=EMAIL_DELIVER,
            payload={"outbound_email_id": str(email_id)},
            dedupe_key=str(email_id),
            attempts=0,
            next_attempt_at=run_at or now,
            status=outbox.OutboxStatus.PENDING.value,
            created_at=now,
            updated_at=now,
        )
    )


def enqueue_email(
    *,
    session: AsyncSession,
    to_email: str,
    subject: str,
    transactional: bool,
    template: str | None = None,
    props: dict[str, Any] | None = None,
    html: str | None = None,
) -> OutboundEmail:
    """Queue an email for the worker, inside the caller's transaction.

    The ``OutboundEmail`` row holds the content and is the delivery log; an
    ``email.deliver`` outbox row (same transaction) sends it and owns retry and
    backoff. Non-transactional mail is dropped at send time for suppressed
    addresses.
    """
    row = OutboundEmail(
        id=uuid.uuid4(),
        to_email=normalise_email(to_email),
        subject=subject[:300],
        template=template,
        props=props or {},
        html=html,
        transactional=transactional,
    )
    session.add(row)
    _queue_delivery(session, row.id)
    return row


async def enqueue_email_once(
    *,
    session: AsyncSession,
    to_email: str,
    subject: str,
    dedupe_key: str,
    template: str,
    props: dict[str, Any],
    run_at: datetime | None = None,
) -> bool:
    """Queue a non-transactional email unless ``dedupe_key`` was already queued.

    Returns True when a new row was written. Suppressed addresses are skipped
    here and again at send time. ``run_at`` delays the send (batch pacing). The
    caller commits. The unique ``outbound_email.dedupe_key`` index decides, so rows
    queued before the outbox move (still draining through
    ``dispatch.process_outbound_emails``) count too.
    """
    email = normalise_email(to_email)
    if await is_suppressed(session=session, email=email):
        return False
    email_id = uuid.uuid4()
    result = await session.execute(
        pg_insert(OutboundEmail)
        .values(
            id=email_id,
            to_email=email,
            subject=subject[:300],
            template=template,
            props=props,
            transactional=False,
            dedupe_key=dedupe_key[:200],
            status=OutboundEmailStatus.PENDING.value,
            attempts=0,
            created_at=utc_now(),
        )
        .on_conflict_do_nothing(
            index_elements=["dedupe_key"],
            index_where=OutboundEmail.dedupe_key.is_not(None),
        )
    )
    if not getattr(result, "rowcount", 0):
        return False
    _queue_delivery(session, email_id, run_at=run_at)
    return True
