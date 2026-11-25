"""ADR-0066 slice 2: a Bookings business signs itself up (``POST /bookings/me/organisations``).

The route is off until ``BOOKINGS_SELF_SIGNUP_ENABLED`` is set, answers 404 before any
other work, needs a verified account, an ``Idempotency-Key`` and (outside local
development) a Turnstile token. One self-created business per account, three sign-ups
an hour per visitor address. The starter templates are read from
``GET /bookings/me/business-templates``.
"""

import asyncio
import uuid
from collections.abc import AsyncGenerator
from datetime import time, timedelta
from typing import NamedTuple, get_args

import httpx
import pytest
from sqlalchemy import delete, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src import turnstile
from src.auth.models import User
from src.billing.models import AppSubscriptionTrial, Plan
from src.bookings import config as bookings_config
from src.bookings.models import (
    BookingProfile,
    Provider,
    ProviderService,
    Service,
    WorkingHours,
)
from src.bookings.schemas import BookingSignupTemplate
from src.bookings.templates import STARTER_TEMPLATES
from src.config import settings
from src.idempotency import IdempotencyKey
from src.organisations.models import (
    Membership,
    OrganisationApp,
    PlatformOrganisation,
)
from src.rate_limit import limiter
from src.utils.datetime import utc_now
from tests.events.roles import user_with_role
from tests.organisations.support import headers_for

URL = "/api/v1/bookings/me/organisations"
TEMPLATES_URL = "/api/v1/bookings/me/business-templates"
pytestmark = pytest.mark.usefixtures("signup_on")
PLAN = "bookings-monthly"


@pytest.fixture(autouse=True)
async def plan_seed(db_async: AsyncSession) -> AsyncGenerator[None]:
    """The trial grant points at the plan; the test database is cleared per test."""
    db_async.add(
        Plan(
            key=PLAN,
            app_key="bookings",
            interval="month",
            active=True,
            name="Bookings monthly",
        )
    )
    await db_async.commit()
    yield


@pytest.fixture
def signup_on(monkeypatch: pytest.MonkeyPatch) -> None:
    """The switch on, local environment, the global Turnstile switch off."""
    monkeypatch.setattr(bookings_config.bookings_settings, "SELF_SIGNUP_ENABLED", True)
    monkeypatch.setattr(settings, "ENVIRONMENT", "local")
    monkeypatch.setattr(turnstile.turnstile_settings, "TURNSTILE_ENABLED", False)


def _body(
    name: str = "Glow Studio", template: str | None = "nails", **extra: object
) -> dict[str, object]:
    return {
        "name": name,
        "business_type": "beauty",
        "town": "St. George's",
        "template": template,
        **extra,
    }


class _Account(NamedTuple):
    """The account's id, read before any commit (a commit expires the ORM object)."""

    id: uuid.UUID


async def _member(db: AsyncSession) -> tuple[_Account, dict[str, str]]:
    user = await user_with_role(db, "bookings-member")
    return _Account(user.id), headers_for(user)


def _key_headers(headers: dict[str, str], key: str | None = None) -> dict[str, str]:
    return {**headers, "Idempotency-Key": key or uuid.uuid4().hex}


async def _post(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    body: dict[str, object] | None = None,
    *,
    key: str | None = None,
) -> httpx.Response:
    return await client.post(
        URL, headers=_key_headers(headers, key), json=body or _body()
    )


async def _businesses_of(db: AsyncSession, user: _Account) -> int:
    db.expire_all()
    count = await db.scalar(
        select(func.count(PlatformOrganisation.id)).where(
            PlatformOrganisation.created_by_user_id == user.id
        )
    )
    return int(count or 0)


async def test_the_switch_off_answers_404_before_anything_else(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bookings_config.bookings_settings, "SELF_SIGNUP_ENABLED", False)
    user, headers = await _member(db_async)
    await db_async.execute(
        update(User).where(User.id == user.id).values(email_verified_at=None)
    )
    await db_async.commit()
    # No Idempotency-Key and an unverified account: still 404, as if the route did not exist.
    response = await async_client.post(URL, headers=headers, json=_body())
    assert response.status_code == 404
    assert await _businesses_of(db_async, user) == 0


async def test_a_verified_owner_gets_a_closed_business_with_its_starter_services(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    user, headers = await _member(db_async)
    response = await _post(async_client, headers)
    assert response.status_code == 201, response.text
    receipt = response.json()
    org_id = receipt["organisation_id"]
    assert receipt["template"] == "nails"
    assert receipt["name_flagged"] is False
    assert receipt["trial_ends_at"] is not None

    db_async.expire_all()
    organisation = await db_async.get(PlatformOrganisation, org_id)
    assert organisation is not None
    assert organisation.kind == "business"
    assert organisation.status == "active"
    assert organisation.created_by_user_id == user.id
    assert organisation.slug == receipt["slug"]

    membership = await db_async.scalar(
        select(Membership).where(
            Membership.organisation_id == org_id, Membership.user_id == user.id
        )
    )
    assert membership is not None
    assert (membership.role, membership.status) == ("owner", "active")

    entitlements = await db_async.scalars(
        select(OrganisationApp).where(OrganisationApp.organisation_id == org_id)
    )
    assert {row.app_key: (row.enabled, row.source) for row in entitlements} == {
        "bookings": (True, "trial"),
        "contacts": (True, "trial"),
    }

    profile = await db_async.scalar(
        select(BookingProfile).where(BookingProfile.organisation_id == org_id)
    )
    assert profile is not None
    assert profile.public_slug == receipt["public_slug"]
    assert (profile.enabled, profile.listed, profile.requires_confirmation) == (
        False,
        False,
        True,
    )
    assert (profile.timezone, profile.currency) == ("America/Grenada", "XCD")
    assert (profile.city, profile.business_type) == ("St. George's", "beauty")
    assert profile.listing_approved_at is None
    assert profile.sender_name_flagged_at is None
    assert profile.owner_provider_id is not None

    provider = await db_async.get(Provider, profile.owner_provider_id)
    assert provider is not None
    assert provider.organisation_id == org_id
    assert provider.name == "Test User"
    hours = await db_async.scalars(
        select(WorkingHours).where(WorkingHours.provider_id == provider.id)
    )
    assert sorted((h.weekday, h.start_time, h.end_time) for h in hours) == [
        (day, time(9, 0), time(17, 0)) for day in range(5)
    ]

    services = list(
        await db_async.scalars(select(Service).where(Service.organisation_id == org_id))
    )
    template = STARTER_TEMPLATES["nails"]
    assert sorted(s.name for s in services) == sorted(s.name for s in template.services)
    for service in services:
        assert service.deposit_minor == 0
        assert service.price_minor % 100 == 0
    linked = await db_async.scalar(
        select(func.count(ProviderService.service_id)).where(
            ProviderService.provider_id == provider.id
        )
    )
    assert linked == len(template.services)

    trial = await db_async.get(AppSubscriptionTrial, (org_id, "bookings-monthly"))
    assert trial is not None
    assert trial.trial_days == 30
    assert abs(trial.trial_ends_at - (utc_now() + timedelta(days=30))) < timedelta(
        minutes=5
    )


async def test_a_business_without_a_template_gets_no_services(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    _, headers = await _member(db_async)
    response = await _post(async_client, headers, _body(template=None))
    assert response.status_code == 201, response.text
    assert response.json()["template"] is None
    org_id = response.json()["organisation_id"]
    count = await db_async.scalar(
        select(func.count(Service.id)).where(Service.organisation_id == org_id)
    )
    assert count == 0


async def test_an_unknown_template_is_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    _, headers = await _member(db_async)
    response = await _post(async_client, headers, _body(template="not-a-template"))
    assert response.status_code == 422


async def test_an_unverified_email_is_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    user, headers = await _member(db_async)
    await db_async.execute(
        update(User).where(User.id == user.id).values(email_verified_at=None)
    )
    await db_async.commit()
    response = await _post(async_client, headers)
    assert response.status_code == 403
    assert "email_verification_required" in response.text
    assert await _businesses_of(db_async, user) == 0


async def test_the_idempotency_key_is_required(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    _, headers = await _member(db_async)
    response = await async_client.post(URL, headers=headers, json=_body())
    assert response.status_code == 400


async def test_a_repeated_key_replays_the_first_answer(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    user, headers = await _member(db_async)
    key = uuid.uuid4().hex
    first = await _post(async_client, headers, key=key)
    second = await _post(async_client, headers, key=key)
    assert first.status_code == 201, first.text
    assert second.status_code == 201, second.text
    assert second.headers["Idempotency-Replayed"] == "true"
    assert second.json()["organisation_id"] == first.json()["organisation_id"]
    assert await _businesses_of(db_async, user) == 1

    other_body = await _post(async_client, headers, _body(name="Another Name"), key=key)
    assert other_body.status_code == 409
    assert await _businesses_of(db_async, user) == 1


async def test_a_key_whose_answer_was_purged_does_not_make_a_second_business(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    user, headers = await _member(db_async)
    key = uuid.uuid4().hex
    first = await _post(async_client, headers, key=key)
    assert first.status_code == 201, first.text
    # The stored answer expires after its TTL; the retry must not build the business again.
    await db_async.execute(delete(IdempotencyKey).where(IdempotencyKey.key == key))
    await db_async.commit()
    again = await _post(async_client, headers, key=key)
    assert again.status_code == 409
    assert await _businesses_of(db_async, user) == 1


async def test_an_account_makes_one_business_of_its_own(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    user, headers = await _member(db_async)
    first = await _post(async_client, headers, _body(name="First Salon"))
    second = await _post(async_client, headers, _body(name="Second Salon"))
    assert [first.status_code, second.status_code] == [201, 409]
    assert await _businesses_of(db_async, user) == 1


async def test_two_racing_sign_ups_with_different_keys_make_one_business(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    user, headers = await _member(db_async)
    results = await asyncio.gather(
        _post(async_client, headers, _body(name="Race One")),
        _post(async_client, headers, _body(name="Race Two")),
    )
    assert sorted(r.status_code for r in results) == [201, 409]
    assert await _businesses_of(db_async, user) == 1


async def test_turnstile_is_required_outside_local_whatever_the_switch_says(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "ENVIRONMENT", "staging")
    _, headers = await _member(db_async)

    # Outside local the global switch is ignored: the check runs and needs a secret.
    monkeypatch.setattr(turnstile.turnstile_settings, "TURNSTILE_SECRET_KEY", None)
    assert (await _post(async_client, headers)).status_code == 503

    monkeypatch.setattr(turnstile.turnstile_settings, "TURNSTILE_SECRET_KEY", "s3cret")
    assert (await _post(async_client, headers)).status_code == 400  # no token

    monkeypatch.setattr(
        turnstile,
        "_transport",
        httpx.MockTransport(lambda _: httpx.Response(200, json={"success": False})),
    )
    assert (
        await _post(async_client, headers, _body(turnstile_token="bad"))
    ).status_code == 400

    monkeypatch.setattr(
        turnstile,
        "_transport",
        httpx.MockTransport(lambda _: httpx.Response(200, json={"success": True})),
    )
    assert (
        await _post(async_client, headers, _body(turnstile_token="good"))
    ).status_code == 201


async def test_three_sign_ups_an_hour_per_visitor_address(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    limiter.reset()
    codes: list[int] = []
    limiter.enabled = True
    try:
        for index in range(4):
            _, headers = await _member(db_async)
            codes.append(
                (
                    await _post(async_client, headers, _body(name=f"Limit {index}"))
                ).status_code
            )
    finally:
        limiter.enabled = False
        limiter.reset()
    assert codes == [201, 201, 201, 429]


async def test_a_name_the_sender_guard_rejects_is_flagged_for_review(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    _, headers = await _member(db_async)
    response = await _post(async_client, headers, _body(name="Barrels Hair Studio"))
    assert response.status_code == 201, response.text
    assert response.json()["name_flagged"] is True
    profile = await db_async.scalar(
        select(BookingProfile).where(
            BookingProfile.organisation_id == response.json()["organisation_id"]
        )
    )
    assert profile is not None
    assert profile.sender_name_flagged_at is not None


async def test_reserved_names_get_a_suffix_on_both_slugs(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    _, headers = await _member(db_async)
    response = await _post(async_client, headers, _body(name="Studio"))
    assert response.status_code == 201, response.text
    receipt = response.json()
    assert receipt["slug"] != "studio" and receipt["slug"].startswith("studio-")
    assert receipt["public_slug"] != "studio"
    assert receipt["public_slug"].startswith("studio-")


async def test_the_starter_templates_are_listed_for_a_signed_in_account(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    _, headers = await _member(db_async)
    response = await async_client.get(TEMPLATES_URL, headers=headers)
    assert response.status_code == 200, response.text
    templates = {row["key"]: row for row in response.json()}
    assert set(templates) == set(STARTER_TEMPLATES)
    assert templates["blank"]["services"] == []
    nails = templates["nails"]
    assert set(nails) == {"key", "label", "business_type", "services"}
    assert len(nails["services"]) == len(STARTER_TEMPLATES["nails"].services)
    for service in nails["services"]:
        assert set(service) == {"name", "duration_min", "price_minor"}
        assert service["price_minor"] % 100 == 0


async def test_the_templates_need_a_signed_in_account(
    async_client: httpx.AsyncClient,
) -> None:
    response = await async_client.get(TEMPLATES_URL)
    assert response.status_code == 401


def test_a_template_is_a_fixed_list_with_no_deposit_or_policy() -> None:
    """Pure check of the data: nothing a template sets is a deposit or a policy."""
    assert set(STARTER_TEMPLATES) == {
        "hair-salon",
        "barber",
        "nails",
        "lashes-brows",
        "massage-spa",
        "fitness-coach",
        "tutor",
        "tour-operator",
        "photographer",
        "blank",
    }
    for template in STARTER_TEMPLATES.values():
        names = [s.name for s in template.services]
        assert len(names) == len(set(names))
        for service in template.services:
            assert 5 <= service.duration_min <= 720
            assert service.price_ec > 0 or template.key == "blank"
    assert STARTER_TEMPLATES["blank"].services == ()
    assert set(get_args(BookingSignupTemplate)) == set(STARTER_TEMPLATES)
