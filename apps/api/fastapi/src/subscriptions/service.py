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
from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.config import auth_settings
from src.config import settings
from src.email_config import email_settings
from src.exceptions import AppValidationError
from src.notifications import service as notification_service
from src.organisations import sites
from src.utils.datetime import utc_now
from src.utils.email_hash import hash_email

from .config import subscriptions_settings
from .constants import (
    CONFIRM_PURPOSE,
    CONFIRMATION_TEMPLATE,
    MAILING_LISTS,
    NEWSLETTER_PREFERENCES_PATH,
    UNSUBSCRIBE_PURPOSE,
    MailingList,
)
from .exceptions import SubscriptionLinkInvalidError
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
    """Subscription id named by a valid token of this purpose, else None.

    An expired token raises ``jwt.ExpiredSignatureError`` so the caller can say
    "expired" instead of "invalid"."""
    try:
        claims = jwt.decode(token, auth_settings.SECRET_KEY, algorithms=[_ALGORITHM])
        if claims.get("purpose") != purpose:
            return None
        return uuid.UUID(str(claims["sub"]))
    except jwt.ExpiredSignatureError:
        raise
    except InvalidTokenError, KeyError, ValueError:
        return None


def _unverified_subscription_id(token: str, *, purpose: str) -> uuid.UUID | None:
    """Subscription id of an expired token of this purpose, to find its list only."""
    try:
        claims = jwt.decode(
            token,
            auth_settings.SECRET_KEY,
            algorithms=[_ALGORITHM],
            options={"verify_exp": False},
        )
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


async def site_url_for(session: AsyncSession, list_key: str | None) -> str:
    """Public origin of a list: its public site's ``site_url`` (ADR-0025 N1), else
    the deprecated ``SUBSCRIPTIONS_SITE_URLS`` setting. Only configured origins."""
    if list_key:
        site = await sites.resolve_public_site(session, list_key)
        if site is not None and site.site_url:
            return site.site_url.rstrip("/")
    return _site_url(list_key)


async def _status_url(session: AsyncSession, list_key: str | None, result: str) -> str:
    base = await site_url_for(session, list_key)
    return f"{base}/subscribe/status?{urlencode({'result': result})}"


# ── Subscribe ────────────────────────────────────────────────────────────────


async def subscribe(
    *,
    session: AsyncSession,
    list_key: str,
    email: str,
    list_name: str | None = None,
) -> None:
    """Record a pending subscription and queue the confirmation email.

    ``list_name`` comes from a public site (``org.public_site``); without it the
    list must be one of ``MAILING_LISTS``."""
    mailing_list = MAILING_LISTS.get(list_key)
    if list_name is not None:
        mailing_list = MailingList(key=list_key, name=list_name)
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
    """Confirm the subscription named by the token. Returns the redirect URL.

    An expired link answers ``result=expired`` (the page says to sign up again)
    and confirms nothing."""
    try:
        subscription_id = _read_token(token, purpose=CONFIRM_PURPOSE)
    except jwt.ExpiredSignatureError:
        expired_id = _unverified_subscription_id(token, purpose=CONFIRM_PURPOSE)
        expired_row = (
            await session.get(ListSubscription, expired_id) if expired_id else None
        )
        return await _status_url(
            session, expired_row.list_key if expired_row else None, "expired"
        )
    row = (
        await session.get(ListSubscription, subscription_id)
        if subscription_id
        else None
    )
    if row is None or row.status == SubscriptionStatus.UNSUBSCRIBED.value:
        return await _status_url(session, row.list_key if row else None, "invalid")
    if row.status == SubscriptionStatus.PENDING.value:
        now = utc_now()
        row.status = SubscriptionStatus.CONFIRMED.value
        row.confirmed_at = now
        row.updated_at = now
        await session.commit()
    return await _status_url(session, row.list_key, "confirmed")


def _mark_unsubscribed(row: ListSubscription, now: datetime) -> None:
    """Unsubscribe a row and drop its plaintext address, keeping only the hash."""
    if row.email_hash is None and row.email is not None:
        row.email_hash = hash_email(row.email)
    row.status = SubscriptionStatus.UNSUBSCRIBED.value
    row.unsubscribed_at = now
    row.updated_at = now
    row.email = None


async def _unsubscribe_row(
    session: AsyncSession, token: str
) -> ListSubscription | None:
    subscription_id = _read_token(token, purpose=UNSUBSCRIBE_PURPOSE)
    if subscription_id is None:
        return None
    return await session.get(ListSubscription, subscription_id)


async def _list_name(session: AsyncSession, list_key: str) -> str:
    mailing_list = MAILING_LISTS.get(list_key)
    if mailing_list is not None:
        return mailing_list.name
    site = await sites.resolve_public_site(session, list_key)
    return site.name if site is not None else list_key


def unsubscribe_confirm_url(token: str) -> str:
    """Confirmation page for an unsubscribe token. Opening it changes nothing."""
    return (
        f"{_api_base()}/subscriptions/unsubscribe/confirm?{urlencode({'token': token})}"
    )


def unsubscribe_action_url(token: str) -> str:
    """Where the confirmation page posts, and the one-click target in mail headers."""
    return _action_link("unsubscribe", token)


async def unsubscribe_context(*, session: AsyncSession, token: str) -> str | None:
    """Name of the list an unsubscribe token belongs to; changes nothing.

    None for a token that is missing, forged, expired or of another purpose."""
    row = await _unsubscribe_row(session, token)
    if row is None:
        return None
    return await _list_name(session, row.list_key)


async def unsubscribe(*, session: AsyncSession, token: str) -> str | None:
    """Unsubscribe the address named by the token (POST only).

    Returns the list name, or None for an invalid token. Repeating it is harmless."""
    row = await _unsubscribe_row(session, token)
    if row is None:
        return None
    if row.status != SubscriptionStatus.UNSUBSCRIBED.value:
        _mark_unsubscribed(row, utc_now())
        await session.commit()
    return await _list_name(session, row.list_key)


def pending_expiry_cutoff(now: datetime) -> datetime:
    """Unconfirmed rows whose newest confirmation link lapsed before this are expired.

    The retention purge deletes them. A link lives ``SUBSCRIPTIONS_CONFIRM_TTL_DAYS``
    from the time it was sent."""
    return now - timedelta(days=subscriptions_settings.SUBSCRIPTIONS_CONFIRM_TTL_DAYS)


# ── Preferences (ADR-0052): the lists behind one emailed link ───────────────


async def _address_rows(
    session: AsyncSession,
    *,
    email_hash: str | None,
    email: str | None,
    confirmed_only: bool,
) -> list[ListSubscription]:
    """Rows of one address on any list. Matches the keyed hash or legacy plaintext.

    Takes the two address fields by value: callers commit in between, and an
    expired ORM row cannot be read again inside the async session."""
    matches = []
    if email_hash:
        matches.append(ListSubscription.email_hash == email_hash)
    if email:
        matches.append(ListSubscription.email == email)
    if not matches:
        return []
    conditions = [or_(*matches)]
    if confirmed_only:
        conditions.append(ListSubscription.status == SubscriptionStatus.CONFIRMED.value)
    rows = await session.scalars(select(ListSubscription).where(*conditions))
    return list(rows.all())


async def _preference_lists(
    session: AsyncSession, *, email_hash: str | None, email: str | None
) -> list[dict[str, str]]:
    rows = await _address_rows(
        session, email_hash=email_hash, email=email, confirmed_only=True
    )
    lists = [
        {"list_key": row.list_key, "list_name": await _list_name(session, row.list_key)}
        for row in rows
    ]
    return sorted(lists, key=lambda item: item["list_name"])


async def _token_row(session: AsyncSession, token: str) -> ListSubscription:
    """The row an unsubscribe-purpose token names; raises when it names none."""
    row = await _unsubscribe_row(session, token)
    if row is None:
        raise SubscriptionLinkInvalidError()
    return row


async def preferences(*, session: AsyncSession, token: str) -> list[dict[str, str]]:
    """Confirmed lists of the address named by the token (read only)."""
    row = await _token_row(session, token)
    return await _preference_lists(session, email_hash=row.email_hash, email=row.email)


async def unsubscribe_one_list(
    *, session: AsyncSession, token: str, list_key: str
) -> list[dict[str, str]]:
    """Stop one list of the token's address. Other lists and addresses are untouched.

    An address that is not on ``list_key`` changes nothing, so the reply does not
    reveal anything about other lists. Returns the lists still confirmed."""
    token_row = await _token_row(session, token)
    email_hash, email = token_row.email_hash, token_row.email
    now = utc_now()
    for row in await _address_rows(
        session, email_hash=email_hash, email=email, confirmed_only=True
    ):
        if row.list_key == list_key:
            _mark_unsubscribed(row, now)
    await session.commit()
    return await _preference_lists(session, email_hash=email_hash, email=email)


def preferences_link(base: str, subscription_id: uuid.UUID) -> str:
    """Preferences page under a list's site origin, with that row's signed token."""
    token = _make_token(
        subscription_id=subscription_id, purpose=UNSUBSCRIBE_PURPOSE, ttl=None
    )
    return f"{base}{NEWSLETTER_PREFERENCES_PATH}?{urlencode({'token': token})}"


async def preferences_url(
    session: AsyncSession, list_key: str, subscription_id: uuid.UUID
) -> str:
    """Preferences link for one row (one database lookup for the origin)."""
    return preferences_link(await site_url_for(session, list_key), subscription_id)
