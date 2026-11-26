"""Bookings: the private calendar feed (one subscribable URL per organisation).

The studio creates a feed once (the full URL is returned only then) and can
rotate it, which ends the old URL. Only the SHA-256 of the token is stored. The
public feed serves the organisation's bookings from 7 days ago to the booking
horizon, with a customer's first name only, and answers one 404 for every
unknown, malformed, rotated or disabled feed. Another business's bookings never
appear in a feed.
"""

import hashlib
import hmac
import logging
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.bookings import calendar_feed
from src.bookings import router as bookings_router
from src.bookings.models import Booking, CalendarFeed
from src.organisations.models import MembershipRole
from src.rate_limit import limiter
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

API = "/api/v1/bookings"
FEED_MARKER = "/api/v1/bookings/public/calendar/"


@dataclass
class Salon:
    org_id: str
    owner: User
    member: User
    headers: dict[str, str]
    slug: str
    service_id: str
    provider_id: str


def _iso(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:00Z")


def _naive(moment: datetime) -> datetime:
    return moment.astimezone(UTC).replace(tzinfo=None)


def _in_days(days: float) -> datetime:
    moment = datetime.now(UTC) + timedelta(days=days)
    return moment.replace(second=0, microsecond=0)


async def _salon(
    db: AsyncSession, client: httpx.AsyncClient, name: str = "Babydoll Beauty Bar"
) -> Salon:
    owner = await make_user(db)
    member = await make_user(db)
    org = await make_org(
        db,
        f"Studio {uuid.uuid4().hex[:6]}",
        members=((owner, MembershipRole.OWNER), (member, MembershipRole.MEMBER)),
        apps=("bookings",),
    )
    headers = headers_for(owner, org.id)
    slug = f"studio-{uuid.uuid4().hex[:10]}"
    profile = await client.put(
        f"{API}/org/profile",
        headers=headers,
        json={
            "public_slug": slug,
            "display_name": name,
            "enabled": True,
            "lead_time_min": 0,
            "horizon_days": 60,
            "city": "St. George's",
        },
    )
    assert profile.status_code == 200, profile.text
    service = await client.post(
        f"{API}/org/services",
        headers=headers,
        json={"name": "Classic full set", "duration_min": 120},
    )
    assert service.status_code == 201, service.text
    provider = await client.post(
        f"{API}/org/providers",
        headers=headers,
        json={"name": "Jeriann", "service_ids": [service.json()["id"]]},
    )
    assert provider.status_code == 201, provider.text
    return Salon(
        org.id,
        owner,
        member,
        headers,
        slug,
        service.json()["id"],
        provider.json()["id"],
    )


async def _book(
    client: httpx.AsyncClient,
    salon: Salon,
    starts_at: datetime,
    *,
    name: str = "Ada Lovelace",
    email: str | None = None,
    phone: str | None = None,
    notes: str | None = None,
) -> str:
    body: dict[str, Any] = {
        "service_id": salon.service_id,
        "provider_id": salon.provider_id,
        "starts_at": _iso(starts_at),
        "customer_name": name,
        "customer_email": email or f"{uuid.uuid4().hex[:8]}@example.com",
    }
    if phone is not None:
        body["customer_phone"] = phone
    if notes is not None:
        body["notes"] = notes
    response = await client.post(
        f"{API}/org/bookings",
        headers={**salon.headers, "Idempotency-Key": uuid.uuid4().hex},
        json=body,
    )
    assert response.status_code == 201, response.text
    return str(response.json()["id"])


async def _set_booking(
    db: AsyncSession,
    booking_id: str,
    *,
    starts_at: datetime | None = None,
    **values: Any,
) -> None:
    """Move or restate a booking directly, for windows staff entry forbids."""
    if starts_at is not None:
        ends = starts_at + timedelta(hours=2)
        values.update(
            starts_at=_naive(starts_at),
            ends_at=_naive(ends),
            blocked_from=_naive(starts_at),
            blocked_until=_naive(ends),
        )
    await db.execute(
        update(Booking).where(Booking.id == uuid.UUID(booking_id)).values(**values)
    )
    await db.commit()


async def _create_feed(client: httpx.AsyncClient, salon: Salon) -> str:
    response = await client.post(f"{API}/org/calendar-feed", headers=salon.headers)
    assert response.status_code == 201, response.text
    return str(response.json()["url"])


def _feed_path(url: str) -> str:
    return url[url.index(FEED_MARKER) :]


def _token_of(url: str) -> str:
    return url.rsplit("/", 1)[-1].removesuffix(".ics")


def _unfold(text: str) -> str:
    return text.replace("\r\n ", "")


def _events(text: str) -> dict[str, dict[str, str]]:
    """UID -> properties of each VEVENT in an unfolded feed."""
    events: dict[str, dict[str, str]] = {}
    for block in _unfold(text).split("BEGIN:VEVENT\r\n")[1:]:
        props: dict[str, str] = {}
        for line in block.split("\r\n"):
            if line.startswith("END:VEVENT"):
                break
            key, _, value = line.partition(":")
            props[key] = value
        events[props["UID"]] = props
    return events


def _uid(booking_id: str) -> str:
    return f"booking-{booking_id}@barrels.gd"


# --- creating, showing and rotating -------------------------------------------------------


async def test_create_returns_the_url_once_and_stores_only_a_hash(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    salon = await _salon(db_async, async_client)
    response = await async_client.post(
        f"{API}/org/calendar-feed", headers=salon.headers
    )
    assert response.status_code == 201, response.text
    url = response.json()["url"]
    assert url.startswith("http") and FEED_MARKER in url and url.endswith(".ics")
    token = _token_of(url)

    row = (
        await db_async.execute(
            select(CalendarFeed).where(CalendarFeed.organisation_id == salon.org_id)
        )
    ).scalar_one()
    assert row.token_hash == hashlib.sha256(token.encode()).hexdigest()
    assert all(token not in str(value) for value in vars(row).values())

    status_resp = await async_client.get(
        f"{API}/org/calendar-feed", headers=salon.headers
    )
    assert status_resp.status_code == 200, status_resp.text
    assert status_resp.json()["enabled"] is True
    assert token not in status_resp.text
    assert "url" not in status_resp.json()


async def test_only_one_feed_per_organisation(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    salon = await _salon(db_async, async_client)
    await _create_feed(async_client, salon)
    again = await async_client.post(f"{API}/org/calendar-feed", headers=salon.headers)
    assert again.status_code == 409, again.text


async def test_members_cannot_create_read_or_rotate(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    salon = await _salon(db_async, async_client)
    member_headers = headers_for(salon.member, salon.org_id)
    created = await async_client.post(
        f"{API}/org/calendar-feed", headers=member_headers
    )
    assert created.status_code == 403, created.text
    await _create_feed(async_client, salon)
    read = await async_client.get(f"{API}/org/calendar-feed", headers=member_headers)
    assert read.status_code == 403, read.text
    rotated = await async_client.post(
        f"{API}/org/calendar-feed/rotate", headers=member_headers
    )
    assert rotated.status_code == 403, rotated.text


async def test_rotate_invalidates_the_old_url(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    salon = await _salon(db_async, async_client)
    old_url = await _create_feed(async_client, salon)
    assert (await async_client.get(_feed_path(old_url))).status_code == 200

    rotated = await async_client.post(
        f"{API}/org/calendar-feed/rotate", headers=salon.headers
    )
    assert rotated.status_code == 200, rotated.text
    new_url = rotated.json()["url"]
    assert new_url != old_url
    assert (await async_client.get(_feed_path(old_url))).status_code == 404
    assert (await async_client.get(_feed_path(new_url))).status_code == 200

    status_resp = await async_client.get(
        f"{API}/org/calendar-feed", headers=salon.headers
    )
    assert status_resp.json()["rotated_at"] is not None


async def test_rotate_without_a_feed_is_404(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    salon = await _salon(db_async, async_client)
    response = await async_client.post(
        f"{API}/org/calendar-feed/rotate", headers=salon.headers
    )
    assert response.status_code == 404, response.text


async def test_status_before_any_feed_is_disabled(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    salon = await _salon(db_async, async_client)
    response = await async_client.get(f"{API}/org/calendar-feed", headers=salon.headers)
    assert response.status_code == 200, response.text
    assert response.json()["enabled"] is False


# --- the public feed -----------------------------------------------------------------------


async def test_unknown_and_malformed_tokens_answer_the_same_404(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    salon = await _salon(db_async, async_client)
    await _create_feed(async_client, salon)
    paths = [
        f"{FEED_MARKER}{calendar_feed.new_token()}.ics",
        f"{FEED_MARKER}short.ics",
        f"{FEED_MARKER}{'a' * 500}.ics",
        f"{FEED_MARKER}bad.token.with.dots.ics",
    ]
    responses = [await async_client.get(path) for path in paths]
    assert {response.status_code for response in responses} == {404}
    assert len({response.text for response in responses}) == 1


async def test_feed_lists_the_window_and_statuses(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    salon = await _salon(db_async, async_client)
    url = await _create_feed(async_client, salon)

    confirmed = await _book(async_client, salon, _in_days(2))
    pending = await _book(async_client, salon, _in_days(3))
    await _set_booking(db_async, pending, status="pending")
    completed = await _book(async_client, salon, _in_days(4))
    await _set_booking(db_async, completed, status="completed")
    unpaid = await _book(async_client, salon, _in_days(5))
    await _set_booking(db_async, unpaid, status="pending_payment")
    cancelled_now = await _book(async_client, salon, _in_days(6))
    await _set_booking(
        db_async,
        cancelled_now,
        status="cancelled",
        cancelled_at=_naive(datetime.now(UTC) - timedelta(days=1)),
    )
    cancelled_old = await _book(async_client, salon, _in_days(7))
    await _set_booking(
        db_async,
        cancelled_old,
        status="cancelled",
        cancelled_at=_naive(datetime.now(UTC) - timedelta(days=30)),
    )
    recent_past = await _book(async_client, salon, _in_days(1))
    await _set_booking(
        db_async, recent_past, starts_at=datetime.now(UTC) - timedelta(days=3)
    )
    old_past = await _book(async_client, salon, _in_days(1))
    await _set_booking(
        db_async, old_past, starts_at=datetime.now(UTC) - timedelta(days=10)
    )
    far = await _book(async_client, salon, _in_days(90))

    response = await async_client.get(_feed_path(url))
    assert response.status_code == 200, response.text
    events = _events(response.text)

    assert events[_uid(confirmed)]["STATUS"] == "CONFIRMED"
    assert events[_uid(pending)]["STATUS"] == "TENTATIVE"
    assert events[_uid(completed)]["STATUS"] == "CONFIRMED"
    assert events[_uid(cancelled_now)]["STATUS"] == "CANCELLED"
    assert events[_uid(recent_past)]["STATUS"] == "CONFIRMED"
    for hidden in (unpaid, cancelled_old, old_past, far):
        assert _uid(hidden) not in events


async def test_feed_is_scoped_to_its_own_organisation(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    ours = await _salon(db_async, async_client, name="Babydoll Beauty Bar")
    theirs = await _salon(db_async, async_client, name="Other Salon")
    url = await _create_feed(async_client, ours)
    own = await _book(async_client, ours, _in_days(2))
    foreign = await _book(async_client, theirs, _in_days(2))

    text = (await async_client.get(_feed_path(url))).text
    events = _events(text)
    assert _uid(own) in events
    assert _uid(foreign) not in events
    assert "Other Salon" not in text


async def test_feed_shows_first_name_only_and_no_contact_or_notes(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    salon = await _salon(db_async, async_client)
    url = await _create_feed(async_client, salon)
    booking = await _book(
        async_client,
        salon,
        _in_days(2),
        name="Ada Lovelace",
        email="ada.private@example.com",
        phone="+1 (473) 555-0199",
        notes="Allergic to latex, arrives late",
    )

    text = (await async_client.get(_feed_path(url))).text
    event = _events(text)[_uid(booking)]
    assert event["SUMMARY"] == "Classic full set - Ada"
    assert event["DESCRIPTION"] == "Provider: Jeriann"
    assert event["LOCATION"] == "St. George's"
    for leaked in (
        "Lovelace",
        "ada.private@example.com",
        "555-0199",
        "(473)",
        "latex",
        "late",
        "ATTENDEE",
        "CONTACT",
        "ORGANIZER",
    ):
        assert leaked not in text


async def test_feed_headers_and_calendar_text(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    salon = await _salon(db_async, async_client)
    url = await _create_feed(async_client, salon)
    await _book(async_client, salon, _in_days(2))

    response = await async_client.get(_feed_path(url))
    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/calendar")
    assert response.headers["cache-control"] == "private, max-age=300"
    assert response.text.startswith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")
    assert "X-WR-CALNAME:Babydoll Beauty Bar\r\n" in response.text
    assert response.text.replace("\r\n", "").count("\n") == 0


async def test_moved_booking_keeps_its_uid_and_bumps_sequence(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    salon = await _salon(db_async, async_client)
    url = await _create_feed(async_client, salon)
    booking = await _book(async_client, salon, _in_days(2))
    before = _events((await async_client.get(_feed_path(url))).text)[_uid(booking)]

    moved = await async_client.post(
        f"{API}/org/bookings/{booking}/reschedule",
        headers=salon.headers,
        json={"starts_at": _iso(_in_days(3))},
    )
    assert moved.status_code == 200, moved.text

    after = _events((await async_client.get(_feed_path(url))).text)[_uid(booking)]
    assert int(after["SEQUENCE"]) > int(before["SEQUENCE"])
    assert after["DTSTART"] != before["DTSTART"]


async def test_disabled_profile_hides_the_feed(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    salon = await _salon(db_async, async_client)
    url = await _create_feed(async_client, salon)
    disabled = await async_client.put(
        f"{API}/org/profile",
        headers=salon.headers,
        json={
            "public_slug": salon.slug,
            "display_name": "Babydoll Beauty Bar",
            "enabled": False,
        },
    )
    assert disabled.status_code == 200, disabled.text
    assert (await async_client.get(_feed_path(url))).status_code == 404


async def test_feed_token_never_reaches_the_logs(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    caplog: pytest.LogCaptureFixture,
) -> None:
    salon = await _salon(db_async, async_client)
    caplog.set_level(logging.DEBUG)
    url = await _create_feed(async_client, salon)
    token = _token_of(url)
    assert (await async_client.get(_feed_path(url))).status_code == 200
    # The test client (httpx) logs its own request URL; only the server's logs
    # count here.
    server_lines = [
        record.getMessage() for record in caplog.records if record.name != "httpx"
    ]
    assert not [line for line in server_lines if token in line]


def test_feed_route_carries_its_rate_limit() -> None:
    """The public feed has its own limit: 60 a minute per address (429 beyond).

    Checked on the route's registered limit, not by sending 61 requests: slowapi
    can skip route limits when its Redis store is unavailable, which the test
    database may be, and a live count would then pass or fail by accident."""
    declared = [route.path for route in bookings_router.router.routes]
    assert "/bookings/public/calendar/{token}.ics" in declared
    name = "src.bookings.router.get_public_calendar_feed"
    limits = limiter._route_limits[name]
    assert len(limits) == 1
    assert limits[0].limit.amount == 60
    assert limits[0].limit.get_expiry() == 60
    assert limits[0].scope == calendar_feed.RATE_LIMIT_SCOPE


@pytest.mark.usefixtures("db_async")
async def test_limiter_identifiers_for_a_feed_request_hold_no_token(
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The keys slowapi builds for a feed request never contain the feed token.

    The default scope is the request path, which holds the token; the route's
    scope keeps it out of Redis and the in-memory fallback."""
    seen: list[tuple[object, ...]] = []
    real_hit = limiter.limiter.hit

    def spy(item: object, *identifiers: object, **kwargs: object) -> bool:
        seen.append(identifiers)
        return bool(real_hit(item, *identifiers, **kwargs))

    monkeypatch.setattr(limiter.limiter, "hit", spy)
    token = calendar_feed.new_token()
    limiter.enabled = True
    try:
        await async_client.get(f"{FEED_MARKER}{token}.ics")
    finally:
        limiter.enabled = False
    assert seen, "the feed route did not consult the limiter"
    assert any(calendar_feed.RATE_LIMIT_SCOPE in ids for ids in seen)
    for identifiers in seen:
        assert all(token not in str(part) for part in identifiers)


_MANAGE_ROUTES = {
    "src.bookings.router.get_public_booking": bookings_router.MANAGE_VIEW_SCOPE,
    "src.bookings.router.cancel_public_booking": bookings_router.MANAGE_CANCEL_SCOPE,
    "src.bookings.router.reschedule_public_booking": (
        bookings_router.MANAGE_RESCHEDULE_SCOPE
    ),
    "src.bookings.router.get_public_booking_ics": bookings_router.MANAGE_ICS_SCOPE,
}


def test_manage_routes_each_carry_a_scope_and_a_limit() -> None:
    """Without a scope slowapi keys each manage route by its path, which holds the
    booking token. Every manage route names its own constant scope."""
    assert len(set(_MANAGE_ROUTES.values())) == len(_MANAGE_ROUTES)
    for name, scope in _MANAGE_ROUTES.items():
        limits = limiter._route_limits[name]
        assert limits, f"{name} has no rate limit"
        assert all(item.scope == scope for item in limits), name


@pytest.mark.usefixtures("db_async")
async def test_limiter_identifiers_for_manage_requests_hold_no_token(
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Each manage route (view, cancel, reschedule, ics) consults the limiter with
    its own scope and never with a key that holds the token in the path."""
    seen: list[tuple[object, ...]] = []
    real_hit = limiter.limiter.hit

    def spy(item: object, *identifiers: object, **kwargs: object) -> bool:
        seen.append(identifiers)
        return bool(real_hit(item, *identifiers, **kwargs))

    monkeypatch.setattr(limiter.limiter, "hit", spy)
    token = calendar_feed.new_token()
    base = f"/api/v1/bookings/public/bookings/{token}"
    limiter.enabled = True
    try:
        await async_client.get(base)
        await async_client.post(f"{base}/cancel", json={})
        await async_client.post(
            f"{base}/reschedule", json={"starts_at": "2030-01-01T10:00:00Z"}
        )
        await async_client.get(f"{base}/ics")
    finally:
        limiter.enabled = False
    for scope in (
        bookings_router.MANAGE_VIEW_SCOPE,
        bookings_router.MANAGE_CANCEL_SCOPE,
        bookings_router.MANAGE_RESCHEDULE_SCOPE,
        bookings_router.MANAGE_ICS_SCOPE,
    ):
        assert any(scope in ids for ids in seen), f"{scope} was never consulted"
    for identifiers in seen:
        assert all(token not in str(part) for part in identifiers)


# --- pure helpers -------------------------------------------------------------------------


def test_token_check_uses_a_constant_time_comparison(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[bytes, bytes]] = []
    real = hmac.compare_digest

    def spy(left: bytes, right: bytes) -> bool:
        calls.append((left, right))
        return real(left, right)

    monkeypatch.setattr(calendar_feed.hmac, "compare_digest", spy)
    token = calendar_feed.new_token()
    stored = calendar_feed.hash_token(token)
    assert calendar_feed.token_matches(token, stored) is True
    assert calendar_feed.token_matches("x" * 43, stored) is False
    assert len(calls) == 2


def test_hash_is_sha256_of_the_token() -> None:
    assert calendar_feed.hash_token("abc") == hashlib.sha256(b"abc").hexdigest()


def test_first_name_is_the_first_word_only() -> None:
    assert calendar_feed.first_name("  Ada Lovelace ") == "Ada"
    assert calendar_feed.first_name("Mónica") == "Mónica"
    assert calendar_feed.first_name("") is None
    assert calendar_feed.first_name("   ") is None
    assert calendar_feed.first_name(None) is None


def test_first_name_is_capped_at_24_characters() -> None:
    long_name = "A" * 40 + " Surname"
    assert calendar_feed.first_name(long_name) == "A" * calendar_feed.NAME_MAX_CHARS
    assert calendar_feed.first_name("B" * 24) == "B" * 24


def test_an_e_mail_or_number_in_the_name_field_shows_no_name() -> None:
    assert calendar_feed.first_name("ada.private@example.com") is None
    assert calendar_feed.first_name("ada@example.com Lovelace") is None
    assert calendar_feed.first_name("+1 (473) 555-0199") is None
    assert calendar_feed.first_name("4735550199") is None
    assert calendar_feed.first_name("Ada2") == "Ada2"


def test_obfuscated_contact_details_in_the_name_field_show_no_name() -> None:
    """Full-width signs, "(at)" spellings, domains, schemes and long digit runs."""
    assert calendar_feed.first_name("ada＠example.com") is None
    assert calendar_feed.first_name("name(at)example.com") is None
    assert calendar_feed.first_name("name[at]example") is None
    assert calendar_feed.first_name("tel:4735550199") is None
    assert calendar_feed.first_name("ｔｅｌ：4735550199") is None
    assert calendar_feed.first_name("Ada 4735550199") == "Ada"
    assert calendar_feed.first_name("Ada123456") == "Ada123456"


def test_full_width_letters_are_shown_as_typed() -> None:
    """The check uses NFKC, the shown name keeps the customer's own spelling."""
    assert calendar_feed.first_name("Ａｄａ Lovelace") == "Ａｄａ"


def test_legitimate_names_with_dots_slashes_and_colons_are_kept() -> None:
    assert calendar_feed.first_name("J.Smith") == "J.Smith"
    assert calendar_feed.first_name("Mary.Ann") == "Mary.Ann"
    assert calendar_feed.first_name("St.John") == "St.John"
    assert calendar_feed.first_name("Ada/Bob") == "Ada/Bob"
    assert calendar_feed.first_name("Ada-Lee") == "Ada-Lee"
    assert calendar_feed.first_name("O'Brien") == "O'Brien"


async def test_a_name_that_is_an_e_mail_never_reaches_the_feed(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    salon = await _salon(db_async, async_client)
    url = await _create_feed(async_client, salon)
    booking = await _book(
        async_client, salon, _in_days(2), name="ada.private@example.com"
    )

    text = (await async_client.get(_feed_path(url))).text
    event = _events(text)[_uid(booking)]
    assert event["SUMMARY"] == "Classic full set"
    assert "ada.private" not in text
    assert "@example.com" not in text


async def test_a_deposit_receipt_does_not_bump_the_feed_sequence(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    # Staff record a deposit paid to the business: the history row is staff only, so
    # the calendar feed sends no update (issue #1869).
    salon = await _salon(db_async, async_client)
    url = await _create_feed(async_client, salon)
    booking = await _book(async_client, salon, _in_days(2))
    await _set_booking(db_async, booking, deposit_to_business_minor=5000)
    before = _events((await async_client.get(_feed_path(url))).text)[_uid(booking)]

    marked = await async_client.post(
        f"{API}/org/bookings/{booking}/deposit-received",
        headers=salon.headers,
        json={"method": "cash"},
    )
    assert marked.status_code == 200, marked.text

    after = _events((await async_client.get(_feed_path(url))).text)[_uid(booking)]
    assert after["SEQUENCE"] == before["SEQUENCE"]
