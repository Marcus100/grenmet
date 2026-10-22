"""Emailed-code verification before a booking deposit (#471, ADR-0018)."""

import asyncio
import time
import uuid
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth.config import auth_settings
from src.auth.email_verification import ERROR_CODE
from src.auth.utils import create_access_token
from src.bookings import email_code
from src.bookings.models import Booking
from src.contacts.models import Contact
from tests.bookings.email_code_helpers import get_proof, latest_code, slot_body
from tests.bookings.memory_code_store import MemoryCodeStore
from tests.bookings.test_deposits import _deposit_studio
from tests.bookings.test_public_bookings import (
    API,
    Studio,
    _body,
    _emails,
    _slots,
    _studio,
)
from tests.events.roles import user_with_role
from tests.factories import make_user
from tests.organisations.support import headers_for

EMAIL = "guest@example.com"


async def _request(client: httpx.AsyncClient, studio: Studio, slot: str, **kw):
    return await client.post(
        f"{API}/public/{studio.slug}/email-code",
        json=slot_body(studio, slot, kw.pop("email", EMAIL)),
        **kw,
    )


async def _confirm(client: httpx.AsyncClient, studio: Studio, slot: str, code: str):
    return await client.post(
        f"{API}/public/{studio.slug}/email-code/confirm",
        json={**slot_body(studio, slot, EMAIL), "code": code},
    )


async def _create(
    client: httpx.AsyncClient,
    studio: Studio,
    slot: str,
    proof: str | None,
    *,
    email: str = EMAIL,
    key: str | None = None,
    headers: dict[str, str] | None = None,
):
    return await client.post(
        f"{API}/public/{studio.slug}/bookings",
        headers={"Idempotency-Key": key or uuid.uuid4().hex, **(headers or {})},
        json=_body(studio, slot, customer_email=email, email_proof=proof),
    )


async def _setup(db: AsyncSession, client: httpx.AsyncClient):
    studio = await _deposit_studio(db, client)
    return studio, (await _slots(client, studio))[0]


async def _wrong(client, studio, slot, code="000000"):
    # A guess that cannot be the real code.
    return await _confirm(client, studio, slot, code)


# --- happy path -------------------------------------------------------------------------


async def test_guest_verifies_then_pays_a_deposit(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    code_store: MemoryCodeStore,
) -> None:
    studio, slot = await _setup(db_async, async_client)
    sent = await _request(async_client, studio, slot)
    assert sent.status_code == 200
    assert sent.json() == {"required": True, "expires_in_seconds": 600}
    code = await latest_code(db_async, studio.org_id)
    assert len(code) == 6

    # Only hashes reach the store: neither the code nor the address.
    stored = repr(code_store._data)
    assert code not in stored
    assert EMAIL not in stored

    done = await _confirm(async_client, studio, slot, code)
    assert done.status_code == 200
    created = await _create(async_client, studio, slot, done.json()["proof"])
    assert created.status_code == 201, created.text
    assert created.json()["payment_required"] is True


async def test_a_replayed_create_with_the_same_key_needs_no_second_proof(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, slot = await _setup(db_async, async_client)
    proof = await get_proof(db_async, async_client, studio, slot, EMAIL)
    first = await _create(async_client, studio, slot, proof, key="replay-key-0001")
    replay = await _create(async_client, studio, slot, None, key="replay-key-0001")
    assert first.status_code == replay.status_code == 201
    assert replay.headers["Idempotency-Replayed"] == "true"


# --- no step ------------------------------------------------------------------------------


async def test_no_deposit_booking_has_no_step(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    code_store: MemoryCodeStore,
) -> None:
    studio = await _studio(db_async, async_client)
    slot = (await _slots(async_client, studio))[0]
    sent = await _request(async_client, studio, slot)
    assert sent.json() == {"required": False, "expires_in_seconds": 0}
    assert await _emails(db_async, studio.org_id) == []
    assert code_store._data == {}
    assert (await _create(async_client, studio, slot, None)).status_code == 201


async def test_verified_account_with_its_own_email_is_exempt(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, slot = await _setup(db_async, async_client)
    user = await make_user(db_async, verified=True)
    headers = headers_for(user)
    sent = await _request(async_client, studio, slot, email=user.email, headers=headers)
    assert sent.json()["required"] is False
    assert await _emails(db_async, studio.org_id) == []
    created = await _create(
        async_client, studio, slot, None, email=user.email, headers=headers
    )
    assert created.status_code == 201


async def test_admin_activated_account_is_exempt(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, slot = await _setup(db_async, async_client)
    user = await make_user(db_async, verified=False)
    user.email_verification_required = False
    db_async.add(
        AuditEntry(
            entity_type="account_activation",
            entity_id=str(user.id),
            record_type="account_activation",
            record_id=str(user.id),
            action="activated",
            changes=[],
        )
    )
    await db_async.commit()
    created = await _create(
        async_client, studio, slot, None, email=user.email, headers=headers_for(user)
    )
    assert created.status_code == 201, created.text


async def test_unverified_bookings_app_session_gets_the_step(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, slot = await _setup(db_async, async_client)
    user = await user_with_role(db_async, "bookings-member")
    user.email_verified_at = None
    await db_async.commit()
    address = user.email
    token = create_access_token(
        user.id,
        expires_delta=timedelta(minutes=auth_settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        app="bookings",
    )
    headers = {"Authorization": f"Bearer {token}"}
    refused = await _create(
        async_client, studio, slot, None, email=address, headers=headers
    )
    assert refused.status_code == 403
    proof = await get_proof(db_async, async_client, studio, slot, address, headers)
    ok = await _create(
        async_client, studio, slot, proof, email=address, headers=headers
    )
    assert ok.status_code == 201

    # A verified bookings session is recognised too: no step.
    verified = await user_with_role(db_async, "bookings-member")
    verified_address = verified.email
    vtoken = create_access_token(
        verified.id,
        expires_delta=timedelta(minutes=auth_settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        app="bookings",
    )
    slot2 = (await _slots(async_client, studio))[0]
    ok2 = await _create(
        async_client,
        studio,
        slot2,
        None,
        email=verified_address,
        headers={"Authorization": f"Bearer {vtoken}"},
    )
    assert ok2.status_code == 201


async def test_another_apps_session_is_still_just_a_guest(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, slot = await _setup(db_async, async_client)
    user = await make_user(db_async, verified=True)
    token = create_access_token(
        user.id,
        expires_delta=timedelta(minutes=auth_settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        app="events",
    )
    refused = await _create(
        async_client,
        studio,
        slot,
        None,
        email=user.email,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert refused.status_code == 403


# --- fail closed ---------------------------------------------------------------------------


async def test_a_deposit_without_proof_is_refused_and_stores_nothing(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, slot = await _setup(db_async, async_client)
    refused = await _create(async_client, studio, slot, None)
    assert refused.status_code == 403
    assert refused.json()["detail"].startswith(f"{ERROR_CODE}:")
    junk = await _create(async_client, studio, slot, "not.a-proof")
    assert junk.status_code == 403
    db_async.expire_all()
    assert await db_async.scalar(select(func.count()).select_from(Booking)) == 0
    assert (
        await db_async.scalar(
            select(func.count()).select_from(Contact).where(Contact.email == EMAIL)
        )
        == 0
    )


async def test_tampered_proof_is_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, slot = await _setup(db_async, async_client)
    proof = await get_proof(db_async, async_client, studio, slot, EMAIL)
    body, _, signature = proof.partition(".")
    forged = f"{body}.{'0' * len(signature)}"
    assert (await _create(async_client, studio, slot, forged)).status_code == 403
    assert (await _create(async_client, studio, slot, proof)).status_code == 201


async def test_store_outage_fails_closed(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    code_store: MemoryCodeStore,
) -> None:
    studio, slot = await _setup(db_async, async_client)
    proof = await get_proof(db_async, async_client, studio, slot, EMAIL)
    code_store.down = True
    assert (await _request(async_client, studio, slot)).status_code == 503
    assert (await _create(async_client, studio, slot, proof)).status_code == 503
    assert (await _create(async_client, studio, slot, None)).status_code == 403
    db_async.expire_all()
    assert await db_async.scalar(select(func.count()).select_from(Booking)) == 0


# --- code rules ----------------------------------------------------------------------------


async def test_wrong_code_is_refused_and_the_right_one_still_works(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, slot = await _setup(db_async, async_client)
    await _request(async_client, studio, slot)
    code = await latest_code(db_async, studio.org_id)
    wrong = "123456" if code != "123456" else "654321"
    assert (await _confirm(async_client, studio, slot, wrong)).status_code == 400
    assert (await _confirm(async_client, studio, slot, code)).status_code == 200


async def test_code_must_be_six_digits(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, slot = await _setup(db_async, async_client)
    assert (await _confirm(async_client, studio, slot, "12345")).status_code == 422
    assert (await _confirm(async_client, studio, slot, "abcdef")).status_code == 422


async def test_expired_code_is_refused(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    code_store: MemoryCodeStore,
) -> None:
    studio, slot = await _setup(db_async, async_client)
    await _request(async_client, studio, slot)
    code = await latest_code(db_async, studio.org_id)
    code_store.advance(email_code.CODE_TTL + 1)
    assert (await _confirm(async_client, studio, slot, code)).status_code == 400


async def test_a_code_works_once(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, slot = await _setup(db_async, async_client)
    await _request(async_client, studio, slot)
    code = await latest_code(db_async, studio.org_id)
    assert (await _confirm(async_client, studio, slot, code)).status_code == 200
    assert (await _confirm(async_client, studio, slot, code)).status_code == 400


async def test_a_new_code_replaces_the_old_one(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, slot = await _setup(db_async, async_client)
    await _request(async_client, studio, slot)
    first = await latest_code(db_async, studio.org_id)
    await _request(async_client, studio, slot)
    second = await latest_code(db_async, studio.org_id)
    if first != second:
        assert (await _confirm(async_client, studio, slot, first)).status_code == 400
    assert (await _confirm(async_client, studio, slot, second)).status_code == 200


async def test_five_wrong_codes_lock_the_email(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    code_store: MemoryCodeStore,
) -> None:
    studio, slot = await _setup(db_async, async_client)
    await _request(async_client, studio, slot)
    code = await latest_code(db_async, studio.org_id)
    wrong = "123456" if code != "123456" else "654321"
    for _ in range(4):
        assert (await _confirm(async_client, studio, slot, wrong)).status_code == 400
    assert (await _confirm(async_client, studio, slot, wrong)).status_code == 429
    # Locked: even the right code and a new request are refused.
    assert (await _confirm(async_client, studio, slot, code)).status_code == 429
    assert (await _request(async_client, studio, slot)).status_code == 429
    # The lock lapses.
    code_store.advance(email_code.LOCK_TTL + 1)
    assert (await _request(async_client, studio, slot)).status_code == 200
    fresh = await latest_code(db_async, studio.org_id)
    assert (await _confirm(async_client, studio, slot, fresh)).status_code == 200


async def test_asking_for_a_new_code_does_not_reset_the_guess_count(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, slot = await _setup(db_async, async_client)
    await _request(async_client, studio, slot)
    code = await latest_code(db_async, studio.org_id)
    wrong = "123456" if code != "123456" else "654321"
    for _ in range(3):
        await _confirm(async_client, studio, slot, wrong)
    await _request(async_client, studio, slot)
    fresh = await latest_code(db_async, studio.org_id)
    wrong = "123456" if fresh != "123456" else "654321"
    assert (await _confirm(async_client, studio, slot, wrong)).status_code == 400
    assert (await _confirm(async_client, studio, slot, wrong)).status_code == 429


async def test_codes_per_email_are_rate_limited(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    code_store: MemoryCodeStore,
) -> None:
    studio, slot = await _setup(db_async, async_client)
    for _ in range(email_code.SEND_LIMIT):
        assert (await _request(async_client, studio, slot)).status_code == 200
    assert (await _request(async_client, studio, slot)).status_code == 429
    # Another address is unaffected; the window lapses for this one.
    other = await _request(async_client, studio, slot, email="other@example.com")
    assert other.status_code == 200
    code_store.advance(email_code.SEND_WINDOW + 1)
    assert (await _request(async_client, studio, slot)).status_code == 200


# --- proof binding -------------------------------------------------------------------------


async def test_a_proof_is_single_use(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, slot = await _setup(db_async, async_client)
    proof = await get_proof(db_async, async_client, studio, slot, EMAIL)
    assert (await _create(async_client, studio, slot, proof)).status_code == 201
    again = await _create(async_client, studio, slot, proof)
    assert again.status_code == 403


async def test_a_proof_for_another_email_or_slot_is_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, slot = await _setup(db_async, async_client)
    slots = await _slots(async_client, studio)
    proof = await get_proof(db_async, async_client, studio, slot, EMAIL)
    other_email = await _create(
        async_client, studio, slot, proof, email="someone-else@example.com"
    )
    assert other_email.status_code == 403
    other_slot = await _create(async_client, studio, slots[1], proof)
    assert other_slot.status_code == 403
    # The refused attempts did not burn the proof.
    assert (await _create(async_client, studio, slot, proof)).status_code == 201


async def test_a_proof_from_another_organisation_is_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, slot = await _setup(db_async, async_client)
    other = await _deposit_studio(db_async, async_client)
    other_slot = (await _slots(async_client, other))[0]
    proof = await get_proof(db_async, async_client, other, other_slot, EMAIL)
    # Same email, same wall-clock slot, different business.
    assert slot == other_slot
    refused = await _create(async_client, studio, slot, proof)
    assert refused.status_code == 403


async def test_an_expired_proof_is_refused(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    studio, slot = await _setup(db_async, async_client)
    proof = await get_proof(db_async, async_client, studio, slot, EMAIL)
    later = time.time() + email_code.PROOF_TTL + 5
    monkeypatch.setattr(email_code.time, "time", lambda: later)
    assert (await _create(async_client, studio, slot, proof)).status_code == 403


async def test_a_failed_booking_does_not_burn_the_proof(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, slot = await _setup(db_async, async_client)
    taker = await get_proof(db_async, async_client, studio, slot, "first@example.com")
    assert (
        await _create(async_client, studio, slot, taker, email="first@example.com")
    ).status_code == 201
    proof = await get_proof(db_async, async_client, studio, slot, EMAIL)
    lost = await _create(async_client, studio, slot, proof)
    assert lost.status_code == 409  # the slot is gone
    # The proof is still good for a later booking of that very slot.
    again = await _create(async_client, studio, slot, proof)
    assert again.status_code == 409


# --- hardening (security review of #496) ---------------------------------------------------


class _YieldingStore(MemoryCodeStore):
    """Yields to the event loop after every read and after every counter step, so
    concurrent confirms interleave the way they do against real Redis.

    The OLD order (compare first, count the failure afterwards) lets every request
    in a burst read the live code and compare before any failure is counted, so
    the burst below would evaluate all 13 guesses and this test would fail."""

    async def get(self, key: str) -> str | None:
        value = await super().get(key)
        await asyncio.sleep(0)
        return value

    async def incr(self, key: str, ttl: int) -> int:
        await asyncio.sleep(0)
        return await super().incr(key, ttl)


@pytest.fixture
def yielding_store():
    store = _YieldingStore()
    previous = email_code.set_store(store)
    yield store
    email_code.set_store(previous)


@pytest.mark.usefixtures("yielding_store")
async def test_parallel_guesses_cannot_exceed_the_attempt_limit(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, slot = await _setup(db_async, async_client)
    await _request(async_client, studio, slot)
    code = await latest_code(db_async, studio.org_id)
    wrong = "123456" if code != "123456" else "654321"
    # Wrong guesses only: were the right code in the burst, its position in the
    # scheduling order would decide the outcome (a win consumes the code, after
    # which later guesses are uncounted). It follows once the burst is done.
    burst = [_confirm(async_client, studio, slot, wrong) for _ in range(12)]
    statuses = [r.status_code for r in await asyncio.gather(*burst)]
    # At most MAX_ATTEMPTS guesses were ever evaluated; the rest hit the lock.
    assert statuses.count(400) <= email_code.MAX_ATTEMPTS - 1
    assert statuses.count(429) >= len(statuses) - email_code.MAX_ATTEMPTS
    # Once locked, the right code is refused too.
    assert (await _confirm(async_client, studio, slot, code)).status_code == 429


async def test_the_right_code_on_the_last_allowed_attempt_works(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, slot = await _setup(db_async, async_client)
    await _request(async_client, studio, slot)
    code = await latest_code(db_async, studio.org_id)
    wrong = "123456" if code != "123456" else "654321"
    for _ in range(email_code.MAX_ATTEMPTS - 1):
        assert (await _confirm(async_client, studio, slot, wrong)).status_code == 400
    assert (await _confirm(async_client, studio, slot, code)).status_code == 200


async def test_a_wrong_last_attempt_locks_and_deletes_the_code(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    code_store: MemoryCodeStore,
) -> None:
    studio, slot = await _setup(db_async, async_client)
    await _request(async_client, studio, slot)
    code = await latest_code(db_async, studio.org_id)
    wrong = "123456" if code != "123456" else "654321"
    assert any(":code:" in key for key in code_store._data)
    for _ in range(email_code.MAX_ATTEMPTS - 1):
        await _confirm(async_client, studio, slot, wrong)
    assert (await _confirm(async_client, studio, slot, wrong)).status_code == 429
    assert not any(":code:" in key for key in code_store._data)
    assert any(":lock:" in key for key in code_store._data)


async def test_junk_confirms_without_a_live_code_never_lock_the_pair(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, slot = await _setup(db_async, async_client)
    for _ in range(email_code.MAX_ATTEMPTS + 5):
        assert (await _confirm(async_client, studio, slot, "111111")).status_code == 400
    # The real owner can still ask for and use a code.
    assert (await _request(async_client, studio, slot)).status_code == 200
    code = await latest_code(db_async, studio.org_id)
    assert (await _confirm(async_client, studio, slot, code)).status_code == 200


async def test_an_ineligible_bookings_token_is_treated_as_a_guest(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, slot = await _setup(db_async, async_client)
    # Verified, but holds no bookings access: the session must not exempt it.
    user = await make_user(db_async, verified=True)
    address = user.email
    token = create_access_token(
        user.id,
        expires_delta=timedelta(minutes=auth_settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        app="bookings",
    )
    refused = await _create(
        async_client,
        studio,
        slot,
        None,
        email=address,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert refused.status_code == 403


async def test_a_downgraded_bookings_token_leaves_no_audit_actor(
    db_async: AsyncSession,
) -> None:
    from starlette.requests import Request

    from src.audit.listener import ACTOR_KEY
    from src.dependencies import optional_account

    user = await make_user(db_async, verified=True)  # no bookings access
    token = create_access_token(
        user.id,
        expires_delta=timedelta(minutes=auth_settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        app="bookings",
    )
    request = Request(
        {
            "type": "http",
            "headers": [(b"authorization", f"Bearer {token}".encode())],
        }
    )
    assert await optional_account(request, db_async, app="bookings") is None
    assert db_async.info.get(ACTOR_KEY) is None


async def test_an_inactive_bookings_account_is_treated_as_a_guest(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, slot = await _setup(db_async, async_client)
    user = await user_with_role(db_async, "bookings-member")
    address = user.email
    token = create_access_token(
        user.id,
        expires_delta=timedelta(minutes=auth_settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        app="bookings",
    )
    user.is_active = False
    await db_async.commit()
    refused = await _create(
        async_client,
        studio,
        slot,
        None,
        email=address,
        headers={"Authorization": f"Bearer {token}"},
    )
    assert refused.status_code == 403


async def test_redis_counter_always_has_a_ttl() -> None:
    from redis.asyncio import Redis

    from src.worker.config import worker_settings

    url = worker_settings.REDIS_URL
    if not url:
        pytest.skip("no Redis configured")
    client = Redis.from_url(url, decode_responses=True)
    try:
        await client.ping()
    except Exception:
        pytest.skip("Redis not reachable")
    key = f"bk:ec:test:{uuid.uuid4().hex}"
    store = email_code.RedisCodeStore(url)
    try:
        assert await store.incr(key, 60) == 1
        assert 0 < await client.ttl(key) <= 60
        # A counter that somehow lost its TTL is repaired on the next increment.
        await client.persist(key)
        assert await client.ttl(key) == -1
        assert await store.incr(key, 60) == 2
        assert 0 < await client.ttl(key) <= 60
    finally:
        await client.delete(key)
        await client.aclose()
