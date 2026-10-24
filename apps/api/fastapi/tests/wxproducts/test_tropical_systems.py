"""Tracked tropical systems: identity, derived entries, rebuild and public history."""

from datetime import UTC, datetime, timedelta
from uuid import UUID, uuid4

import httpx
import pytest
from sqlalchemy import select, text

from src.auth.models import User
from src.baseline import product_access
from src.wxproducts import service, tropical_systems, validation
from src.wxproducts.exceptions import ProductValidationError
from src.wxproducts.models import TropicalSystemEntry
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


def outlook(*systems: GuidanceSystem, action: str = "publish", **changes):
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
        issuedAt=(now - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M"),
        validFrom=(now - timedelta(hours=1)).strftime("%Y-%m-%dT%H:%M"),
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
        assert await tropical_systems.public_active(session) == []
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
        [(found, latest)] = await tropical_systems.public_active(session)
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
        assert await tropical_systems.public_active(session) == []
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
            "nhc_storm_id": "AL942026",
        },
    )
    assert created.status_code == 201, created.text
    system_id = created.json()["id"]
    assert created.json()["label"] == "GMS 2026-01"
    assert created.json()["nhc_storm_id"] == "al942026"
    duplicate = await async_client.post(
        f"{BASE}/tropical-systems",
        headers=headers,
        json={
            "name": "Copy",
            "feature_type": "disturbance",
            "nhc_storm_id": "al942026",
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
