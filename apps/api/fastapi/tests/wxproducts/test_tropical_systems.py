"""Tracked tropical systems: identity, derived entries, rebuild and public history."""

import asyncio
from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy import event, select, text

from src.auth.models import User
from src.baseline import product_access
from src.wxproducts import service, tropical_systems, validation
from src.wxproducts.exceptions import ProductValidationError
from src.wxproducts.models import TropicalSystemChange, TropicalSystemEntry
from src.wxproducts.schemas import TropicalSystemCreate, TropicalSystemUpdate
from src.wxwatch.nhc_schemas import (
    GuidanceFact,
    GuidanceSource,
    GuidanceSystem,
    ProductGuidance,
)
from tests.wxproducts.test_authoring import actor as actor
from tests.wxproducts.test_authoring import weather_sessions as weather_sessions
from tests.wxproducts.test_validation import body, complete

EDITION = UUID("6f1d2a3b-0000-4000-8000-000000000001")
BASE = "/api/v1/wxproducts"


def fact(key: str, **values) -> GuidanceFact:
    record = "forecast" if key == "formation_probability" else "analysis"
    return GuidanceFact(key=key, record_type=record, **values)


def system(tracked: UUID | None, *, chance48: float = 20, chance7d: float = 40):
    return GuidanceSystem(
        id=uuid4(),
        tracked_system_id=tracked,
        name="Disturbance 1",
        feature_type="disturbance",
        narrative="A broad area of low pressure.",
        facts=[
            fact("latitude", value=12.4, source_edition_id=EDITION),
            fact("longitude", value=-45.25, source_edition_id=EDITION),
            fact("movement_direction", description="west-northwestward"),
            fact("movement_speed", minimum=10, maximum=15, unit="kt"),
            fact(
                "formation_probability",
                value=chance48,
                unit="percent",
                horizon_hours=48,
                edited=True,
                source_value=10,
            ),
            fact(
                "formation_probability",
                value=chance7d,
                unit="percent",
                horizon_hours=168,
            ),
        ],
    )


def outlook(*systems: GuidanceSystem, action: str = "publish", ago: int = 1, **changes):
    guidance = ProductGuidance(
        sources=[
            GuidanceSource(
                edition_id=EDITION,
                product_key="nhc:twoat",
                title="Tropical Weather Outlook",
                sha256="a" * 64,
            )
        ],
        systems=list(systems),
    )
    values = complete("outlook")
    now = datetime.now(validation.GRENADA)
    values.update(
        issuedAt=(now - timedelta(hours=ago)).strftime("%Y-%m-%dT%H:%M"),
        validFrom=(now - timedelta(hours=ago)).strftime("%Y-%m-%dT%H:%M"),
        validTo=(now + timedelta(days=1)).strftime("%Y-%m-%dT%H:%M"),
        nextUpdate=(now + timedelta(hours=5)).strftime("%Y-%m-%dT%H:%M"),
    )
    return body(
        "outlook",
        action=action,
        guidance=guidance,
        values=values,
        changeSummary="Outlook issue",
        **changes,
    )


async def track(sessions, user: User, **changes) -> UUID:
    async with sessions() as session:
        created = await tropical_systems.create_system(
            session,
            TropicalSystemCreate(
                name="Invest 94L", feature_type="disturbance", season=2026, **changes
            ),
            user,
        )
        return created.id


async def listed(session) -> list[tuple]:
    """What the public list shows: the most recent current published outlook."""
    current = await service.list_published_products(session, "outlook")
    if not current:
        return []
    return await tropical_systems.public_active(
        session, current[0].id, current[0].revision
    )


async def entries(sessions) -> list[tuple]:
    async with sessions() as session:
        rows = (
            await session.execute(
                select(TropicalSystemEntry).order_by(
                    TropicalSystemEntry.product_id,
                    TropicalSystemEntry.revision,
                    TropicalSystemEntry.system_id,
                )
            )
        ).scalars()
        return [
            (
                row.system_id,
                row.product_id,
                row.revision,
                row.action,
                row.issued_at,
                row.name,
                row.feature_type,
                row.nhc_storm_id,
                row.latitude,
                row.longitude,
                row.movement_direction,
                row.movement_speed_kt,
                row.formation_48h,
                row.formation_7d,
                tuple(row.source_edition_ids),
            )
            for row in rows
        ]


def test_entry_extraction_converts_units_and_uses_wave_axis():
    wave = GuidanceSystem(
        id=uuid4(),
        tracked_system_id=uuid4(),
        name="Tropical wave",
        feature_type="tropical_wave",
        facts=[
            fact("axis_longitude", value=-55.0),
            fact("movement_speed", value=23, unit="mph"),
        ],
    )
    untracked = system(None)
    content = {
        "values": {"issuedAt": "2026-09-08T08:00"},
        "guidance": outlook(wave, untracked).guidance.model_dump(mode="json"),
    }
    now = datetime(2026, 9, 8, tzinfo=UTC)
    [row] = tropical_systems.entries_for(
        content, product_id=uuid4(), revision=1, action="draft", created_at=now
    )
    assert row["longitude"] == -55.0 and row["latitude"] is None
    assert row["movement_speed_kt"] == 20.0
    # Grenada local 08:00 is 12:00 UTC.
    assert row["issued_at"] == datetime(2026, 9, 8, 12, tzinfo=UTC)
    assert row["formation_48h"] is None and row["source_edition_ids"] == []


async def test_labels_follow_the_season_sequence(weather_sessions, actor):
    first = await track(weather_sessions, actor)
    second = await track(weather_sessions, actor)
    async with weather_sessions() as session:
        labels = [
            row.label
            for row in await tropical_systems.list_systems(
                session, status=None, season=2026, limit=10, offset=0
            )
        ]
        assert labels == ["GMS 2026-02", "GMS 2026-01"]
        assert (await tropical_systems.get_system(session, first)).sequence == 1
        assert (await tropical_systems.get_system(session, second)).sequence == 2


async def test_live_entries_publish_withdraw_and_rebuild(weather_sessions, actor):
    tracked = await track(weather_sessions, actor)
    draft = outlook(system(tracked), action="draft")
    async with weather_sessions() as session:
        await service.write_product(session, draft, actor)
    async with weather_sessions() as session:
        assert await listed(session) == []
        staff = await tropical_systems.history(session, tracked, published_only=False)
        assert [row.action for row in staff] == ["draft"]
        assert (
            await tropical_systems.get_system(session, tracked)
        ).first_issued_at is None

    published = draft.model_copy(update={"action": "publish", "expectedRevision": 1})
    published.guidance = outlook(system(tracked, chance48=30)).guidance
    async with weather_sessions() as session:
        await service.write_product(session, published, actor)
    async with weather_sessions() as session:
        [(found, latest)] = await listed(session)
        assert found.id == tracked and latest.revision == 2
        assert (latest.formation_48h, latest.formation_7d) == (30, 40)
        assert float(latest.latitude) == 12.4 and float(latest.longitude) == -45.25
        assert latest.movement_direction == "west-northwestward"
        assert float(latest.movement_speed_kt) == 15.0
        assert latest.source_edition_ids == [EDITION]
        system_row = await tropical_systems.get_system(session, tracked)
        assert system_row.first_issued_at == latest.issued_at
        assert system_row.last_issued_at == latest.issued_at

    live = await entries(weather_sessions)
    assert len(live) == 2
    async with weather_sessions() as session:
        assert await tropical_systems.rebuild_entries(session) == 2
        await session.commit()
    assert await entries(weather_sessions) == live

    withdrawn = draft.model_copy(update={"action": "withdraw", "expectedRevision": 2})
    async with weather_sessions() as session:
        await service.write_product(session, withdrawn, actor)
    async with weather_sessions() as session:
        assert await listed(session) == []
        assert (
            await tropical_systems.history(session, tracked, published_only=True) == []
        )
        assert (
            len(await tropical_systems.history(session, tracked, published_only=False))
            == 2
        )
    assert await entries(weather_sessions) == live


@pytest.mark.parametrize("problem", ["unknown", "closed", "duplicate"])
async def test_invalid_links_roll_back_the_revision(weather_sessions, actor, problem):
    tracked = await track(weather_sessions, actor)
    if problem == "closed":
        async with weather_sessions() as session:
            await tropical_systems.update_system(
                session,
                tracked,
                TropicalSystemUpdate(status="closed", closed_reason="dissipated"),
                actor,
            )
    systems = {
        "unknown": [system(uuid4())],
        "closed": [system(tracked)],
        "duplicate": [system(tracked), system(tracked)],
    }[problem]
    payload = outlook(*systems)
    async with weather_sessions() as session:
        with pytest.raises(ProductValidationError):
            await service.write_product(session, payload, actor)
    async with weather_sessions() as session:
        assert (
            await session.scalar(
                text("SELECT count(*) FROM authored_product_revisions")
            )
            == 0
        )


async def test_close_merge_and_reopen_rules(weather_sessions, actor):
    first = await track(weather_sessions, actor)
    second = await track(weather_sessions, actor)
    async with weather_sessions() as session:
        with pytest.raises(ProductValidationError, match="merged into"):
            await tropical_systems.update_system(
                session,
                first,
                TropicalSystemUpdate(status="closed", closed_reason="merged"),
                actor,
            )
    async with weather_sessions() as session:
        with pytest.raises(ProductValidationError, match="itself"):
            await tropical_systems.update_system(
                session,
                first,
                TropicalSystemUpdate(
                    status="closed", closed_reason="merged", continued_as_id=first
                ),
                actor,
            )
    async with weather_sessions() as session:
        merged = await tropical_systems.update_system(
            session,
            first,
            TropicalSystemUpdate(
                status="closed", closed_reason="merged", continued_as_id=second
            ),
            actor,
        )
        assert (merged.status, merged.continued_as_id) == ("closed", second)
    async with weather_sessions() as session:
        reopened = await tropical_systems.update_system(
            session, first, TropicalSystemUpdate(status="active"), actor
        )
        assert (reopened.closed_reason, reopened.continued_as_id) == (None, None)


async def test_routes_enforce_outlook_access_and_publish_only_history(
    async_client: httpx.AsyncClient,
    weather_sessions,
    superuser_token_headers_async: dict[str, str],
    actor,
    monkeypatch,
):
    headers = superuser_token_headers_async
    created = await async_client.post(
        f"{BASE}/tropical-systems",
        headers=headers,
        json={
            "name": "Invest 94L",
            "feature_type": "disturbance",
            "season": 2026,
            "nhc_storm_id": "AL072026",
        },
    )
    assert created.status_code == 201, created.text
    system_id = created.json()["id"]
    assert created.json()["label"] == "GMS 2026-01"
    assert created.json()["nhc_storm_id"] == "al072026"
    duplicate = await async_client.post(
        f"{BASE}/tropical-systems",
        headers=headers,
        json={
            "name": "Copy",
            "feature_type": "disturbance",
            "nhc_storm_id": "al072026",
        },
    )
    assert duplicate.status_code == 409
    renamed = await async_client.patch(
        f"{BASE}/tropical-systems/{system_id}",
        headers=headers,
        json={"name": "Tropical Storm Kirk", "feature_type": "tropical_cyclone"},
    )
    assert (
        renamed.status_code == 200 and renamed.json()["name"] == "Tropical Storm Kirk"
    )
    missing = await async_client.patch(
        f"{BASE}/tropical-systems/{uuid4()}", headers=headers, json={"name": "X"}
    )
    assert missing.status_code == 404
    listed = await async_client.get(
        f"{BASE}/tropical-systems?status=active&season=2026", headers=headers
    )
    assert [row["id"] for row in listed.json()["systems"]] == [system_id]
    too_far = await async_client.get(
        f"{BASE}/tropical-systems?season=9999", headers=headers
    )
    assert too_far.status_code == 422

    async with weather_sessions() as session:
        await service.write_product(
            session, outlook(system(UUID(system_id)), action="draft"), actor
        )
    staff = await async_client.get(
        f"{BASE}/tropical-systems/{system_id}/history", headers=headers
    )
    assert [row["action"] for row in staff.json()["entries"]] == ["draft"]
    assert (await async_client.get(f"{BASE}/public/tropical-systems")).json() == {
        "systems": []
    }
    hidden = await async_client.get(f"{BASE}/public/tropical-systems/{system_id}")
    assert hidden.status_code == 404

    async with weather_sessions() as session:
        await service.write_product(session, outlook(system(UUID(system_id))), actor)
    public = (await async_client.get(f"{BASE}/public/tropical-systems")).json()
    assert [row["label"] for row in public["systems"]] == ["GMS 2026-01"]
    assert public["systems"][0]["latest"]["formation_7d"] == 40
    assert "action" not in public["systems"][0]["latest"]
    detail = await async_client.get(f"{BASE}/public/tropical-systems/{system_id}")
    assert detail.status_code == 200
    assert len(detail.json()["entries"]) == 1
    assert "source_edition_ids" not in detail.text

    async def allowed(*_args):
        return ["morning"]

    monkeypatch.setattr(product_access, "allowed_kinds", allowed)
    for method, path in (
        ("get", f"{BASE}/tropical-systems"),
        ("get", f"{BASE}/tropical-systems/{system_id}/history"),
        ("patch", f"{BASE}/tropical-systems/{system_id}"),
    ):
        kwargs = {"json": {"name": "Denied"}} if method == "patch" else {}
        denied = await getattr(async_client, method)(path, headers=headers, **kwargs)
        assert denied.status_code == 403, path


async def publish(sessions, actor, *systems: GuidanceSystem, ago: int = 1):
    payload = outlook(*systems, ago=ago)
    async with sessions() as session:
        await service.write_product(session, payload, actor)
    return payload


async def public_list(client) -> list[dict]:
    return (await client.get(f"{BASE}/public/tropical-systems")).json()["systems"]


async def test_public_identity_comes_from_the_published_issue(
    async_client: httpx.AsyncClient, weather_sessions, actor
):
    tracked = await track(weather_sessions, actor)
    first = await publish(weather_sessions, actor, system(tracked))
    async with weather_sessions() as session:
        await tropical_systems.update_system(
            session,
            tracked,
            TropicalSystemUpdate(
                name="Tropical Storm Kirk", feature_type="tropical_cyclone"
            ),
            actor,
        )
    [shown] = await public_list(async_client)
    assert (shown["name"], shown["feature_type"]) == ("Disturbance 1", "disturbance")
    detail = (
        await async_client.get(f"{BASE}/public/tropical-systems/{tracked}")
    ).json()
    assert (detail["name"], detail["feature_type"]) == ("Disturbance 1", "disturbance")

    # A closure stays invisible to the list until the current outlook drops it.
    async with weather_sessions() as session:
        await tropical_systems.update_system(
            session,
            tracked,
            TropicalSystemUpdate(status="closed", closed_reason="dissipated"),
            actor,
        )
    assert [row["id"] for row in await public_list(async_client)] == [str(tracked)]

    follow_up = first.model_copy(update={"expectedRevision": 1})
    follow_up.guidance = outlook(system(None)).guidance
    async with weather_sessions() as session:
        await service.write_product(session, follow_up, actor)
    assert await public_list(async_client) == []


async def test_public_list_follows_the_most_recent_current_outlook(
    async_client: httpx.AsyncClient, weather_sessions, actor
):
    kept = await track(weather_sessions, actor)
    dropped = await track(weather_sessions, actor)
    await publish(weather_sessions, actor, system(kept), system(dropped), ago=3)
    assert len(await public_list(async_client)) == 2
    await publish(weather_sessions, actor, system(kept), ago=1)
    assert [row["id"] for row in await public_list(async_client)] == [str(kept)]


async def test_identity_edits_leave_an_append_only_trail(weather_sessions, actor):
    tracked = await track(weather_sessions, actor)
    async with weather_sessions() as session:
        await tropical_systems.update_system(
            session,
            tracked,
            TropicalSystemUpdate(name="Kirk", reason="Named by NHC"),
            actor,
        )
    async with weather_sessions() as session:
        await tropical_systems.update_system(
            session,
            tracked,
            TropicalSystemUpdate(status="closed", closed_reason="dissipated"),
            actor,
        )
    async with weather_sessions() as session:
        # An edit that changes nothing writes nothing.
        await tropical_systems.update_system(
            session, tracked, TropicalSystemUpdate(name="Kirk"), actor
        )
        changes = (
            (
                await session.execute(
                    select(TropicalSystemChange)
                    .where(TropicalSystemChange.system_id == tracked)
                    .order_by(TropicalSystemChange.id)
                )
            )
            .scalars()
            .all()
        )
    assert len(changes) == 2
    rename, close = changes
    assert (rename.before["name"], rename.after["name"]) == ("Invest 94L", "Kirk")
    assert rename.reason == "Named by NHC"
    assert rename.actor_id == str(actor.id) and rename.actor_name
    assert (close.before["status"], close.after["status"]) == ("active", "closed")
    assert close.after["closed_reason"] == "dissipated"


async def test_issue_times_ignore_withdrawn_and_superseded_issues(
    weather_sessions, actor
):
    tracked = await track(weather_sessions, actor)
    first = await publish(weather_sessions, actor, system(tracked), ago=5)
    second = first.model_copy(update={"expectedRevision": 1})
    second.values = outlook(system(tracked), ago=2).values
    async with weather_sessions() as session:
        await service.write_product(session, second, actor)
    async with weather_sessions() as session:
        row = await tropical_systems.get_system(session, tracked)
        # Revision 1 is superseded, so only revision 2 counts.
        assert row.first_issued_at == row.last_issued_at
    withdrawn = second.model_copy(update={"action": "withdraw", "expectedRevision": 2})
    async with weather_sessions() as session:
        await service.write_product(session, withdrawn, actor)
    async with weather_sessions() as session:
        row = await tropical_systems.get_system(session, tracked)
        assert (row.first_issued_at, row.last_issued_at) == (None, None)


def test_nhc_ids_need_a_year_and_the_right_number_range():
    def storm(value: str):
        return TropicalSystemCreate(
            name="X", feature_type="disturbance", nhc_storm_id=value
        )

    def invest(value: str):
        return TropicalSystemCreate(
            name="X", feature_type="disturbance", nhc_invest_id=value
        )

    assert storm("AL072026").nhc_storm_id == "al072026"
    assert invest("al942026").nhc_invest_id == "al942026"
    for bad in ("al07", "al942026", "al002026", "al07202"):
        with pytest.raises(ValueError):
            storm(bad)
    for bad in ("al94", "al072026"):
        with pytest.raises(ValueError):
            invest(bad)


async def test_merge_loops_and_duplicate_targets_are_rejected(weather_sessions, actor):
    a = await track(weather_sessions, actor)
    b = await track(weather_sessions, actor)
    c = await track(weather_sessions, actor)

    async def merge(source: UUID, target: UUID):
        async with weather_sessions() as session:
            return await tropical_systems.update_system(
                session,
                source,
                TropicalSystemUpdate(
                    status="closed", closed_reason="merged", continued_as_id=target
                ),
                actor,
            )

    await merge(a, b)
    await merge(b, c)
    with pytest.raises(ProductValidationError, match="loop"):
        await merge(c, a)
    async with weather_sessions() as session:
        assert (await tropical_systems.get_system(session, c)).status == "active"

    other = await track(weather_sessions, actor)
    async with weather_sessions() as session:
        await tropical_systems.update_system(
            session,
            other,
            TropicalSystemUpdate(status="closed", closed_reason="duplicate"),
            actor,
        )
    with pytest.raises(ProductValidationError, match="duplicate"):
        await merge(c, other)


def speed_content(tracked: UUID, **fact_values) -> dict:
    wave = GuidanceSystem(
        id=uuid4(),
        tracked_system_id=tracked,
        name="Wave",
        feature_type="tropical_wave",
        facts=[fact("movement_speed", **fact_values)],
    )
    return {
        "values": {"issuedAt": "2026-09-08T08:00"},
        "guidance": outlook(wave).guidance.model_dump(mode="json"),
    }


@pytest.mark.parametrize(
    ("unit", "expected"),
    [
        ("knots", 20.0),
        ("KT", 20.0),
        ("kn", 20.0),
        ("MPH", 17.4),
        ("mph", 17.4),
        ("km/h", 10.8),
        ("m/s", 38.9),
        ("M/S", 38.9),
    ],
)
def test_speed_unit_spellings_are_normalised(unit, expected):
    [row] = tropical_systems.entries_for(
        speed_content(uuid4(), value=20, unit=unit),
        product_id=uuid4(),
        revision=1,
        action="draft",
        created_at=datetime(2026, 9, 8, tzinfo=UTC),
    )
    assert row["movement_speed_kt"] == expected


@pytest.mark.parametrize(
    "values", [{"value": 20, "unit": "furlongs"}, {"value": 90000, "unit": "kt"}]
)
async def test_bad_speeds_are_a_validation_error_not_a_server_error(
    weather_sessions, actor, values
):
    tracked = await track(weather_sessions, actor)
    content = speed_content(tracked, **values)
    async with weather_sessions() as session:
        with pytest.raises(ProductValidationError):
            await tropical_systems.record_revision(
                session,
                kind="outlook",
                product_id=uuid4(),
                revision=1,
                action="draft",
                content=content,
                created_at=datetime(2026, 9, 8, tzinfo=UTC),
            )


async def test_linked_systems_are_locked_in_order_without_upgrade(
    weather_sessions, actor
):
    tracked = await track(weather_sessions, actor)
    statements: list[str] = []

    def capture(_conn, _cursor, statement, *_rest):
        statements.append(statement)

    async with weather_sessions() as session:
        engine = session.bind.sync_engine
        event.listen(engine, "before_cursor_execute", capture)
        try:
            await service.write_product(
                session, outlook(system(tracked), action="draft"), actor
            )
        finally:
            event.remove(engine, "before_cursor_execute", capture)
    locks = [
        sql for sql in statements if "FROM tropical_systems" in sql and "FOR " in sql
    ]
    assert locks
    # NO KEY UPDATE is what the issue-time UPDATE needs, so a share lock is never
    # upgraded; the id order keeps concurrent publishes from waiting in a cycle.
    assert all("FOR NO KEY UPDATE" in sql for sql in locks)
    assert all("ORDER BY tropical_systems.id" in sql for sql in locks)
    assert not any("FOR SHARE" in sql for sql in statements)


async def test_route_rejects_an_outlook_that_links_a_closed_system(
    async_client: httpx.AsyncClient,
    weather_sessions,
    superuser_token_headers_async: dict[str, str],
    actor,
):
    tracked = await track(weather_sessions, actor)
    async with weather_sessions() as session:
        await tropical_systems.update_system(
            session,
            tracked,
            TropicalSystemUpdate(status="closed", closed_reason="dissipated"),
            actor,
        )
    linked = GuidanceSystem(
        id=uuid4(),
        tracked_system_id=tracked,
        name="Old system",
        feature_type="disturbance",
        narrative="Dissipating.",
        facts=[fact("latitude", value=12.4)],
    )
    unsourced = outlook(linked)
    # Sourced guidance is checked against WxWatch; this test is about the link.
    unsourced.guidance = ProductGuidance(sources=[], systems=[linked])
    payload = unsourced.model_dump(mode="json")
    response = await async_client.post(
        f"{BASE}/products", headers=superuser_token_headers_async, json=payload
    )
    assert response.status_code == 422, response.text
    assert "closed tracked system" in response.text


@pytest.mark.parametrize("unit", ["m/s", "mps", "kn", "kns"])
def test_speed_units_m_per_s_and_kn_do_not_block_a_draft_save(unit):
    tropical_systems.check_speeds(speed_content(uuid4(), value=10, unit=unit))


def test_oversize_speed_is_refused_live_but_rebuilds_as_null():
    with pytest.raises(ProductValidationError):
        tropical_systems.check_speeds(speed_content(uuid4(), value=90000, unit="kt"))
    # A revision saved before the 500 kt limit existed must rebuild, not overflow.
    [row] = tropical_systems.entries_for(
        speed_content(uuid4(), value=90000, unit="kt"),
        product_id=uuid4(),
        revision=1,
        action="draft",
        created_at=datetime(2026, 9, 8, tzinfo=UTC),
    )
    assert row["movement_speed_kt"] is None


async def test_public_nhc_id_is_the_published_one_until_the_next_publish(
    async_client: httpx.AsyncClient, weather_sessions, actor
):
    tracked = await track(weather_sessions, actor, nhc_storm_id="al072026")
    first = await publish(weather_sessions, actor, system(tracked))
    async with weather_sessions() as session:
        await tropical_systems.update_system(
            session, tracked, TropicalSystemUpdate(nhc_storm_id="al082026"), actor
        )
    [shown] = await public_list(async_client)
    assert shown["nhc_storm_id"] == "al072026"
    detail = (
        await async_client.get(f"{BASE}/public/tropical-systems/{tracked}")
    ).json()
    assert detail["nhc_storm_id"] == "al072026"
    live = await entries(weather_sessions)
    async with weather_sessions() as session:
        await tropical_systems.rebuild_entries(session)
        await session.commit()
    assert await entries(weather_sessions) == live

    follow_up = first.model_copy(update={"expectedRevision": 1})
    follow_up.guidance = outlook(system(tracked)).guidance
    async with weather_sessions() as session:
        await service.write_product(session, follow_up, actor)
    [shown] = await public_list(async_client)
    assert shown["nhc_storm_id"] == "al082026"


async def test_an_unchanged_legacy_nhc_id_passes_but_a_new_bad_one_does_not(
    weather_sessions, actor
):
    tracked = await track(weather_sessions, actor)
    async with weather_sessions() as session:
        await session.execute(
            text("UPDATE tropical_systems SET nhc_storm_id = 'al07' WHERE id = :id"),
            {"id": tracked},
        )
        await session.commit()
    echoed = TropicalSystemUpdate(name="Renamed", nhc_storm_id="al07")
    async with weather_sessions() as session:
        updated = await tropical_systems.update_system(session, tracked, echoed, actor)
    assert (updated.name, updated.nhc_storm_id) == ("Renamed", "al07")
    for bad in ("al08", "", "al942026"):
        async with weather_sessions() as session:
            with pytest.raises(ProductValidationError):
                await tropical_systems.update_system(
                    session, tracked, TropicalSystemUpdate(nhc_storm_id=bad), actor
                )
    async with weather_sessions() as session:
        fixed = await tropical_systems.update_system(
            session, tracked, TropicalSystemUpdate(nhc_storm_id="AL082026"), actor
        )
    assert fixed.nhc_storm_id == "al082026"


async def test_opposite_merges_queue_on_the_chain_lock_and_one_wins(
    weather_sessions, actor
):
    a = await track(weather_sessions, actor)
    b = await track(weather_sessions, actor)

    async def merge(source: UUID, target: UUID):
        async with weather_sessions() as session:
            return await tropical_systems.update_system(
                session,
                source,
                TropicalSystemUpdate(
                    status="closed", closed_reason="merged", continued_as_id=target
                ),
                actor,
            )

    async with weather_sessions() as holder:
        await holder.execute(
            text("SELECT pg_advisory_xact_lock(hashtext('tropical_systems'), :k)"),
            {"k": tropical_systems.CHAIN_LOCK},
        )
        tasks = [asyncio.create_task(merge(a, b)), asyncio.create_task(merge(b, a))]
        await asyncio.sleep(0.5)
        # Both are waiting for the chain lock, so neither has read the chain yet.
        assert not any(task.done() for task in tasks)
        await holder.rollback()
    results = await asyncio.gather(*tasks, return_exceptions=True)
    failures = [r for r in results if isinstance(r, ProductValidationError)]
    assert len(failures) == 1 and "loop" in str(failures[0])
    assert sum(not isinstance(r, BaseException) for r in results) == 1


async def test_latest_current_outlook_is_one_bounded_query(weather_sessions, actor):
    tracked = await track(weather_sessions, actor)
    await publish(weather_sessions, actor, system(tracked), ago=3)
    await publish(weather_sessions, actor, system(tracked), ago=1)
    statements: list[str] = []

    def capture(_conn, _cursor, statement, *_rest):
        statements.append(statement)

    async with weather_sessions() as session:
        engine = session.bind.sync_engine
        event.listen(engine, "before_cursor_execute", capture)
        try:
            current = await service.latest_current_outlook(session)
        finally:
            event.remove(engine, "before_cursor_execute", capture)
        everything = await service.list_published_products(session, "outlook")
    assert current is not None and current.id == everything[0].id
    [sql] = [s for s in statements if "authored_products" in s]
    assert "LIMIT" in sql
    async with weather_sessions() as session:
        later = datetime.now(UTC) + timedelta(days=30)
        assert await service.latest_current_outlook(session, now=later) is None


async def test_an_impossible_stored_date_does_not_break_the_public_list(
    async_client: httpx.AsyncClient, weather_sessions, actor
):
    tracked = await track(weather_sessions, actor)
    await publish(weather_sessions, actor, system(tracked))
    async with weather_sessions() as session:
        await session.execute(
            text(
                "INSERT INTO authored_products (id, kind, draft, revision, published) "
                "SELECT gen_random_uuid(), kind, draft, revision, "
                "jsonb_set(published, '{values,validFrom}', '\"2026-02-30T10:00\"') "
                "FROM authored_products WHERE kind = 'outlook' LIMIT 1"
            )
        )
        await session.commit()
    response = await async_client.get(f"{BASE}/public/tropical-systems")
    assert response.status_code == 200
    assert [row["id"] for row in response.json()["systems"]] == [str(tracked)]


async def test_a_legacy_nhc_id_stored_in_capitals_can_be_echoed_back(
    weather_sessions, actor
):
    tracked = await track(weather_sessions, actor)
    async with weather_sessions() as session:
        await session.execute(
            text("UPDATE tropical_systems SET nhc_storm_id = 'AL07' WHERE id = :id"),
            {"id": tracked},
        )
        await session.commit()
    async with weather_sessions() as session:
        updated = await tropical_systems.update_system(
            session,
            tracked,
            TropicalSystemUpdate(name="Renamed", nhc_storm_id="al07"),
            actor,
        )
    assert updated.name == "Renamed"
