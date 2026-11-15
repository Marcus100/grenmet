"""Pairing secret: checked on every call, hashed at rest, never logged, rate limited."""

import hashlib
import logging
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.printix import constants, service
from src.printix.models import PrintixPairing
from src.utils.datetime import utc_now

from .support import (
    SCANNER,
    bearer,
    make_event,
    make_pairing,
    make_ticket,
    outcome_of,
    scan,
)

pytestmark = pytest.mark.usefixtures("db_async")


async def test_missing_header_is_401(async_client: httpx.AsyncClient) -> None:
    response = await async_client.post(f"{SCANNER}/admissions", json={"value": "1"})

    assert response.status_code == 401


@pytest.mark.parametrize(
    "header",
    [
        "Basic dXNlcjpwYXNz",
        "Bearer",
        "Bearer short-token",
        "Bearer " + "x" * 300,
    ],
)
async def test_malformed_or_implausible_secrets_are_401(
    async_client: httpx.AsyncClient, header: str
) -> None:
    response = await async_client.post(
        f"{SCANNER}/admissions",
        headers={"Authorization": header},
        json={"value": "1"},
    )

    assert response.status_code == 401


async def test_unknown_secret_is_401(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    await make_event(db_async)

    response = await async_client.post(
        f"{SCANNER}/admissions",
        headers=bearer("A" * 43),
        json={"value": "1"},
    )

    assert response.status_code == 401


async def test_expired_pairing_is_403(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001")
    pairing, secret = await make_pairing(db_async, event)
    pairing.expires_at = utc_now() - timedelta(minutes=1)
    await db_async.commit()

    response = await scan(async_client, secret, "001")

    assert response.status_code == 403
    assert "expired" in response.json()["detail"]


async def test_revoked_pairing_stops_at_once(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001")
    _, secret = await make_pairing(db_async, event)
    assert outcome_of(await scan(async_client, secret, "001")) == "admitted"

    await make_ticket(db_async, event, "002")
    pairing = (
        await db_async.execute(
            select(PrintixPairing).where(PrintixPairing.event_id == event.id)
        )
    ).scalar_one()
    await service.revoke_pairing(db_async, pairing.id)

    response = await scan(async_client, secret, "002")

    assert response.status_code == 403
    assert "revoked" in response.json()["detail"]


async def test_the_secret_is_hashed_at_rest(db_async: AsyncSession) -> None:
    event = await make_event(db_async)
    pairing, secret = await make_pairing(db_async, event)

    stored = await db_async.get(PrintixPairing, pairing.id)
    assert stored is not None
    assert stored.token_hash == hashlib.sha256(secret.encode()).hexdigest()
    assert secret not in stored.token_hash
    assert secret.encode() not in stored.token_hash.encode()


async def test_the_secret_never_appears_in_logs(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001")
    _, secret = await make_pairing(db_async, event)
    await scan(async_client, secret, "001")
    await scan(async_client, "B" * 43, "001")

    assert secret not in caplog.text
    for record in caplog.records:
        assert secret not in str(record.__dict__)


async def test_the_secret_is_not_in_any_stored_row(db_async: AsyncSession) -> None:
    event = await make_event(db_async)
    _, secret = await make_pairing(db_async, event)

    rows = (await db_async.execute(select(PrintixPairing))).scalars().all()
    for row in rows:
        for column in row.__table__.columns:
            assert secret not in str(getattr(row, column.name))


async def test_a_pairing_is_rate_limited_and_others_are_not(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(constants, "SCANS_PER_WINDOW", 3)
    event = await make_event(db_async)
    for number in ("001", "002", "003", "004", "005"):
        await make_ticket(db_async, event, number)
    _, busy = await make_pairing(db_async, event, gate="Busy")
    _, quiet = await make_pairing(db_async, event, gate="Quiet")

    results = [
        await scan(async_client, busy, number) for number in ("001", "002", "003")
    ]
    limited = await scan(async_client, busy, "004")
    other = await scan(async_client, quiet, "004")

    assert [outcome_of(r) for r in results] == ["admitted", "admitted", "admitted"]
    assert limited.status_code == 429
    assert limited.headers["Retry-After"] == str(constants.SCAN_WINDOW_SECONDS)
    assert outcome_of(other) == "admitted"


def test_the_limit_is_the_documented_default() -> None:
    assert constants.SCANS_PER_WINDOW == 120
    assert constants.SCAN_WINDOW_SECONDS == 60
