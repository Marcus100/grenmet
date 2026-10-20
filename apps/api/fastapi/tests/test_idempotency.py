"""run_idempotent: first call, replay, key reuse, expiry, failures, concurrency."""

import asyncio
import uuid
from datetime import timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src import idempotency
from src.database import async_session_factory
from src.idempotency import (
    IdempotencyInProgressError,
    IdempotencyKey,
    IdempotencyKeyReuseError,
    run_idempotent,
)
from src.utils.datetime import utc_now
from tests.organisations.support import make_org


async def _org(db: AsyncSession) -> str:
    return (await make_org(db, f"Idem {uuid.uuid4().hex[:6]}")).id


class Counter:
    def __init__(self) -> None:
        self.calls = 0

    async def handler(self) -> tuple[int, dict[str, object]]:
        self.calls += 1
        await asyncio.sleep(0)
        return 201, {"n": self.calls, "token": "secret"}


async def test_first_call_runs_and_same_request_replays(db_async: AsyncSession) -> None:
    org = await _org(db_async)
    counter = Counter()
    kwargs = {
        "scope": "t.create",
        "organisation_id": org,
        "key": "key-1",
        "request_body": {"a": 1, "b": [1, 2]},
        "handler": counter.handler,
    }
    first = await run_idempotent(db_async, **kwargs)
    await db_async.commit()
    # Key order in the body does not matter: the hash is canonical.
    second = await run_idempotent(
        db_async, **{**kwargs, "request_body": {"b": [1, 2], "a": 1}}
    )
    assert (first.status_code, first.replayed) == (201, False)
    assert (second.status_code, second.replayed) == (201, True)
    assert second.body == first.body == {"n": 1, "token": "secret"}
    assert counter.calls == 1


async def test_same_key_with_a_different_body_is_a_conflict(
    db_async: AsyncSession,
) -> None:
    org = await _org(db_async)
    counter = Counter()
    common = {"scope": "t.create", "organisation_id": org, "key": "k"}
    await run_idempotent(
        db_async, **common, request_body={"a": 1}, handler=counter.handler
    )
    await db_async.commit()
    with pytest.raises(IdempotencyKeyReuseError) as error:
        await run_idempotent(
            db_async, **common, request_body={"a": 2}, handler=counter.handler
        )
    assert error.value.status_code == 409
    assert counter.calls == 1


async def test_scope_and_organisation_isolate_keys(db_async: AsyncSession) -> None:
    org_a, org_b = await _org(db_async), await _org(db_async)
    counter = Counter()
    for scope, org in (("s1", org_a), ("s2", org_a), ("s1", org_b)):
        result = await run_idempotent(
            db_async,
            scope=scope,
            organisation_id=org,
            key="same",
            request_body={},
            handler=counter.handler,
        )
        assert not result.replayed
    assert counter.calls == 3


async def test_expired_key_is_reclaimed(db_async: AsyncSession) -> None:
    org = await _org(db_async)
    counter = Counter()
    kwargs = {
        "scope": "t",
        "organisation_id": org,
        "key": "old",
        "handler": counter.handler,
    }
    await run_idempotent(db_async, **kwargs, request_body={"a": 1})
    await db_async.commit()
    later = utc_now() + idempotency.TTL + timedelta(seconds=1)
    again = await run_idempotent(db_async, **kwargs, request_body={"a": 2}, now=later)
    assert not again.replayed
    assert counter.calls == 2


async def test_failed_handler_stores_nothing_and_the_retry_runs(
    db_async: AsyncSession,
) -> None:
    org = await _org(db_async)

    async def boom() -> tuple[int, dict[str, object]]:
        raise RuntimeError("nope")

    common = {"scope": "t", "organisation_id": org, "key": "retry"}
    with pytest.raises(RuntimeError):
        await run_idempotent(db_async, **common, request_body={}, handler=boom)
    await db_async.commit()  # even a caller that commits leaves no claim behind
    left = await db_async.scalar(
        select(func.count())
        .select_from(IdempotencyKey)
        .where(IdempotencyKey.organisation_id == org)
    )
    assert left == 0
    counter = Counter()
    result = await run_idempotent(
        db_async, **common, request_body={}, handler=counter.handler
    )
    assert not result.replayed
    assert counter.calls == 1


async def test_unfinished_claim_from_another_transaction_is_reported(
    db_async: AsyncSession,
) -> None:
    org = await _org(db_async)
    db_async.add(
        IdempotencyKey(
            scope="t",
            organisation_id=org,
            key="half",
            request_hash=idempotency.hash_request({}),
            expires_at=utc_now() + idempotency.TTL,
        )
    )
    await db_async.commit()
    with pytest.raises(IdempotencyInProgressError):
        await run_idempotent(
            db_async,
            scope="t",
            organisation_id=org,
            key="half",
            request_body={},
            handler=Counter().handler,
        )


async def test_concurrent_duplicates_run_the_handler_once(
    db_async: AsyncSession,
) -> None:
    org = await _org(db_async)
    counter = Counter()

    async def attempt() -> idempotency.IdempotentResult:
        async with async_session_factory() as session:
            result = await run_idempotent(
                session,
                scope="t.race",
                organisation_id=org,
                key="dup",
                request_body={"x": 1},
                handler=counter.handler,
            )
            # Hold the transaction open so the other attempt must wait for it.
            await asyncio.sleep(0.3)
            await session.commit()
            return result

    results = await asyncio.gather(attempt(), attempt())
    assert counter.calls == 1
    assert sorted(r.replayed for r in results) == [False, True]
    assert results[0].body == results[1].body


def test_hash_request_is_canonical_and_sensitive() -> None:
    assert idempotency.hash_request({"a": 1, "b": 2}) == idempotency.hash_request(
        {"b": 2, "a": 1}
    )
    assert idempotency.hash_request({"a": 1}) != idempotency.hash_request({"a": 2})
    assert len(idempotency.hash_request({})) == 64
