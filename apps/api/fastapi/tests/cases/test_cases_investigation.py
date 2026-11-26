"""Case engine, investigation (ADR-0069 decision 5): draft, submit, approve or return,
contributing factors, the actions-stage rule and access."""

import uuid

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import registry
from src.auth.models import User
from src.cases.models import ContributingFactor
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
    """An owner (all keys), an officer (read and write), a manager (adds approve and
    settings) and a plain member (no safety key)."""

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
    await _grant(db, org.id, users[1], "safety-officer")
    await _grant(db, org.id, users[2], "safety-manager")
    return World(org.id, users)


async def _case(client: httpx.AsyncClient, world: World) -> str:
    made = await client.post(
        f"{API}/cases",
        headers=world.h(world.officer),
        json={"title": "Fuel spill at stand 4", "location": "Stand 4"},
    )
    assert made.status_code == 201, made.text
    case_id: str = made.json()["id"]
    return case_id


async def _move(
    client: httpx.AsyncClient, world: World, user: User, case_id: str, **body: object
) -> httpx.Response:
    return await client.post(
        f"{API}/cases/{case_id}/status", headers=world.h(user), json=body
    )


async def _to_investigating(
    client: httpx.AsyncClient, world: World, case_id: str
) -> None:
    assert (
        await _move(client, world, world.officer, case_id, status="assessing")
    ).status_code == 200
    assert (
        await _move(client, world, world.officer, case_id, status="investigating")
    ).status_code == 200


INVESTIGATION = f"{API}/cases/{{case_id}}/investigation"


async def _factor_ids(client: httpx.AsyncClient, world: World) -> list[str]:
    listed = await client.get(
        f"{API}/contributing-factors", headers=world.h(world.officer)
    )
    assert listed.status_code == 200, listed.text
    ids: list[str] = [row["id"] for row in listed.json()]
    return ids


async def _write(
    client: httpx.AsyncClient, world: World, user: User, case_id: str, **body: object
) -> httpx.Response:
    return await client.patch(
        INVESTIGATION.format(case_id=case_id), headers=world.h(user), json=body
    )


async def _complete(
    client: httpx.AsyncClient, world: World, user: User, case_id: str
) -> None:
    factors = (await _factor_ids(client, world))[:2]
    written = await _write(
        client,
        world,
        user,
        case_id,
        what_happened="Fuel spilled while refuelling a narrowbody",
        unsafe_acts="Hose left running unattended",
        unsafe_conditions="Drip tray missing",
        why_steps=[
            {"question": "Why did fuel spill?", "answer": "The hose overflowed"},
            {"question": "Why unattended?", "answer": "The fueller was called away"},
        ],
        root_cause="No rule that a fueller stays with the hose",
        contributing_factor_ids=factors,
    )
    assert written.status_code == 200, written.text
    submitted = await client.post(
        f"{INVESTIGATION.format(case_id=case_id)}/submit",
        headers=world.h(user),
    )
    assert submitted.status_code == 200, submitted.text


async def test_draft_submit_and_approve(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    case_id = await _case(async_client, world)
    await _to_investigating(async_client, world, case_id)
    await _complete(async_client, world, world.officer, case_id)

    detail = (
        await async_client.get(f"{API}/cases/{case_id}", headers=world.h(world.officer))
    ).json()
    assert detail["investigation"]["status"] == "submitted"
    assert detail["investigation"]["submitted_by"] == str(world.officer.id)
    assert len(detail["investigation"]["contributing_factors"]) == 2

    approved = await async_client.post(
        f"{INVESTIGATION.format(case_id=case_id)}/approve",
        headers=world.h(world.manager),
    )
    assert approved.status_code == 200, approved.text
    body = approved.json()
    assert body["status"] == "approved"
    assert body["decided_by"] == str(world.manager.id)
    assert body["root_cause"] == "No rule that a fueller stays with the hose"
    assert body["why_steps"][1]["answer"] == "The fueller was called away"


async def test_return_needs_a_reason_and_sends_the_draft_back(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    case_id = await _case(async_client, world)
    await _to_investigating(async_client, world, case_id)
    await _complete(async_client, world, world.officer, case_id)
    url = f"{INVESTIGATION.format(case_id=case_id)}/return"

    blank = await async_client.post(
        url, headers=world.h(world.manager), json={"reason": "   "}
    )
    assert blank.status_code == 422
    returned = await async_client.post(
        url,
        headers=world.h(world.manager),
        json={"reason": "The root cause is a symptom, not a cause"},
    )
    assert returned.status_code == 200, returned.text
    body = returned.json()
    assert body["status"] == "draft"
    assert body["return_reason"] == "The root cause is a symptom, not a cause"
    assert body["returned_by"] == str(world.manager.id)
    assert body["decided_at"] is None

    # The officer edits the draft again and sends it back for approval.
    fixed = await _write(
        async_client,
        world,
        world.officer,
        case_id,
        root_cause="No hose-attendance rule",
    )
    assert fixed.status_code == 200, fixed.text
    resubmitted = await async_client.post(
        f"{INVESTIGATION.format(case_id=case_id)}/submit",
        headers=world.h(world.officer),
    )
    assert resubmitted.status_code == 200, resubmitted.text
    assert (
        await async_client.post(
            f"{INVESTIGATION.format(case_id=case_id)}/approve",
            headers=world.h(world.owner),
        )
    ).status_code == 200


async def test_the_submitter_cannot_approve_or_return(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    case_id = await _case(async_client, world)
    await _to_investigating(async_client, world, case_id)
    # The manager holds the approve key, and still cannot review their own submission.
    await _complete(async_client, world, world.manager, case_id)
    own_approval = await async_client.post(
        f"{INVESTIGATION.format(case_id=case_id)}/approve",
        headers=world.h(world.manager),
    )
    assert own_approval.status_code == 403
    own_return = await async_client.post(
        f"{INVESTIGATION.format(case_id=case_id)}/return",
        headers=world.h(world.manager),
        json={"reason": "Not good enough"},
    )
    assert own_return.status_code == 403
    by_owner = await async_client.post(
        f"{INVESTIGATION.format(case_id=case_id)}/approve",
        headers=world.h(world.owner),
    )
    assert by_owner.status_code == 200, by_owner.text


async def test_decisions_need_the_approve_key(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    case_id = await _case(async_client, world)
    await _to_investigating(async_client, world, case_id)
    await _complete(async_client, world, world.officer, case_id)
    base = INVESTIGATION.format(case_id=case_id)
    for user in (world.officer, world.plain):
        assert (
            await async_client.post(f"{base}/approve", headers=world.h(user))
        ).status_code == 403
        assert (
            await async_client.post(
                f"{base}/return", headers=world.h(user), json={"reason": "No"}
            )
        ).status_code == 403
        assert (
            await async_client.post(
                f"{base}/no-investigation",
                headers=world.h(user),
                json={"reason": "No"},
            )
        ).status_code == 403
    # A member with no safety key cannot read the investigation either.
    assert (
        await async_client.get(base, headers=world.h(world.plain))
    ).status_code == 403


async def test_submit_needs_the_facts_the_whys_and_a_root_cause(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    case_id = await _case(async_client, world)
    await _to_investigating(async_client, world, case_id)
    base = INVESTIGATION.format(case_id=case_id)
    submit = f"{base}/submit"

    assert (
        await async_client.post(submit, headers=world.h(world.officer))
    ).status_code == 409  # no investigation written yet
    await _write(async_client, world, world.officer, case_id, what_happened="Spill")
    assert (
        await async_client.post(submit, headers=world.h(world.officer))
    ).status_code == 422  # no why
    await _write(
        async_client,
        world,
        world.officer,
        case_id,
        why_steps=[{"question": "Why?", "answer": ""}],
    )
    assert (
        await async_client.post(submit, headers=world.h(world.officer))
    ).status_code == 422  # a why without an answer
    await _write(
        async_client,
        world,
        world.officer,
        case_id,
        why_steps=[{"question": "Why?", "answer": "Haste"}],
    )
    assert (
        await async_client.post(submit, headers=world.h(world.officer))
    ).status_code == 422  # no root cause
    await _write(async_client, world, world.officer, case_id, root_cause="Haste")
    assert (
        await async_client.post(submit, headers=world.h(world.officer))
    ).status_code == 200


async def test_at_most_five_whys(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    case_id = await _case(async_client, world)
    await _to_investigating(async_client, world, case_id)
    six = [{"question": f"Why {n}?", "answer": "Because"} for n in range(6)]
    refused = await _write(async_client, world, world.officer, case_id, why_steps=six)
    assert refused.status_code == 422


async def test_an_approved_investigation_is_read_only_until_the_case_is_reopened(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    case_id = await _case(async_client, world)
    await _to_investigating(async_client, world, case_id)
    await _complete(async_client, world, world.officer, case_id)
    base = INVESTIGATION.format(case_id=case_id)
    assert (
        await async_client.post(f"{base}/approve", headers=world.h(world.manager))
    ).status_code == 200

    assert (
        await _write(async_client, world, world.officer, case_id, root_cause="Changed")
    ).status_code == 409
    assert (
        await async_client.post(f"{base}/submit", headers=world.h(world.officer))
    ).status_code == 409
    assert (
        await async_client.post(
            f"{base}/return", headers=world.h(world.manager), json={"reason": "Redo"}
        )
    ).status_code == 409

    # Closing the case does not touch the investigation; reopening it does.
    closed = await _move(
        async_client,
        world,
        world.manager,
        case_id,
        status="closed",
        no_risk=True,
        reason="Spill cleaned; no further hazard",
    )
    assert closed.status_code == 200, closed.text
    assert (
        await _write(async_client, world, world.officer, case_id, root_cause="Late")
    ).status_code == 409
    reopened = await _move(
        async_client, world, world.manager, case_id, status="assessing", reason="Again"
    )
    assert reopened.status_code == 200, reopened.text
    assert (await async_client.get(base, headers=world.h(world.officer))).json()[
        "status"
    ] == "draft"
    investigating = await _move(
        async_client, world, world.officer, case_id, status="investigating"
    )
    assert investigating.status_code == 200, investigating.text
    edited = await _write(
        async_client, world, world.officer, case_id, root_cause="Reassessed"
    )
    assert edited.status_code == 200, edited.text


async def test_the_actions_stage_needs_a_decided_investigation(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    case_id = await _case(async_client, world)
    assert (
        await _move(async_client, world, world.officer, case_id, status="assessing")
    ).status_code == 200
    # Writing the investigation needs the investigating stage.
    assert (
        await _write(async_client, world, world.officer, case_id, root_cause="Early")
    ).status_code == 409
    refused = await _move(async_client, world, world.officer, case_id, status="actions")
    assert refused.status_code == 409
    assert "investigation" in refused.json()["detail"]

    # "No investigation needed" is a decision by an approve-key holder, with a reason.
    base = INVESTIGATION.format(case_id=case_id)
    assert (
        await async_client.post(
            f"{base}/no-investigation",
            headers=world.h(world.officer),
            json={"reason": "Minor"},
        )
    ).status_code == 403
    assert (
        await async_client.post(
            f"{base}/no-investigation",
            headers=world.h(world.manager),
            json={"reason": " "},
        )
    ).status_code == 422
    decided = await async_client.post(
        f"{base}/no-investigation",
        headers=world.h(world.manager),
        json={"reason": "Single loose tile, repaired the same shift"},
    )
    assert decided.status_code == 200, decided.text
    assert decided.json()["status"] == "not_needed"
    assert decided.json()["no_investigation_reason"].startswith("Single loose")
    moved = await _move(async_client, world, world.officer, case_id, status="actions")
    assert moved.status_code == 200, moved.text


async def test_an_approved_investigation_opens_the_actions_stage(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    case_id = await _case(async_client, world)
    await _to_investigating(async_client, world, case_id)
    assert (
        await _move(async_client, world, world.officer, case_id, status="actions")
    ).status_code == 409  # a draft is not enough
    await _complete(async_client, world, world.officer, case_id)
    assert (
        await _move(async_client, world, world.officer, case_id, status="actions")
    ).status_code == 409  # submitted is not enough either
    await async_client.post(
        f"{INVESTIGATION.format(case_id=case_id)}/approve",
        headers=world.h(world.manager),
    )
    moved = await _move(async_client, world, world.officer, case_id, status="actions")
    assert moved.status_code == 200, moved.text


async def test_contributing_factors_are_managed_and_checked(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    listed = (
        await async_client.get(
            f"{API}/contributing-factors", headers=world.h(world.officer)
        )
    ).json()
    assert len(listed) == 16
    assert {row["category"] for row in listed} == {
        "human_factors",
        "procedures",
        "equipment",
        "environment",
        "organisation",
        "training",
        "communication",
        "supervision",
    }
    url = f"{API}/contributing-factors"
    assert (
        await async_client.post(
            url,
            headers=world.h(world.officer),
            json={"category": "training", "name": "Refresher"},
        )
    ).status_code == 403
    assert (
        await async_client.post(
            url,
            headers=world.h(world.manager),
            json={"category": "weather", "name": "Refresher"},
        )
    ).status_code == 422
    added = await async_client.post(
        url,
        headers=world.h(world.manager),
        json={"category": "training", "name": "Refresher overdue"},
    )
    assert added.status_code == 201, added.text
    assert (
        await async_client.post(
            url,
            headers=world.h(world.manager),
            json={"category": "training", "name": "REFRESHER overdue"},
        )
    ).status_code == 409
    fatigue = next(row for row in listed if row["name"] == "Fatigue")
    retired = await async_client.patch(
        f"{url}/{fatigue['id']}",
        headers=world.h(world.manager),
        json={"is_active": False},
    )
    assert retired.status_code == 200
    assert retired.json()["is_active"] is False

    case_id = await _case(async_client, world)
    await _to_investigating(async_client, world, case_id)
    retired_choice = await _write(
        async_client,
        world,
        world.officer,
        case_id,
        contributing_factor_ids=[fatigue["id"]],
    )
    assert retired_choice.status_code == 422


async def test_a_factor_of_another_organisation_or_programme_is_refused(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    a = await _world(db_async)
    b = await _world(db_async)
    other_org_factors = await _factor_ids(async_client, b)
    case_id = await _case(async_client, a)
    await _to_investigating(async_client, a, case_id)

    foreign = await _write(
        async_client,
        a,
        a.officer,
        case_id,
        contributing_factor_ids=[other_org_factors[0]],
    )
    assert foreign.status_code == 422

    other_id = f"cfa_{uuid.uuid4().hex[:12]}"
    other_programme = ContributingFactor(
        id=other_id,
        organisation_id=a.org_id,
        programme="environmental_management",
        category="environment",
        name=f"Env {uuid.uuid4().hex[:6]}",
        is_active=True,
        created_by=a.owner.id,
    )
    db_async.add(other_programme)
    await db_async.commit()
    wrong_programme = await _write(
        async_client,
        a,
        a.officer,
        case_id,
        contributing_factor_ids=[other_id],
    )
    assert wrong_programme.status_code == 422


async def test_another_programme_key_holder_gets_403_on_safety_routes(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async, apps=("safety", "incidents"))
    await _grant(db_async, world.org_id, world.plain, "incidents-manager")
    case_id = await _case(async_client, world)
    base = INVESTIGATION.format(case_id=case_id)
    assert (
        await async_client.get(f"{API}/cases", headers=world.h(world.plain))
    ).status_code == 403
    assert (
        await async_client.get(
            f"{API}/contributing-factors", headers=world.h(world.plain)
        )
    ).status_code == 403
    assert (
        await async_client.post(f"{base}/approve", headers=world.h(world.plain))
    ).status_code == 403


async def test_investigations_are_isolated_by_organisation(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    a = await _world(db_async)
    b = await _world(db_async)
    case_id = await _case(async_client, a)
    await _to_investigating(async_client, a, case_id)
    await _complete(async_client, a, a.officer, case_id)
    base = INVESTIGATION.format(case_id=case_id)
    assert (await async_client.get(base, headers=b.h(b.owner))).status_code == 404
    assert (
        await async_client.post(f"{base}/approve", headers=b.h(b.owner))
    ).status_code == 404
    assert (
        await async_client.post(f"{base}/submit", headers=b.h(b.owner))
    ).status_code == 404
    assert (
        await async_client.get(base, headers=headers_for(a.owner, b.org_id))
    ).status_code == 404


async def test_an_organisation_key_does_not_open_the_case_routes(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """The ``safety.read`` and ``safety.write`` scopes exist, but the case routes
    still take a session only (like the rest of the case engine), so a key is refused."""
    world = await _world(db_async)
    created = await async_client.post(
        "/api/v1/organisations/org/api-keys",
        headers=world.h(world.owner),
        json={"name": "Kiosk", "scopes": ["safety.read"]},
    )
    assert created.status_code == 201, created.text
    secret = created.json()["secret"]
    refused = await async_client.get(
        f"{API}/cases", headers={"Authorization": f"Bearer {secret}"}
    )
    assert refused.status_code in (401, 403)


async def test_investigation_text_is_audited_as_sensitive() -> None:
    sensitive = registry.sensitive_fields("case_investigation")
    for field in (
        "what_happened",
        "unsafe_acts",
        "unsafe_conditions",
        "root_cause",
        "why_steps",
    ):
        assert field in sensitive
