"""Versioned timetable API against a disposable, migrated transport database."""

from collections.abc import AsyncGenerator, Callable
from datetime import timedelta
from pathlib import Path
from uuid import uuid4

import httpx
import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from alembic import command
from src.auth.browser import get_browser_or_token_user
from src.auth.models import Permission, Role, User
from src.main import app
from src.transport.router import get_session
from src.transport.timetable import service

ROOT = Path(__file__).resolve().parents[2]
BASE = "/api/v1/transport"

# v1 rows as they exist before transport_0003 (day types, TIME columns).
V1_SEED = """
INSERT INTO routes (id, number, name, sort_order) VALUES
  (1, 1, 'St. Patrick', 1), (6, 6, 'Mardigras', 6);
INSERT INTO shifts (id, slug, name, start_time, end_time, sort_order) VALUES
  (1, 'morning', 'Morning', '05:30', '14:00', 1);
INSERT INTO stops (id, slug, name, sort_order) VALUES
  (1, 'airport', 'Airport', 1), (2, 'market', 'Market Square', 2),
  (3, 'mardigras', 'Mardigras', 3);
INSERT INTO trips (id, route_id, shift_id, direction, day_type,
                   depart_time, arrive_time, sort_order) VALUES
  (10, 1, 1, 'inbound', 'daily', '04:15', '04:50', 1),
  (60, 6, 1, 'inbound', 'sun_hol', '04:30', '05:30', 1);
INSERT INTO trip_stops (trip_id, stop_id, group_time, sort_order) VALUES
  (10, 2, '04:15', 5), (10, 1, NULL, 9), (60, 3, '04:30', 0);
SELECT setval(pg_get_serial_sequence(name, 'id'), 100)
FROM unnest(ARRAY['routes', 'shifts', 'stops', 'trips', 'trip_stops']) AS name;
"""

MANAGER = (
    "transport.view",
    "transport.timetable.manage",
    "transport.timetable.publish",
)


def _config(connection: Connection, database: str | None) -> Config:
    config = Config(str(ROOT / "src/transport/alembic.ini"))
    config.attributes["expected_database"] = database
    config.attributes["connection"] = connection
    return config


def _user(*keys: str) -> User:
    return User(
        id=uuid4(),
        email="transport@example.test",
        is_active=True,
        is_superuser=False,
        registration_pending=False,
        roles=[Role(name="test", permissions=[Permission(key=key) for key in keys])],
    )


@pytest.fixture
async def api(
    fresh_weather_engine: Engine,
) -> AsyncGenerator[Callable[..., httpx.AsyncClient]]:
    with fresh_weather_engine.begin() as connection:
        config = _config(connection, fresh_weather_engine.url.database)
        command.upgrade(config, "transport_0002")
        connection.execute(text(V1_SEED))
        command.upgrade(config, "head")
    engine = create_async_engine(
        fresh_weather_engine.url.set(drivername="postgresql+asyncpg"),
        poolclass=NullPool,
    )

    async def session() -> AsyncGenerator[AsyncSession]:
        async with AsyncSession(engine, expire_on_commit=False) as value:
            yield value

    app.dependency_overrides[get_session] = session

    def client(*keys: str) -> httpx.AsyncClient:
        user = _user(*keys)
        app.dependency_overrides[get_browser_or_token_user] = lambda: user
        return httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        )

    try:
        yield client
    finally:
        app.dependency_overrides.pop(get_session, None)
        app.dependency_overrides.pop(get_browser_or_token_user, None)
        await engine.dispose()


def _trip(**overrides: object) -> dict[str, object]:
    return {
        "routeId": 1,
        "shiftId": 1,
        "calendarId": 1,
        "direction": "outbound",
        "departTime": "14:10",
        "arriveTime": "15:00",
        "stops": [
            {"stopId": 1, "time": "14:10", "timepoint": True},
            {"stopId": 2, "time": None},
        ],
    } | overrides


async def test_migration_copies_v1_into_a_published_first_version(
    api: Callable[..., httpx.AsyncClient],
) -> None:
    async with api() as client:
        response = await client.get(f"{BASE}/timetable/current")
    assert response.status_code == 200
    body = response.json()
    assert body["version"]["state"] == "current"
    assert body["version"]["status"] == "published"
    # Stamped with Grenada's date, not the database server's UTC date.
    assert body["version"]["effectiveDate"] == service.today().isoformat()
    route1, route6 = body["trips"]
    assert route1["departTime"] == "04:15"
    assert route1["arriveTime"] == "04:50"
    # Group times are kept but marked approximate; order follows v1 sort order.
    assert [(s["stopName"], s["time"], s["timepoint"]) for s in route1["stops"]] == [
        ("Market Square", "04:15", False),
        ("Airport", None, False),
    ]
    assert route1["status"] == "confirmed"
    assert route6["status"] == "awaiting_confirmation"
    assert "Awaiting GAA HR" in route6["notes"]


async def test_v1_spec_is_unchanged_by_the_migration(
    api: Callable[..., httpx.AsyncClient],
) -> None:
    async with api() as client:
        response = await client.get(f"{BASE}/spec")
    assert response.status_code == 200
    assert [route["number"] for route in response.json()] == [1, 6]
    assert response.json()[0]["shifts"][0]["trips"][0]["dayType"] == "daily"


async def test_access_flags_follow_permissions(
    api: Callable[..., httpx.AsyncClient],
) -> None:
    async with api("transport.view", "transport.timetable.manage") as client:
        response = await client.get(f"{BASE}/access")
    assert response.json() == {
        "canView": True,
        "canManageTimetable": True,
        "canPublishTimetable": False,
    }


async def test_versions_need_transport_view_but_published_data_is_open(
    api: Callable[..., httpx.AsyncClient],
) -> None:
    async with api() as client:
        assert (await client.get(f"{BASE}/timetable/versions")).status_code == 403
        assert (await client.get(f"{BASE}/catalogue")).status_code == 200
        assert (await client.get(f"{BASE}/timetable/current")).status_code == 200


async def test_catalogue_lists_registry_and_serving_routes(
    api: Callable[..., httpx.AsyncClient],
) -> None:
    async with api("transport.view") as client:
        body = (await client.get(f"{BASE}/catalogue")).json()
    assert [c["slug"] for c in body["calendars"]] == ["daily", "mon_sat", "sun_hol"]
    sun_hol = body["calendars"][2]
    assert sun_hol["days"] == ["sunday"]
    assert sun_hol["runsOnPublicHolidays"] is True
    stops = {stop["name"]: stop for stop in body["stops"]}
    assert stops["Airport"]["code"] == "AIRPORT"
    assert stops["Airport"]["routeNumbers"] == [1]
    assert stops["Mardigras"]["routeNumbers"] == [6]
    assert body["shifts"][0]["startTime"] == "05:30"


async def test_draft_lifecycle_edit_validate_publish(
    api: Callable[..., httpx.AsyncClient],
) -> None:
    async with api(*MANAGER) as client:
        created = await client.post(
            f"{BASE}/timetable/versions", json={"label": "October revision"}
        )
        assert created.status_code == 201
        draft = created.json()
        draft_id = draft["version"]["id"]
        assert draft["version"]["state"] == "draft"
        assert draft["version"]["basedOnId"] is not None
        assert len(draft["trips"]) == 2

        again = await client.post(f"{BASE}/timetable/versions", json={"label": "x"})
        assert again.status_code == 409

        # Stop times that go backwards block publishing.
        bad = await client.post(
            f"{BASE}/timetable/versions/{draft_id}/trips",
            json=_trip(
                stops=[
                    {"stopId": 1, "time": "14:30"},
                    {"stopId": 2, "time": "14:10"},
                ]
            ),
        )
        assert bad.status_code == 201
        trip_id = bad.json()["id"]
        detail = (await client.get(f"{BASE}/timetable/versions/{draft_id}")).json()
        assert "stop_times_out_of_order" in {
            issue["code"] for issue in detail["issues"]
        }
        today = service.today().isoformat()
        blocked = await client.post(
            f"{BASE}/timetable/versions/{draft_id}/publish",
            json={"effectiveDate": today},
        )
        assert blocked.status_code == 422

        fixed = await client.put(
            f"{BASE}/timetable/versions/{draft_id}/trips/{trip_id}", json=_trip()
        )
        assert fixed.status_code == 200
        assert [stop["stopId"] for stop in fixed.json()["stops"]] == [1, 2]
        assert fixed.json()["stops"][0]["timepoint"] is True

        published = await client.post(
            f"{BASE}/timetable/versions/{draft_id}/publish",
            json={"effectiveDate": today},
        )
        assert published.status_code == 200
        assert published.json()["version"]["state"] == "current"

        versions = (await client.get(f"{BASE}/timetable/versions")).json()
        assert [v["state"] for v in versions] == ["current", "superseded"]
        assert versions[0]["tripCount"] == 3

        # Published versions are read-only.
        locked = await client.delete(
            f"{BASE}/timetable/versions/{draft_id}/trips/{trip_id}"
        )
        assert locked.status_code == 409

        current = (await client.get(f"{BASE}/timetable/current")).json()
        assert current["version"]["label"] == "October revision"


async def test_future_publication_is_scheduled_and_past_dates_are_rejected(
    api: Callable[..., httpx.AsyncClient],
) -> None:
    async with api(*MANAGER) as client:
        draft_id = (
            await client.post(f"{BASE}/timetable/versions", json={"label": "Next"})
        ).json()["version"]["id"]
        yesterday = (service.today() - timedelta(days=1)).isoformat()
        past = await client.post(
            f"{BASE}/timetable/versions/{draft_id}/publish",
            json={"effectiveDate": yesterday},
        )
        assert past.status_code == 422
        future = (service.today() + timedelta(days=7)).isoformat()
        scheduled = await client.post(
            f"{BASE}/timetable/versions/{draft_id}/publish",
            json={"effectiveDate": future},
        )
        assert scheduled.json()["version"]["state"] == "scheduled"
        current = (await client.get(f"{BASE}/timetable/current")).json()
        assert current["version"]["id"] != draft_id


async def test_publishing_needs_its_own_permission(
    api: Callable[..., httpx.AsyncClient],
) -> None:
    async with api("transport.view", "transport.timetable.manage") as client:
        draft_id = (
            await client.post(f"{BASE}/timetable/versions", json={"label": "Draft"})
        ).json()["version"]["id"]
        response = await client.post(
            f"{BASE}/timetable/versions/{draft_id}/publish",
            json={"effectiveDate": service.today().isoformat()},
        )
    assert response.status_code == 403


async def test_discarded_draft_frees_the_draft_slot(
    api: Callable[..., httpx.AsyncClient],
) -> None:
    async with api(*MANAGER) as client:
        draft_id = (
            await client.post(f"{BASE}/timetable/versions", json={"label": "Try"})
        ).json()["version"]["id"]
        discarded = await client.post(f"{BASE}/timetable/versions/{draft_id}/discard")
        assert discarded.json()["state"] == "discarded"
        again = await client.post(f"{BASE}/timetable/versions", json={"label": "Again"})
        assert again.status_code == 201


async def test_trip_references_are_checked(
    api: Callable[..., httpx.AsyncClient],
) -> None:
    async with api(*MANAGER) as client:
        draft_id = (
            await client.post(f"{BASE}/timetable/versions", json={"label": "Refs"})
        ).json()["version"]["id"]
        unknown_stop = await client.post(
            f"{BASE}/timetable/versions/{draft_id}/trips",
            json=_trip(stops=[{"stopId": 999}]),
        )
        assert unknown_stop.status_code == 422
        backwards = await client.post(
            f"{BASE}/timetable/versions/{draft_id}/trips",
            json=_trip(departTime="15:00", arriveTime="14:00"),
        )
        assert backwards.status_code == 422
        night = await client.post(
            f"{BASE}/timetable/versions/{draft_id}/trips",
            json=_trip(departTime="23:30", arriveTime="24:20", stops=[]),
        )
        assert night.status_code == 201
        assert night.json()["arriveTime"] == "24:20"


async def test_stop_registry_create_update_and_conflicts(
    api: Callable[..., httpx.AsyncClient],
) -> None:
    async with api(*MANAGER) as client:
        created = await client.post(
            f"{BASE}/stops",
            json={
                "code": "GRD-01",
                "name": "Grand Anse Roundabout",
                "landmark": "By the fire station",
                "latitude": 12.0231,
                "longitude": -61.7632,
            },
        )
        assert created.status_code == 201
        stop = created.json()
        assert stop["latitude"] == pytest.approx(12.0231)
        duplicate = await client.post(
            f"{BASE}/stops", json={"code": "GRD-01", "name": "Other"}
        )
        assert duplicate.status_code == 409
        half_location = await client.post(
            f"{BASE}/stops", json={"code": "X1", "name": "X", "latitude": 12.0}
        )
        assert half_location.status_code == 422
        updated = await client.put(
            f"{BASE}/stops/{stop['id']}",
            json={"code": "GRD-01", "name": "Grand Anse", "active": False},
        )
        assert updated.json()["active"] is False
        assert updated.json()["latitude"] is None

    async with api("transport.view") as client:
        denied = await client.post(f"{BASE}/stops", json={"code": "Y", "name": "Y"})
    assert denied.status_code == 403


async def test_route_registry_rejects_duplicate_numbers(
    api: Callable[..., httpx.AsyncClient],
) -> None:
    async with api(*MANAGER) as client:
        created = await client.post(
            f"{BASE}/routes",
            json={"number": 7, "name": "Sauteurs", "description": "Via Grenville"},
        )
        assert created.status_code == 201
        duplicate = await client.post(f"{BASE}/routes", json={"number": 1, "name": "X"})
        assert duplicate.status_code == 409


def test_seeding_a_fresh_database_fills_the_first_version(
    fresh_weather_engine: Engine,
) -> None:
    import psycopg

    from scripts.seed_catalogues import seed_transport

    with fresh_weather_engine.begin() as connection:
        command.upgrade(_config(connection, fresh_weather_engine.url.database), "head")
    url = fresh_weather_engine.url.set(drivername="postgresql")
    with psycopg.connect(url.render_as_string(hide_password=False)) as conn:
        seed_transport(conn, apply=True)
        v1_trips, v1_stops = conn.execute(
            "SELECT (SELECT count(*) FROM trips), (SELECT count(*) FROM trip_stops)"
        ).fetchone()
        trips, stop_times, awaiting, uncoded = conn.execute(
            "SELECT (SELECT count(*) FROM timetable_trips),"
            " (SELECT count(*) FROM timetable_stop_times),"
            " (SELECT count(*) FROM timetable_trips"
            "  WHERE status = 'awaiting_confirmation'),"
            " (SELECT count(*) FROM stops WHERE code IS NULL)"
        ).fetchone()
        # Seeding twice preserves the timetable.
        seed_transport(conn, apply=True)
        again = conn.execute("SELECT count(*) FROM timetable_trips").fetchone()
    assert v1_trips > 0
    assert (trips, stop_times) == (v1_trips, v1_stops)
    assert awaiting > 0
    assert uncoded == 0
    assert again == (trips,)
