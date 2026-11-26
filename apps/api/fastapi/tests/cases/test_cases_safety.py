"""Case engine, safety programme (ADR-0069): lifecycle, risk rules, actions, access."""

import uuid
from datetime import date, timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.notifications.models import Notification
from src.organisations.models import (
    Membership,
    MembershipGrant,
    MembershipRole,
    new_grant_id,
)
from src.utils.datetime import utc_now
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

API = "/api/v1/cases/org/safety"

pytestmark = pytest.mark.asyncio


async def _grant(db: AsyncSession, org_id: str, user: User, role_key: str) -> None:
    membership = await db.scalar(
        select(Membership).where(
            Membership.organisation_id == org_id, Membership.user_id == user.id
        )
    )
    assert membership is not None
    db.add(
        MembershipGrant(
            id=new_grant_id(),
            membership_id=membership.id,
            organisation_id=org_id,
            role_key=role_key,
            granted_at=utc_now(),
        )
    )
    await db.commit()


class World:
    def __init__(self, org_id: str, users: list[User]) -> None:
        self.org_id = org_id
        self.owner, self.officer, self.manager, self.plain = users

    def h(self, user: User) -> dict[str, str]:
        return headers_for(user, self.org_id)


async def _world(db: AsyncSession, *, apps: tuple[str, ...] = ("safety",)) -> World:
    users = [await make_user(db) for _ in range(4)]
    org = await make_org(
        db,
        f"Airport {uuid.uuid4().hex[:6]}",
        members=(
            (users[0], MembershipRole.OWNER),
            (users[1], MembershipRole.MEMBER),
            (users[2], MembershipRole.MEMBER),
            (users[3], MembershipRole.MEMBER),
        ),
        apps=apps,
    )
    if "safety" in apps:
        await _grant(db, org.id, users[1], "safety-officer")
        await _grant(db, org.id, users[2], "safety-manager")
    return World(org.id, users)


async def _case(client: httpx.AsyncClient, world: World) -> dict[str, object]:
    made = await client.post(
        f"{API}/cases",
        headers=world.h(world.officer),
        json={"title": "Loose pavement on taxiway B", "location": "Taxiway B"},
    )
    assert made.status_code == 201, made.text
    body: dict[str, object] = made.json()
    return body


async def _assess(
    client: httpx.AsyncClient,
    world: World,
    case_id: object,
    kind: str,
    likelihood: int,
    severity: str,
) -> dict[str, object]:
    made = await client.post(
        f"{API}/cases/{case_id}/risk-assessments",
        headers=world.h(world.officer),
        json={"kind": kind, "likelihood": likelihood, "severity": severity},
    )
    assert made.status_code == 201, made.text
    body: dict[str, object] = made.json()
    return body


async def _status(
    client: httpx.AsyncClient, world: World, user: User, case_id: object, **body: object
) -> httpx.Response:
    return await client.post(
        f"{API}/cases/{case_id}/status", headers=world.h(user), json=body
    )


async def test_default_grid_is_the_icao_example_and_can_be_replaced(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    grid = (
        await async_client.get(f"{API}/risk-grid", headers=world.h(world.officer))
    ).json()
    assert grid["custom"] is False
    assert len(grid["cells"]) == 25
    assert grid["cells"]["5A"] == "intolerable"
    assert grid["cells"]["3A"] == "intolerable"
    assert grid["cells"]["3B"] == "tolerable"
    assert grid["cells"]["1A"] == "tolerable"
    assert grid["cells"]["1E"] == "acceptable"

    small = {
        "likelihoods": [{"value": 2, "label": "Likely"}, {"value": 1, "label": "Rare"}],
        "severities": [
            {"code": "A", "label": "Severe"},
            {"code": "B", "label": "Minor"},
        ],
        "cells": {
            "2A": "intolerable",
            "2B": "tolerable",
            "1A": "tolerable",
            "1B": "acceptable",
        },
    }
    refused = await async_client.put(
        f"{API}/risk-grid", headers=world.h(world.officer), json=small
    )
    assert refused.status_code == 403
    incomplete = await async_client.put(
        f"{API}/risk-grid",
        headers=world.h(world.manager),
        json={**small, "cells": {"2A": "intolerable"}},
    )
    assert incomplete.status_code == 422
    saved = await async_client.put(
        f"{API}/risk-grid", headers=world.h(world.manager), json=small
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["custom"] is True

    # An assessment keeps the labels it was made with after the grid changes again.
    case = await _case(async_client, world)
    first = await _assess(async_client, world, case["id"], "initial", 2, "A")
    assert (first["index"], first["band"], first["severity_label"]) == (
        "2A",
        "intolerable",
        "Severe",
    )
    off_grid = await async_client.post(
        f"{API}/cases/{case['id']}/risk-assessments",
        headers=world.h(world.officer),
        json={"kind": "initial", "likelihood": 5, "severity": "A"},
    )
    assert off_grid.status_code == 422


async def test_case_closes_only_under_the_risk_rules(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    case = await _case(async_client, world)
    case_id = case["id"]
    assert case["reference"] == f"SAF-{utc_now().year}-0001"
    assert case["status"] == "reported"

    moved = await _status(
        async_client, world, world.officer, case_id, status="assessing"
    )
    assert moved.status_code == 200, moved.text
    skipped = await _status(
        async_client, world, world.officer, case_id, status="monitoring"
    )
    assert skipped.status_code == 409
    # An officer cannot close; the manager cannot close without a residual risk.
    assert (
        await _status(async_client, world, world.officer, case_id, status="closed")
    ).status_code == 403
    assert (
        await _status(async_client, world, world.manager, case_id, status="closed")
    ).status_code == 409

    await _assess(async_client, world, case_id, "initial", 4, "B")
    intolerable = await _assess(async_client, world, case_id, "residual", 3, "A")
    assert intolerable["band"] == "intolerable"
    never = await async_client.post(
        f"{API}/cases/{case_id}/risk-assessments/{intolerable['id']}/acceptance",
        headers=world.h(world.manager),
        json={"note": "We accept it"},
    )
    assert never.status_code == 409
    assert (
        await _status(async_client, world, world.manager, case_id, status="closed")
    ).status_code == 409

    tolerable = await _assess(async_client, world, case_id, "residual", 3, "C")
    assert tolerable["band"] == "tolerable"
    assert (
        await _status(async_client, world, world.manager, case_id, status="closed")
    ).status_code == 409
    by_officer = await async_client.post(
        f"{API}/cases/{case_id}/risk-assessments/{tolerable['id']}/acceptance",
        headers=world.h(world.officer),
        json={"note": "ok"},
    )
    assert by_officer.status_code == 403
    stale = await async_client.post(
        f"{API}/cases/{case_id}/risk-assessments/{intolerable['id']}/acceptance",
        headers=world.h(world.manager),
        json={"note": "old one"},
    )
    assert stale.status_code == 409
    accepted = await async_client.post(
        f"{API}/cases/{case_id}/risk-assessments/{tolerable['id']}/acceptance",
        headers=world.h(world.manager),
        json={"note": "Repaired; inspections doubled for a month"},
    )
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["accepted_by"] == str(world.manager.id)

    closed = await _status(async_client, world, world.manager, case_id, status="closed")
    assert closed.status_code == 200, closed.text
    assert closed.json()["closed_no_risk"] is False
    # Closed means locked.
    locked = await async_client.patch(
        f"{API}/cases/{case_id}", headers=world.h(world.officer), json={"title": "x"}
    )
    assert locked.status_code == 409
    assert (
        await async_client.post(
            f"{API}/cases/{case_id}/risk-assessments",
            headers=world.h(world.officer),
            json={"kind": "residual", "likelihood": 1, "severity": "E"},
        )
    ).status_code == 409
    # Reopening needs a reason and the approve key.
    assert (
        await _status(async_client, world, world.manager, case_id, status="assessing")
    ).status_code == 422
    reopened = await _status(
        async_client,
        world,
        world.manager,
        case_id,
        status="assessing",
        reason="Recurred",
    )
    assert reopened.status_code == 200
    assert reopened.json()["closed_at"] is None


async def test_no_risk_closing_and_acceptable_risk(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    first = await _case(async_client, world)
    needs_reason = await _status(
        async_client, world, world.manager, first["id"], status="closed", no_risk=True
    )
    assert needs_reason.status_code == 422
    closed = await _status(
        async_client,
        world,
        world.manager,
        first["id"],
        status="closed",
        no_risk=True,
        reason="Reported object was a shadow; inspected, nothing found",
    )
    assert closed.status_code == 200, closed.text
    assert closed.json()["closed_no_risk"] is True

    second = await _case(async_client, world)
    assert second["reference"] == f"SAF-{utc_now().year}-0002"
    await _status(async_client, world, world.officer, second["id"], status="assessing")
    acceptable = await _assess(async_client, world, second["id"], "residual", 1, "E")
    assert acceptable["band"] == "acceptable"
    needless = await async_client.post(
        f"{API}/cases/{second['id']}/risk-assessments/{acceptable['id']}/acceptance",
        headers=world.h(world.manager),
        json={"note": "fine"},
    )
    assert needless.status_code == 409
    done = await _status(
        async_client, world, world.manager, second["id"], status="closed"
    )
    assert done.status_code == 200, done.text


async def test_corrective_actions_block_closing_until_verified(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    case = await _case(async_client, world)
    case_id = case["id"]
    await _status(async_client, world, world.officer, case_id, status="assessing")
    await _assess(async_client, world, case_id, "residual", 1, "E")
    outsider = await make_user(db_async)
    due = (date.today() - timedelta(days=1)).isoformat()
    bad_owner = await async_client.post(
        f"{API}/cases/{case_id}/actions",
        headers=world.h(world.manager),
        json={"title": "Repair", "owner_user_id": str(outsider.id), "due_date": due},
    )
    assert bad_owner.status_code == 422
    made = await async_client.post(
        f"{API}/cases/{case_id}/actions",
        headers=world.h(world.manager),
        json={
            "title": "Repair pavement",
            "owner_user_id": str(world.officer.id),
            "due_date": due,
        },
    )
    assert made.status_code == 201, made.text
    action = made.json()
    assert action["overdue"] is True
    told = (
        await db_async.scalars(
            select(Notification.event_key).where(
                Notification.recipient_user_id == world.officer.id,
                Notification.entity_id == action["id"],
            )
        )
    ).all()
    assert list(told) == ["cases.action_assigned"]

    path = f"{API}/cases/{case_id}/actions/{action['id']}"
    assert (
        await _status(async_client, world, world.manager, case_id, status="closed")
    ).status_code == 409
    early = await async_client.post(
        f"{path}/status", headers=world.h(world.manager), json={"status": "verified"}
    )
    assert early.status_code == 409
    done = await async_client.post(
        f"{path}/status", headers=world.h(world.officer), json={"status": "done"}
    )
    assert done.status_code == 200
    assert done.json()["overdue"] is False
    # The owner cannot verify their own action, and an officer has no approve key.
    own = await async_client.post(
        f"{path}/status", headers=world.h(world.officer), json={"status": "verified"}
    )
    assert own.status_code == 403
    verified = await async_client.post(
        f"{path}/status", headers=world.h(world.manager), json={"status": "verified"}
    )
    assert verified.status_code == 200, verified.text
    frozen = await async_client.patch(
        path, headers=world.h(world.officer), json={"title": "Changed"}
    )
    assert frozen.status_code == 409
    closed = await _status(async_client, world, world.manager, case_id, status="closed")
    assert closed.status_code == 200, closed.text
    detail = closed.json()
    assert [a["status"] for a in detail["actions"]] == ["verified"]


async def test_access_other_organisations_and_programmes(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    a = await _world(db_async)
    b = await _world(db_async)
    case = await _case(async_client, a)
    for method, suffix, body in (
        ("GET", "", None),
        ("PATCH", "", {"title": "x"}),
        ("POST", "/status", {"status": "assessing"}),
        (
            "POST",
            "/risk-assessments",
            {"kind": "initial", "likelihood": 1, "severity": "E"},
        ),
    ):
        response = await async_client.request(
            method, f"{API}/cases/{case['id']}{suffix}", headers=b.h(b.owner), json=body
        )
        assert response.status_code == 404, (method, suffix)
    assert (await async_client.get(f"{API}/cases", headers=b.h(b.owner))).json()[
        "data"
    ] == []
    assert (
        await async_client.get(f"{API}/cases", headers=headers_for(b.owner, a.org_id))
    ).status_code == 404
    superuser = await make_user(db_async, superuser=True)
    assert (
        await async_client.get(f"{API}/cases", headers=headers_for(superuser, a.org_id))
    ).status_code == 404
    assert (
        await async_client.get(f"{API}/cases", headers=a.h(a.plain))
    ).status_code == 403
    # Programmes that are not products yet, and unknown ones, do not exist.
    for programme in ("aviation-security", "occupational-health", "nonsense"):
        other = await async_client.get(
            f"/api/v1/cases/org/{programme}/cases", headers=a.h(a.owner)
        )
        assert other.status_code == 404, programme
    unentitled = await _world(db_async, apps=())
    assert (
        await async_client.get(f"{API}/cases", headers=unentitled.h(unentitled.owner))
    ).status_code == 403


async def test_case_raised_from_an_incident_the_reporter_can_see(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async, apps=("safety", "incidents"))
    incident = (
        await async_client.post(
            "/api/v1/incidents/org/incidents",
            headers=world.h(world.owner),
            json={"title": "Tug struck stand"},
        )
    ).json()
    source = {"kind": "incidents.incident", "id": incident["id"]}
    # The officer holds no incidents key: the incident is not available to them.
    hidden = await async_client.post(
        f"{API}/cases",
        headers=world.h(world.officer),
        json={"title": "Stand layout", "source": source},
    )
    assert hidden.status_code == 422
    made = await async_client.post(
        f"{API}/cases",
        headers=world.h(world.owner),
        json={"title": "Stand layout", "source": source},
    )
    assert made.status_code == 201, made.text
    assert made.json()["source"] == {
        **source,
        "title": f"{incident['reference']} Tug struck stand",
        "available": True,
    }
    seen = await async_client.get(
        f"{API}/cases/{made.json()['id']}", headers=world.h(world.officer)
    )
    assert seen.json()["source"]["available"] is False
    assert seen.json()["source"]["title"] is None


async def test_no_risk_is_refused_after_a_real_risk_and_reopening_needs_a_new_assessment(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    case = await _case(async_client, world)
    case_id = case["id"]
    await _status(async_client, world, world.officer, case_id, status="assessing")
    await _assess(async_client, world, case_id, "initial", 5, "A")
    dodge = await _status(
        async_client,
        world,
        world.manager,
        case_id,
        status="closed",
        no_risk=True,
        reason="Nothing to see",
    )
    assert dodge.status_code == 409

    tolerable = await _assess(async_client, world, case_id, "residual", 3, "C")
    accept = f"{API}/cases/{case_id}/risk-assessments/{tolerable['id']}/acceptance"
    first = await async_client.post(
        accept, headers=world.h(world.manager), json={"note": "Mitigated"}
    )
    assert first.status_code == 200
    twice = await async_client.post(
        accept, headers=world.h(world.manager), json={"note": "Again"}
    )
    assert twice.status_code == 409
    assert (
        await _status(async_client, world, world.manager, case_id, status="closed")
    ).status_code == 200
    await _status(
        async_client,
        world,
        world.manager,
        case_id,
        status="assessing",
        reason="Recurred",
    )
    # The old acceptance no longer closes the case.
    stale = await _status(async_client, world, world.manager, case_id, status="closed")
    assert stale.status_code == 409
    again = await _assess(async_client, world, case_id, "residual", 2, "D")
    assert again["band"] == "acceptable"
    assert (
        await _status(async_client, world, world.manager, case_id, status="closed")
    ).status_code == 200
    cleared = await async_client.patch(
        f"{API}/cases/{case['id']}",
        headers=world.h(world.officer),
        json={"location": None},
    )
    assert cleared.status_code == 409  # closed again: locked


async def test_an_assessor_cannot_accept_their_own_risk(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    case = await _case(async_client, world)
    await _status(async_client, world, world.officer, case["id"], status="assessing")
    # The manager holds the approve key but made the residual assessment, so cannot
    # accept it; the owner, who did not assess it, can.
    tolerable = await async_client.post(
        f"{API}/cases/{case['id']}/risk-assessments",
        headers=world.h(world.manager),
        json={"kind": "residual", "likelihood": 3, "severity": "C"},
    )
    assert tolerable.status_code == 201, tolerable.text
    accept = (
        f"{API}/cases/{case['id']}/risk-assessments/{tolerable.json()['id']}/acceptance"
    )
    own = await async_client.post(
        accept, headers=world.h(world.manager), json={"note": "Mine to accept"}
    )
    assert own.status_code == 403
    assert own.json()["detail"].startswith("A risk is accepted by someone other")
    by_owner = await async_client.post(
        accept, headers=world.h(world.owner), json={"note": "Accepted by the owner"}
    )
    assert by_owner.status_code == 200, by_owner.text
