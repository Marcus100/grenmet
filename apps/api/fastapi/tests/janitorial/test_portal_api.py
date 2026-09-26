"""Janitorial portal API: access, catalogue edits, people, scope and shifts."""

from collections.abc import AsyncGenerator, Callable, Collection
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

import httpx
import pytest
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from alembic import command
from src.auth.browser import get_browser_or_token_user
from src.auth.models import Permission, Role, User
from src.dependencies import get_db
from src.janitorial.people import service as people_service
from src.janitorial.router import get_session
from src.main import app

ROOT = Path(__file__).resolve().parents[2]
BASE = "/api/v1/janitorial"

SEED = """
INSERT INTO buildings (id, name, code, sort_order, site_id, kind) VALUES
  (1, 'Terminal', 'terminal', 1, 1, 'terminal'),
  (2, 'Tower', 'tower', 2, 1, 'auxiliary');
INSERT INTO areas (id, building_id, name, sort_order) VALUES
  (10, 1, 'Restrooms', 1), (11, 1, 'Check-in Hall', 2), (20, 2, 'Whole building', 1);
INSERT INTO activities (id, slug, name) VALUES (1, 'clean-mirrors', 'Clean Mirrors');
INSERT INTO area_tasks (id, area_id, activity_id, freq_count, freq_period_value,
                        freq_period_unit) VALUES (100, 10, 1, 1, 15, 'minute');
SELECT setval(pg_get_serial_sequence(name, 'id'), 1000)
FROM unnest(ARRAY['buildings', 'areas', 'activities', 'area_tasks']) AS name;
"""

MANAGER = (
    "janitorial.view",
    "janitorial.catalogue.manage",
    "janitorial.staff.manage",
    "janitorial.shifts.manage",
    "janitorial.scope.manage",
)
SUPERVISOR = ("janitorial.view", "janitorial.shifts.manage")


class Accounts:
    """Stand-in for Barrels Login lookups through the auth service."""

    def __init__(self) -> None:
        self.by_email: dict[str, User] = {}

    def add(self, email: str, first: str, last: str) -> User:
        user = User(
            id=uuid4(),
            email=email,
            first_name=first,
            last_name=last,
            is_active=True,
        )
        self.by_email[email] = user
        return user

    async def get_user_by_email(self, *, session: Any, email: str) -> User | None:
        return self.by_email.get(email)

    async def get_user_by_id(self, *, session: Any, user_id: UUID) -> User | None:
        return next((u for u in self.by_email.values() if u.id == user_id), None)

    async def get_users_by_ids(
        self, *, session: Any, user_ids: Collection[UUID]
    ) -> dict[UUID, User]:
        return {u.id: u for u in self.by_email.values() if u.id in set(user_ids)}


def _user(*keys: str, user_id: UUID | None = None) -> User:
    return User(
        id=user_id or uuid4(),
        email="gaa@example.test",
        is_active=True,
        is_superuser=False,
        registration_pending=False,
        roles=[Role(name="test", permissions=[Permission(key=key) for key in keys])],
    )


@pytest.fixture
def accounts(monkeypatch: pytest.MonkeyPatch) -> Accounts:
    fake = Accounts()
    monkeypatch.setattr(people_service, "auth_service", fake)
    return fake


@pytest.fixture
async def api(
    fresh_weather_engine: Engine,
) -> AsyncGenerator[Callable[..., httpx.AsyncClient]]:
    config = Config(str(ROOT / "src/janitorial/alembic.ini"))
    config.attributes["expected_database"] = fresh_weather_engine.url.database
    with fresh_weather_engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
        connection.execute(text(SEED))
    engine = create_async_engine(
        fresh_weather_engine.url.set(drivername="postgresql+asyncpg"),
        poolclass=NullPool,
    )

    async def session() -> AsyncGenerator[AsyncSession]:
        async with AsyncSession(engine, expire_on_commit=False) as value:
            yield value

    async def no_main_db() -> AsyncGenerator[None]:
        yield None

    app.dependency_overrides[get_session] = session
    app.dependency_overrides[get_db] = no_main_db

    def client(*keys: str, user_id: UUID | None = None) -> httpx.AsyncClient:
        user = _user(*keys, user_id=user_id)
        app.dependency_overrides[get_browser_or_token_user] = lambda: user
        return httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://test"
        )

    try:
        yield client
    finally:
        for dependency in (get_session, get_db, get_browser_or_token_user):
            app.dependency_overrides.pop(dependency, None)
        await engine.dispose()


async def test_access_flags_follow_permissions_and_grants(
    api: Callable[..., httpx.AsyncClient],
) -> None:
    async with api(*MANAGER) as client:
        manager = (await client.get(f"{BASE}/access")).json()
    async with api(*SUPERVISOR) as client:
        supervisor = (await client.get(f"{BASE}/access")).json()
    assert manager["canManageScope"] is True
    assert manager["buildingIds"] is None
    assert supervisor == {
        "canView": True,
        "canManageCatalogue": False,
        "canManageStaff": False,
        "canManageShifts": True,
        "canManageScope": False,
        "buildingIds": [],
    }


async def test_catalogue_needs_view_and_is_scoped_to_granted_buildings(
    api: Callable[..., httpx.AsyncClient], accounts: Accounts
) -> None:
    async with api() as client:
        assert (await client.get(f"{BASE}/catalogue")).status_code == 403

    supervisor = accounts.add("sup@gaa.example.com", "Sam", "Supervisor")
    async with api(*SUPERVISOR, user_id=supervisor.id) as client:
        before = (await client.get(f"{BASE}/catalogue")).json()
    assert before["buildings"] == []
    assert [site["code"] for site in before["sites"]] == ["GND", "CRU"]

    async with api(*MANAGER) as client:
        granted = await client.post(
            f"{BASE}/grants", json={"email": "sup@gaa.example.com", "buildingIds": [2]}
        )
    assert granted.status_code == 201

    async with api(*SUPERVISOR, user_id=supervisor.id) as client:
        after = (await client.get(f"{BASE}/catalogue", params={"site": "gnd"})).json()
    (tower,) = after["buildings"]
    assert tower["name"] == "Tower"
    assert tower["areas"][0]["code"] == "GND-A0020"


async def test_catalogue_returns_area_attributes_and_tasks(
    api: Callable[..., httpx.AsyncClient],
) -> None:
    async with api(*MANAGER) as client:
        response = await client.get(f"{BASE}/catalogue", params={"site": "GND"})
    terminal = response.json()["buildings"][0]
    restrooms = terminal["areas"][0]
    assert restrooms["spaceType"] == "restroom"
    assert restrooms["cleanlinessLevel"] == 1
    assert restrooms["tasks"][0] == {
        "id": 100,
        "activity": "Clean Mirrors",
        "frequency": {"count": 1, "periodValue": 15, "periodUnit": "minute"},
        "mode": None,
        "active": True,
        "revision": 1,
    }
    assert terminal["areas"][1]["spaceType"] == "concourse"


async def test_lauriston_can_be_built_in_the_portal(
    api: Callable[..., httpx.AsyncClient],
) -> None:
    async with api(*MANAGER) as client:
        building = await client.post(
            f"{BASE}/buildings",
            json={"siteId": 2, "name": "Lauriston Terminal", "kind": "terminal"},
        )
        assert building.status_code == 201
        building_id = building.json()["id"]
        section = await client.post(
            f"{BASE}/sections", json={"buildingId": building_id, "name": "Arrivals"}
        )
        area = await client.post(
            f"{BASE}/areas",
            json={
                "buildingId": building_id,
                "sectionId": section.json()["id"],
                "name": "Washrooms",
            },
        )
        assert area.status_code == 201
        task = await client.post(
            f"{BASE}/areas/{area.json()['id']}/tasks",
            json={
                "activity": "clean mirrors",
                "frequency": {"count": 2, "periodValue": 1, "periodUnit": "day"},
            },
        )
        catalogue = (await client.get(f"{BASE}/catalogue?site=CRU")).json()

    created = area.json()
    assert created["code"].startswith("CRU-A")
    assert (created["spaceType"], created["cleanlinessLevel"]) == ("restroom", 1)
    # Activities are matched by slug, not duplicated from free text.
    assert task.json()["activity"] == "Clean Mirrors"
    assert [b["name"] for b in catalogue["buildings"]] == ["Lauriston Terminal"]


async def test_supervisors_cannot_add_buildings_or_edit_other_buildings(
    api: Callable[..., httpx.AsyncClient], accounts: Accounts
) -> None:
    editor = accounts.add("ed@gaa.example.com", "Eve", "Editor")
    keys = ("janitorial.view", "janitorial.catalogue.manage")
    async with api(*MANAGER) as client:
        await client.post(
            f"{BASE}/grants", json={"email": "ed@gaa.example.com", "buildingIds": [1]}
        )
    async with api(*keys, user_id=editor.id) as client:
        new_building = await client.post(
            f"{BASE}/buildings", json={"siteId": 1, "name": "Hangar"}
        )
        tower_area = await client.patch(
            f"{BASE}/areas/20",
            json={
                "sectionId": None,
                "name": "Tower",
                "spaceType": "technical",
                "cleanlinessLevel": 3,
                "quantity": 1,
                "active": True,
                "expectedRevision": 1,
            },
        )
        terminal_area = await client.patch(
            f"{BASE}/areas/11",
            json={
                "sectionId": None,
                "name": "Check-in Hall",
                "spaceType": "concourse",
                "cleanlinessLevel": 2,
                "quantity": 1,
                "active": True,
                "expectedRevision": 1,
            },
        )
    assert new_building.status_code == 403
    assert tower_area.status_code == 403
    assert terminal_area.status_code == 200
    assert terminal_area.json()["revision"] == 2


async def test_stale_revisions_conflict_and_history_is_recorded(
    api: Callable[..., httpx.AsyncClient], fresh_weather_engine: Engine
) -> None:
    body = {
        "sectionId": None,
        "name": "Restrooms (Arrivals)",
        "spaceType": "restroom",
        "cleanlinessLevel": 1,
        "quantity": 4,
        "active": True,
        "expectedRevision": 1,
    }
    async with api(*MANAGER) as client:
        first = await client.patch(f"{BASE}/areas/10", json=body)
        stale = await client.patch(f"{BASE}/areas/10", json={**body, "quantity": 5})
        retired = await client.patch(
            f"{BASE}/areas/10", json={**body, "active": False, "expectedRevision": 2}
        )
    assert first.status_code == 200
    assert stale.status_code == 409
    assert retired.json()["active"] is False
    with fresh_weather_engine.connect() as connection:
        events = connection.execute(
            text("""
                SELECT revision, changes FROM change_events
                WHERE entity = 'area' AND entity_id = '10' ORDER BY revision
            """)
        ).all()
        still_there = connection.execute(
            text("SELECT count(*) FROM areas WHERE id = 10")
        ).scalar_one()
    assert [revision for revision, _ in events] == [2, 3]
    assert events[0][1]["quantity"] == [1, 4]
    assert still_there == 1


async def test_staff_are_added_by_barrels_login_email(
    api: Callable[..., httpx.AsyncClient], accounts: Accounts
) -> None:
    accounts.add("maria@cleanco.example.com", "Maria", "Joseph")
    async with api(*MANAGER) as client:
        contractor = await client.post(f"{BASE}/contractors", json={"name": "CleanCo"})
        contractor_id = contractor.json()["id"]
        missing = await client.post(
            f"{BASE}/staff",
            json={"email": "nobody@cleanco.example.com", "contractorId": contractor_id},
        )
        added = await client.post(
            f"{BASE}/staff",
            json={
                "email": "maria@cleanco.example.com",
                "contractorId": contractor_id,
                "badgeNo": "C-014",
            },
        )
        again = await client.post(
            f"{BASE}/staff",
            json={"email": "maria@cleanco.example.com", "contractorId": contractor_id},
        )
        listing = (await client.get(f"{BASE}/staff")).json()
    assert missing.status_code == 404
    assert "Create the account first" in missing.json()["detail"]
    assert added.status_code == 201
    assert added.json()["name"] == "Maria Joseph"
    assert again.status_code == 409
    assert listing["contractors"][0]["name"] == "CleanCo"
    assert listing["staff"][0]["badgeNo"] == "C-014"


async def test_grants_are_listed_and_revoked(
    api: Callable[..., httpx.AsyncClient], accounts: Accounts
) -> None:
    accounts.add("sup@gaa.example.com", "Sam", "Supervisor")
    async with api(*MANAGER) as client:
        created = await client.post(
            f"{BASE}/grants",
            json={"email": "sup@gaa.example.com", "buildingIds": [1, 2]},
        )
        repeat = await client.post(
            f"{BASE}/grants", json={"email": "sup@gaa.example.com", "buildingIds": [1]}
        )
        grant_id = created.json()[0]["id"]
        revoked = await client.post(f"{BASE}/grants/{grant_id}/revoke")
        listing = (await client.get(f"{BASE}/grants")).json()
    async with api(*SUPERVISOR) as client:
        forbidden = await client.get(f"{BASE}/grants")
    assert [grant["buildingId"] for grant in created.json()] == [1, 2]
    assert repeat.json() == []
    assert revoked.status_code == 204
    assert [grant["buildingId"] for grant in listing] == [2]
    assert forbidden.status_code == 403


async def test_shift_board_patterns_zones_and_assignments(
    api: Callable[..., httpx.AsyncClient], accounts: Accounts
) -> None:
    accounts.add("maria@cleanco.example.com", "Maria", "Joseph")
    async with api(*MANAGER) as client:
        contractor = await client.post(f"{BASE}/contractors", json={"name": "CleanCo"})
        staff = await client.post(
            f"{BASE}/staff",
            json={
                "email": "maria@cleanco.example.com",
                "contractorId": contractor.json()["id"],
            },
        )
        night = await client.post(
            f"{BASE}/shift-patterns",
            json={"siteId": 1, "name": "Night", "startsAt": "22:00", "endsAt": "06:00"},
        )
        wrong_site = await client.post(
            f"{BASE}/zones", json={"siteId": 2, "name": "Bad", "areaIds": [10]}
        )
        zone = await client.post(
            f"{BASE}/zones",
            json={"siteId": 1, "name": "Terminal restrooms", "areaIds": [10, 11]},
        )
        assignment = {
            "workDate": "2026-10-05",
            "shiftPatternId": night.json()["id"],
            "staffId": staff.json()["id"],
            "zoneId": zone.json()["id"],
        }
        first = await client.post(f"{BASE}/shift-assignments", json=assignment)
        double = await client.post(f"{BASE}/shift-assignments", json=assignment)
        cancelled = await client.patch(
            f"{BASE}/shift-assignments/{first.json()['id']}",
            json={
                "shiftPatternId": night.json()["id"],
                "zoneId": zone.json()["id"],
                "status": "cancelled",
                "expectedRevision": 1,
            },
        )
        rebooked = await client.post(f"{BASE}/shift-assignments", json=assignment)
        board = (
            await client.get(
                f"{BASE}/shifts",
                params={"site": "GND", "from": "2026-10-05", "to": "2026-10-11"},
            )
        ).json()
        too_long = await client.get(
            f"{BASE}/shifts",
            params={"site": "GND", "from": "2026-10-01", "to": "2027-01-01"},
        )
    assert night.json()["endsAt"] == "06:00"
    assert wrong_site.status_code == 422
    assert zone.json()["areaIds"] == [10, 11]
    assert first.status_code == 201
    assert double.status_code == 409
    assert cancelled.json()["status"] == "cancelled"
    assert rebooked.status_code == 201
    assert sorted(row["status"] for row in board["assignments"]) == [
        "cancelled",
        "scheduled",
    ]
    assert too_long.status_code == 422


async def test_supervisors_only_see_and_manage_zones_in_their_buildings(
    api: Callable[..., httpx.AsyncClient], accounts: Accounts
) -> None:
    supervisor = accounts.add("sup@gaa.example.com", "Sam", "Supervisor")
    async with api(*MANAGER) as client:
        await client.post(
            f"{BASE}/zones", json={"siteId": 1, "name": "Terminal", "areaIds": [10]}
        )
        await client.post(
            f"{BASE}/zones", json={"siteId": 1, "name": "Tower", "areaIds": [20]}
        )
        await client.post(
            f"{BASE}/grants", json={"email": "sup@gaa.example.com", "buildingIds": [1]}
        )
    async with api(*SUPERVISOR, user_id=supervisor.id) as client:
        board = (
            await client.get(
                f"{BASE}/shifts",
                params={"site": "GND", "from": "2026-10-05", "to": "2026-10-05"},
            )
        ).json()
        out_of_scope = await client.post(
            f"{BASE}/zones", json={"siteId": 1, "name": "Mixed", "areaIds": [10, 20]}
        )
    assert [zone["name"] for zone in board["zones"]] == ["Terminal"]
    assert out_of_scope.status_code == 403
