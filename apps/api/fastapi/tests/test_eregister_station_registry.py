# ruff: noqa: F811
"""Station registry (ADR-0032): list, add and edit stations."""

import httpx
import pytest
from sqlalchemy import select, text
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth.browser import get_browser_or_token_user
from src.main import app

from .test_eregister_entry_rules import (  # noqa: F401  (fixtures)
    _user,
    register_db,
    staff_client,
)

URL = "/api/v1/eregister/stations"
AWS = {
    "station_id": "AWS-1",
    "name": "Automatic weather station",
    "wigos_id": "0-20000-0-99001",
    "source_kind": "automatic",
}


async def test_78958_is_listed_as_the_manual_station(
    staff_client: httpx.AsyncClient,
) -> None:
    response = await staff_client.get(URL)
    assert response.status_code == 200, response.text
    assert "no-store" in response.headers["cache-control"]
    [station] = response.json()["stations"]
    assert station["station_id"] == "78958"
    assert station["wigos_id"] == "0-20000-0-78958"
    assert station["source_kind"] == "manual"
    assert station["schedule"] == "manual"
    assert station["manual_hours_utc"] == list(range(24))
    assert station["active"] is True


async def test_an_automatic_station_is_added_apart_from_78958(
    staff_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    created = await staff_client.post(URL, json=AWS)
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["schedule"] == "automatic"
    assert body["manual_hours_utc"] == []
    assert (await staff_client.get(f"{URL}/AWS-1")).json()["wigos_id"] == AWS[
        "wigos_id"
    ]
    ids = [s["station_id"] for s in (await staff_client.get(URL)).json()["stations"]]
    assert ids == ["78958", "AWS-1"]
    entry = (
        await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.entity_type == "eregister_station",
                AuditEntry.entity_id == "AWS-1",
            )
        )
    ).one()
    assert entry.action == "create"
    assert entry.actor_user_id is not None
    fields = {c["field"]: c["new"] for c in entry.changes}
    assert fields["source_kind"] == "automatic"


async def test_a_manual_station_defaults_to_every_hour_and_a_subset_is_hybrid(
    staff_client: httpx.AsyncClient,
) -> None:
    full = await staff_client.post(
        URL, json={"station_id": "M1", "source_kind": "manual"}
    )
    assert full.json()["schedule"] == "manual"
    part = await staff_client.post(
        URL,
        json={
            "station_id": "M2",
            "source_kind": "manual",
            "manual_hours_utc": [12, 0, 12, 6],
        },
    )
    assert part.status_code == 201, part.text
    assert part.json()["schedule"] == "hybrid"
    assert part.json()["manual_hours_utc"] == [0, 6, 12]


async def test_duplicate_station_id_and_wigos_id_are_refused(
    staff_client: httpx.AsyncClient,
) -> None:
    assert (await staff_client.post(URL, json=AWS)).status_code == 201
    same_id = await staff_client.post(URL, json={**AWS, "wigos_id": None})
    assert same_id.status_code == 409
    same_wigos = await staff_client.post(URL, json={**AWS, "station_id": "AWS-2"})
    assert same_wigos.status_code == 409
    assert "AWS-1" in same_wigos.json()["detail"]
    taken = await staff_client.post(
        URL, json={**AWS, "station_id": "78959", "wigos_id": "0-20000-0-78958"}
    )
    assert taken.status_code == 409


@pytest.mark.parametrize(
    "wigos",
    ["20000-0-78958", "0-20000-78958", "1-20000-0-78958", "0-200000-0-1", "0-1-0-a b"],
)
async def test_wigos_id_format_is_validated(
    staff_client: httpx.AsyncClient, wigos: str
) -> None:
    response = await staff_client.post(
        URL, json={"station_id": "X1", "source_kind": "manual", "wigos_id": wigos}
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    "extra",
    [
        {"source_kind": "automatic", "manual_hours_utc": [1]},
        {"source_kind": "manual", "manual_hours_utc": []},
        {"source_kind": "manual", "manual_hours_utc": [24]},
        {"source_kind": "radar"},
        {"source_kind": "manual", "station_id": "bad id"},
    ],
)
async def test_schedule_must_match_the_source_kind(
    staff_client: httpx.AsyncClient, extra: dict[str, object]
) -> None:
    response = await staff_client.post(URL, json={"station_id": "X1", **extra})
    assert response.status_code == 422


async def test_editing_changes_only_the_keys_sent_and_is_audited(
    staff_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    response = await staff_client.patch(
        f"{URL}/78958",
        json={"name": "Maurice Bishop International", "manual_hours_utc": [0, 12]},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["schedule"] == "hybrid"
    assert body["wigos_id"] == "0-20000-0-78958"
    entry = (
        await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.entity_type == "eregister_station",
                AuditEntry.entity_id == "78958",
            )
        )
    ).one()
    changes = {c["field"]: (c["old"], c["new"]) for c in entry.changes}
    assert set(changes) == {"name", "manual_hours_utc"}
    assert changes["manual_hours_utc"] == (list(range(24)), [0, 12])
    # Pressure amounts are untouched.
    settings = await staff_client.get(f"{URL}/78958/settings")
    assert settings.json()["qfe_offset_hpa"] == 0.3


async def test_switching_kind_adjusts_hours_and_clears_the_wigos_id_on_null(
    staff_client: httpx.AsyncClient,
) -> None:
    await staff_client.post(URL, json=AWS)
    manual = await staff_client.patch(f"{URL}/AWS-1", json={"source_kind": "manual"})
    assert manual.json()["manual_hours_utc"] == list(range(24))
    assert manual.json()["schedule"] == "manual"
    automatic = await staff_client.patch(
        f"{URL}/AWS-1", json={"source_kind": "automatic", "wigos_id": None}
    )
    assert automatic.json()["manual_hours_utc"] == []
    assert automatic.json()["wigos_id"] is None
    bad = await staff_client.patch(f"{URL}/AWS-1", json={"manual_hours_utc": [3]})
    assert bad.status_code == 422
    cleared = await staff_client.patch(f"{URL}/AWS-1", json={"active": None})
    assert cleared.status_code == 422


async def test_editing_into_a_taken_wigos_id_is_refused(
    staff_client: httpx.AsyncClient,
) -> None:
    await staff_client.post(URL, json=AWS)
    clash = await staff_client.patch(
        f"{URL}/AWS-1", json={"wigos_id": "0-20000-0-78958"}
    )
    assert clash.status_code == 409
    keep = await staff_client.patch(f"{URL}/AWS-1", json={"wigos_id": AWS["wigos_id"]})
    assert keep.status_code == 200


async def test_unknown_station_is_404(staff_client: httpx.AsyncClient) -> None:
    assert (await staff_client.get(f"{URL}/00000")).status_code == 404
    assert (
        await staff_client.patch(f"{URL}/00000", json={"name": "x"})
    ).status_code == 404


async def test_an_inactive_station_is_hidden_on_request_and_refused_by_the_gate(
    staff_client: httpx.AsyncClient, register_db: Engine
) -> None:
    from datetime import UTC, datetime
    from uuid import uuid4

    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy.pool import NullPool

    from src.eregister import gate

    off = await staff_client.patch(f"{URL}/78958", json={"active": False})
    assert off.json()["active"] is False
    visible = await staff_client.get(URL, params={"include_inactive": "false"})
    assert visible.json()["stations"] == []
    engine = create_async_engine(
        register_db.url.set(drivername="postgresql+asyncpg"), poolclass=NullPool
    )
    try:
        async with AsyncSession(engine) as register:
            with pytest.raises(gate.PublishGateError, match="inactive"):
                await gate.claim_manual_hour(
                    register,
                    station_id="78958",
                    observed_at=datetime(2026, 3, 30, 12, tzinfo=UTC),
                    observation_id=uuid4(),
                )
    finally:
        await engine.dispose()


async def test_reading_needs_register_access_and_changing_needs_qc(
    staff_client: httpx.AsyncClient,
) -> None:
    app.dependency_overrides[get_browser_or_token_user] = lambda: _user(superuser=False)
    assert (await staff_client.get(URL)).status_code == 403
    assert (await staff_client.post(URL, json=AWS)).status_code == 403
    assert (
        await staff_client.patch(f"{URL}/78958", json={"active": False})
    ).status_code == 403


def test_the_0007_migration_is_additive_and_reversible(
    register_db: Engine,
) -> None:
    from pathlib import Path

    from alembic.config import Config

    from alembic import command

    config = Config(
        str(Path(__file__).resolve().parents[1] / "src/eregister/alembic.ini")
    )
    config.attributes["expected_database"] = register_db.url.database
    query = text(
        "SELECT count(*) FROM information_schema.columns WHERE"
        " table_schema = 'observations' AND table_name = 'stations'"
        " AND column_name IN ('source_kind', 'active')"
    )
    with register_db.begin() as connection:
        config.attributes["connection"] = connection
        assert connection.execute(query).scalar_one() == 2
        command.downgrade(config, "eregister_0006")
        assert connection.execute(query).scalar_one() == 0
        command.upgrade(config, "head")
        assert connection.execute(query).scalar_one() == 2
