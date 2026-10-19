"""Double opt-in mailing-list subscriptions.

Public callers never learn whether an address is already known: ``subscribe``
returns the same acknowledgement for new, pending, confirmed, unsubscribed and
suppressed addresses. Emails go through the notifications outbox.
"""

import logging
import uuid
from datetime import UTC, datetime, timedelta
from urllib.parse import urlencode

import jwt
from jwt.exceptions import InvalidTokenError
from sqlalchemy import or_, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.config import auth_settings
from src.config import settings
from src.email_config import email_settings
from src.exceptions import AppValidationError
from src.notifications import service as notification_service
from src.utils.datetime import utc_now
from src.utils.email_hash import hash_email

from .config import subscriptions_settings
from .constants import (
    CONFIRM_PURPOSE,
    CONFIRMATION_TEMPLATE,
    MAILING_LISTS,
    UNSUBSCRIBE_PURPOSE,
)
from .models import ListSubscription, SubscriptionStatus

logger = logging.getLogger(__name__)

ACCEPTED_MESSAGE = (
    "If this address can be subscribed, we have sent a confirmation email. "
    "Follow the link in it to finish."
)

_ALGORITHM = "HS256"


# ── Tokens (stateless, signed with the app secret) ───────────────────────────


def _make_token(
    *, subscription_id: uuid.UUID, purpose: str, ttl: timedelta | None
) -> str:
    claims: dict[str, object] = {"sub": str(subscription_id), "purpose": purpose}
    if ttl is not None:
        claims["exp"] = datetime.now(UTC) + ttl
    return jwt.encode(claims, auth_settings.SECRET_KEY, algorithm=_ALGORITHM)


def _read_token(token: str, *, purpose: str) -> uuid.UUID | None:
    try:
        claims = jwt.decode(token, auth_settings.SECRET_KEY, algorithms=[_ALGORITHM])
        if claims.get("purpose") != purpose:
            return None
        return uuid.UUID(str(claims["sub"]))
    except InvalidTokenError, KeyError, ValueError:
        return None


# ── Links ────────────────────────────────────────────────────────────────────


def _api_base() -> str:
    base = (
        subscriptions_settings.SUBSCRIPTIONS_API_BASE_URL
        or (str(settings.API_BASE_URL) if settings.API_BASE_URL else None)
        or "http://localhost:8000"
    )
    return f"{base.rstrip('/')}{settings.API_V1_STR}"


def _action_link(action: str, token: str) -> str:
    return f"{_api_base()}/subscriptions/{action}?{urlencode({'token': token})}"


def _site_url(list_key: str | None) -> str:
    sites = subscriptions_settings.SUBSCRIPTIONS_SITE_URLS
    base = sites.get(list_key or "") or next(iter(sites.values()), "")
    return base.rstrip("/")


def site_url(list_key: str | None) -> str:
    """Public site origin of a list (no trailing slash); only configured origins."""
    return _site_url(list_key)


def unsubscribe_link(subscription_id: uuid.UUID) -> str:
    """Signed one-click unsubscribe link for one subscription row."""
    return _action_link(
        "unsubscribe",
        _make_token(
            subscription_id=subscription_id, purpose=UNSUBSCRIBE_PURPOSE, ttl=None
        ),
    )


def _status_url(list_key: str | None, result: str) -> str:
    return f"{_site_url(list_key)}/subscribe/status?{urlencode({'result': result})}"


# ── Subscribe ────────────────────────────────────────────────────────────────


async def subscribe(*, session: AsyncSession, list_key: str, email: str) -> None:
    """Record a pending subscription and queue the confirmation email."""
    mailing_list = MAILING_LISTS.get(list_key)
    if mailing_list is None:
        raise AppValidationError("Unknown mailing list")
    email = notification_service.normalise_email(email)

    if await notification_service.is_suppressed(session=session, email=email):
        logger.info("Subscription skipped: address suppressed")
        return

    now = utc_now()
    address_hash = hash_email(email)
    await session.execute(
        pg_insert(ListSubscription)
        .values(
            id=uuid.uuid4(),
            list_key=list_key,
            email=email,
            email_hash=address_hash,
            status=SubscriptionStatus.PENDING.value,
            requested_at=now,
            created_at=now,
            updated_at=now,
        )
        .on_conflict_do_nothing()
    )
    row = await session.scalar(
        select(ListSubscription)
        .where(
            ListSubscription.list_key == list_key,
            or_(
                ListSubscription.email_hash == address_hash,
                ListSubscription.email == email,
            ),
        )
        .with_for_update()
    )
    if row is None:  # pragma: no cover - the insert above guarantees a row
        return
    if row.email_hash is None:  # legacy row: hash it on first contact
        row.email_hash = address_hash

    if row.status == SubscriptionStatus.CONFIRMED.value:
        await session.commit()
        return
    if row.status == SubscriptionStatus.UNSUBSCRIBED.value:
        # A fresh request is fresh consent: start the double opt-in again.
        row.email = email  # plaintext was dropped on unsubscribe; needed to send
        row.status = SubscriptionStatus.PENDING.value
        row.requested_at = now
        row.confirmed_at = None
        row.last_confirmation_sent_at = None
    resend_after = timedelta(
        minutes=subscriptions_settings.SUBSCRIPTIONS_RESEND_MINUTES
    )
    if (
        row.last_confirmation_sent_at is not None
        and now - row.last_confirmation_sent_at < resend_after
    ):
        await session.commit()
        return

    confirm_ttl = timedelta(days=subscriptions_settings.SUBSCRIPTIONS_CONFIRM_TTL_DAYS)
    notification_service.enqueue_email(
        session=session,
        to_email=email,
        subject=f"Confirm your subscription to {mailing_list.name}",
        transactional=False,
        template=CONFIRMATION_TEMPLATE,
        props={
            "projectName": email_settings.PROJECT_NAME,
            "listName": mailing_list.name,
            "confirmLink": _action_link(
                "confirm",
                _make_token(
                    subscription_id=row.id, purpose=CONFIRM_PURPOSE, ttl=confirm_ttl
                ),
            ),
            "unsubscribeLink": _action_link(
                "unsubscribe",
                _make_token(
                    subscription_id=row.id, purpose=UNSUBSCRIBE_PURPOSE, ttl=None
                ),
            ),
        },
    )
    row.last_confirmation_sent_at = now
    row.updated_at = now
    await session.commit()
    logger.info("Subscription confirmation queued", extra={"list_key": list_key})


# ── Confirm / unsubscribe ────────────────────────────────────────────────────


async def confirm(*, session: AsyncSession, token: str) -> str:
    """Confirm the subscription named by the token. Returns the redirect URL."""
    subscription_id = _read_token(token, purpose=CONFIRM_PURPOSE)
    row = (
        await session.get(ListSubscription, subscription_id)
        if subscription_id
        else None
    )
    if row is None or row.status == SubscriptionStatus.UNSUBSCRIBED.value:
        return _status_url(row.list_key if row else None, "invalid")
    if row.status == SubscriptionStatus.PENDING.value:
        now = utc_now()
        row.status = SubscriptionStatus.CONFIRMED.value
        row.confirmed_at = now
        row.updated_at = now
        await session.commit()
    return _status_url(row.list_key, "confirmed")


def _mark_unsubscribed(row: ListSubscription, now: datetime) -> None:
    """Unsubscribe a row and drop its plaintext address, keeping only the hash."""
    if row.email_hash is None and row.email is not None:
        row.email_hash = hash_email(row.email)
    row.status = SubscriptionStatus.UNSUBSCRIBED.value
    row.unsubscribed_at = now
    row.updated_at = now
    row.email = None


async def unsubscribe(*, session: AsyncSession, token: str) -> str:
    """Unsubscribe the address named by the token. Returns the redirect URL."""
    subscription_id = _read_token(token, purpose=UNSUBSCRIBE_PURPOSE)
    row = (
        await session.get(ListSubscription, subscription_id)
        if subscription_id
        else None
    )
    if row is None:
        return _status_url(None, "invalid")
    if row.status != SubscriptionStatus.UNSUBSCRIBED.value:
        now = utc_now()
        _mark_unsubscribed(row, now)
        await session.commit()
    return _status_url(row.list_key, "unsubscribed")


async def unsubscribe_address(*, session: AsyncSession, email: str) -> int:
    """Unsubscribe an address from every list (spam complaint). Caller commits."""
    now = utc_now()
    clean = notification_service.normalise_email(email)
    address_hash = hash_email(clean)
    result = await session.execute(
        update(ListSubscription)
        .where(
            or_(
                ListSubscription.email_hash == address_hash,
                ListSubscription.email == clean,
            ),
            ListSubscription.status != SubscriptionStatus.UNSUBSCRIBED.value,
        )
        .values(
            status=SubscriptionStatus.UNSUBSCRIBED.value,
            unsubscribed_at=now,
            updated_at=now,
            email=None,
            email_hash=address_hash,
        )
    )
    return int(getattr(result, "rowcount", 0) or 0)
