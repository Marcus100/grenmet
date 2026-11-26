"""Case engine, investigation (ADR-0069 decision 5): draft, submit, approve or return,
waiver, contributing factors, the actions-stage rule, separation of duties and access."""

import uuid

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import registry
from src.audit.models import AuditEntry
from src.auth.models import User
from src.cases import service
from src.cases.models import ContributingFactor, FactorSeed
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
INVESTIGATION = f"{API}/cases/{{case_id}}/investigation"
ROOT_CAUSE = "No rule that a fueller stays with the hose"
DEFAULT_NAMES = {name for _category, name in service.DEFAULT_CONTRIBUTING_FACTORS}

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
    settings) and a plain member (no safety key until granted one)."""

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


async def _factor_ids(client: httpx.AsyncClient, world: World) -> list[str]:
    """Writing a factor seeds the programme's list, so the seeded ids exist."""
    added = await client.post(
        f"{API}/contributing-factors",
        headers=world.h(world.manager),
        json={"category": "training", "name": f"Helper {uuid.uuid4().hex[:8]}"},
    )
    assert added.status_code == 201, added.text
    listed = await client.get(
        f"{API}/contributing-factors", headers=world.h(world.officer)
    )
    assert listed.status_code == 200, listed.text
    ids: list[str] = [row["id"] for row in listed.json() if row["id"] is not None]
    return ids


async def _write(
    client: httpx.AsyncClient, world: World, user: User, case_id: str, **body: object
) -> httpx.Response:
    return await client.patch(
        INVESTIGATION.format(case_id=case_id), headers=world.h(user), json=body
    )


async def _fill(
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
        root_cause=ROOT_CAUSE,
        contributing_factor_ids=factors,
    )
    assert written.status_code == 200, written.text


async def _complete(
    client: httpx.AsyncClient, world: World, user: User, case_id: str
) -> None:
    await _fill(client, world, user, case_id)
    submitted = await client.post(
        f"{INVESTIGATION.format(case_id=case_id)}/submit", headers=world.h(user)
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
    assert body["root_cause"] == ROOT_CAUSE
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


async def test_the_creator_cannot_approve_a_draft_a_colleague_submitted(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    colleague = world.plain
    await _grant(db_async, world.org_id, colleague, "safety-officer")
    case_id = await _case(async_client, world)
    await _to_investigating(async_client, world, case_id)
    # The manager, who holds the approve key, creates the draft.
    await _fill(async_client, world, world.manager, case_id)
    # A colleague makes a trivial edit and submits it.
    edited = await _write(
        async_client, world, colleague, case_id, root_cause=ROOT_CAUSE + "."
    )
    assert edited.status_code == 200, edited.text
    submitted = await async_client.post(
        f"{INVESTIGATION.format(case_id=case_id)}/submit", headers=world.h(colleague)
    )
    assert submitted.status_code == 200, submitted.text
    base = INVESTIGATION.format(case_id=case_id)
    # The creator cannot approve or return it, though they hold the key.
    assert (
        await async_client.post(f"{base}/approve", headers=world.h(world.manager))
    ).status_code == 403
    assert (
        await async_client.post(
            f"{base}/return", headers=world.h(world.manager), json={"reason": "Mine"}
        )
    ).status_code == 403
    # Nor can the colleague, who submitted it.
    assert (
        await async_client.post(f"{base}/approve", headers=world.h(colleague))
    ).status_code == 403
    # A third person can.
    approved = await async_client.post(f"{base}/approve", headers=world.h(world.owner))
    assert approved.status_code == 200, approved.text


async def test_the_last_editor_cannot_approve(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    case_id = await _case(async_client, world)
    await _to_investigating(async_client, world, case_id)
    await _fill(async_client, world, world.officer, case_id)
    # The manager edits last, then the officer submits.
    edited = await _write(
        async_client, world, world.manager, case_id, unsafe_acts="Hose unattended"
    )
    assert edited.status_code == 200, edited.text
    submitted = await async_client.post(
        f"{INVESTIGATION.format(case_id=case_id)}/submit",
        headers=world.h(world.officer),
    )
    assert submitted.status_code == 200, submitted.text
    base = INVESTIGATION.format(case_id=case_id)
    assert (
        await async_client.post(f"{base}/approve", headers=world.h(world.manager))
    ).status_code == 403
    assert (
        await async_client.post(f"{base}/approve", headers=world.h(world.owner))
    ).status_code == 200


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
                f"{base}/waiver", headers=world.h(user), json={"reason": "No"}
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


async def test_whys_must_be_asked_and_at_most_five(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    case_id = await _case(async_client, world)
    await _to_investigating(async_client, world, case_id)
    blank = await _write(
        async_client,
        world,
        world.officer,
        case_id,
        why_steps=[{"question": "   ", "answer": "Haste"}],
    )
    assert blank.status_code == 422
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
    returned = await async_client.post(
        f"{base}/return", headers=world.h(world.manager), json={"reason": "Redo"}
    )
    assert returned.status_code == 200, returned.text
    assert (
        await async_client.post(f"{base}/submit", headers=world.h(world.officer))
    ).status_code == 200
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
    fresh = (await async_client.get(base, headers=world.h(world.officer))).json()
    assert fresh["status"] == "draft"
    # The reopened draft carries no earlier return, submission or decision.
    assert fresh["return_reason"] is None
    assert fresh["returned_by"] is None
    assert fresh["submitted_by"] is None
    assert fresh["decided_by"] is None
    assert fresh["decided_at"] is None
    assert fresh["no_investigation_reason"] is None
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
            f"{base}/waiver", headers=world.h(world.officer), json={"reason": "Minor"}
        )
    ).status_code == 403
    assert (
        await async_client.post(
            f"{base}/waiver", headers=world.h(world.manager), json={"reason": " "}
        )
    ).status_code == 422
    decided = await async_client.post(
        f"{base}/waiver",
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
    ).status_code == 409  # no investigation at all
    await _complete(async_client, world, world.officer, case_id)
    assert (
        await _move(async_client, world, world.officer, case_id, status="actions")
    ).status_code == 409  # submitted is not enough
    await async_client.post(
        f"{INVESTIGATION.format(case_id=case_id)}/approve",
        headers=world.h(world.manager),
    )
    moved = await _move(async_client, world, world.officer, case_id, status="actions")
    assert moved.status_code == 200, moved.text


async def test_a_waiver_cannot_waive_written_work_or_be_made_by_a_party(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    # A draft that holds content cannot be waived, by anyone.
    with_content = await _case(async_client, world)
    await _to_investigating(async_client, world, with_content)
    await _fill(async_client, world, world.officer, with_content)
    base = INVESTIGATION.format(case_id=with_content)
    refused = await async_client.post(
        f"{base}/waiver", headers=world.h(world.manager), json={"reason": "Not needed"}
    )
    assert refused.status_code == 409

    # An empty draft: its creator cannot waive it, a third person can.
    empty = await _case(async_client, world)
    await _to_investigating(async_client, world, empty)
    blanked = await _write(async_client, world, world.officer, empty, what_happened="")
    assert blanked.status_code == 200, blanked.text
    base = INVESTIGATION.format(case_id=empty)
    assert (
        await async_client.post(
            f"{base}/waiver", headers=world.h(world.officer), json={"reason": "Minor"}
        )
    ).status_code == 403
    waived = await async_client.post(
        f"{base}/waiver", headers=world.h(world.manager), json={"reason": "Minor"}
    )
    assert waived.status_code == 200, waived.text
    assert waived.json()["no_investigation_reason"] == "Minor"


async def test_contributing_factors_are_managed_and_checked(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    url = f"{API}/contributing-factors"
    listed = (await async_client.get(url, headers=world.h(world.officer))).json()
    # Nothing is written yet: the list is the starting suggestions, without ids.
    assert len(listed) == 16
    assert all(row["id"] is None and row["is_default_suggestion"] for row in listed)
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
    seeded = (await async_client.get(url, headers=world.h(world.officer))).json()
    assert all(row["id"] is not None for row in seeded)
    assert not any(row["is_default_suggestion"] for row in seeded)
    fatigue = next(row for row in seeded if row["name"] == "Fatigue")
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
    malformed = await _write(
        async_client, world, world.officer, case_id, contributing_factor_ids=["nope"]
    )
    assert malformed.status_code == 422
    bad_path = await async_client.patch(
        f"{url}/not-a-factor-id",
        headers=world.h(world.manager),
        json={"is_active": True},
    )
    assert bad_path.status_code == 422


async def test_a_custom_factor_written_first_still_seeds_the_defaults(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    added = await async_client.post(
        f"{API}/contributing-factors",
        headers=world.h(world.manager),
        json={"category": "training", "name": "Refresher overdue"},
    )
    assert added.status_code == 201, added.text
    names = {
        row["name"]
        for row in (
            await async_client.get(
                f"{API}/contributing-factors", headers=world.h(world.officer)
            )
        ).json()
    }
    assert DEFAULT_NAMES <= names
    assert "Refresher overdue" in names
    assert len(names) == 17


async def test_a_read_never_writes(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)

    async def counts() -> tuple[int, int, int]:
        factors = await db_async.scalar(
            select(func.count())
            .select_from(ContributingFactor)
            .where(ContributingFactor.organisation_id == world.org_id)
        )
        seeds = await db_async.scalar(
            select(func.count())
            .select_from(FactorSeed)
            .where(FactorSeed.organisation_id == world.org_id)
        )
        audit = await db_async.scalar(
            select(func.count())
            .select_from(AuditEntry)
            .where(AuditEntry.organisation_id == world.org_id)
        )
        return int(factors or 0), int(seeds or 0), int(audit or 0)

    before = await counts()
    listed = await async_client.get(
        f"{API}/contributing-factors", headers=world.h(world.officer)
    )
    assert listed.status_code == 200
    assert await counts() == before
    assert before[0] == 0 and before[1] == 0


async def test_names_are_unique_ignoring_case_and_a_database_refusal_is_a_409(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    world = await _world(db_async)
    url = f"{API}/contributing-factors"
    first = await async_client.post(
        url,
        headers=world.h(world.manager),
        json={"category": "training", "name": "Refresher overdue"},
    )
    assert first.status_code == 201, first.text
    other = await async_client.post(
        url,
        headers=world.h(world.manager),
        json={"category": "training", "name": "Night shift briefing"},
    )
    assert other.status_code == 201, other.text

    # Behind the service's own check, the case-insensitive unique index refuses the
    # write; that refusal must come back as a 409, not a 500.
    async def never_taken(*_args: object, **_kwargs: object) -> bool:
        return False

    monkeypatch.setattr(service, "_name_taken", never_taken)
    created = await async_client.post(
        url,
        headers=world.h(world.manager),
        json={"category": "training", "name": "REFRESHER Overdue"},
    )
    assert created.status_code == 409, created.text
    renamed = await async_client.patch(
        f"{url}/{other.json()['id']}",
        headers=world.h(world.manager),
        json={"name": "refresher OVERDUE"},
    )
    assert renamed.status_code == 409, renamed.text


async def test_a_retired_factor_already_chosen_stays_but_a_new_one_must_be_active(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    ids = await _factor_ids(async_client, world)
    case_id = await _case(async_client, world)
    await _to_investigating(async_client, world, case_id)
    url = f"{API}/contributing-factors"
    chosen = await _write(
        async_client, world, world.officer, case_id, contributing_factor_ids=ids[:2]
    )
    assert chosen.status_code == 200, chosen.text
    retired = await async_client.patch(
        f"{url}/{ids[0]}", headers=world.h(world.manager), json={"is_active": False}
    )
    assert retired.status_code == 200
    # The same list, with the now-retired factor still on it, is accepted.
    resent = await _write(
        async_client, world, world.officer, case_id, contributing_factor_ids=ids[:2]
    )
    assert resent.status_code == 200, resent.text
    # A factor newly added from the retired pile is refused.
    retired_again = await async_client.patch(
        f"{url}/{ids[2]}", headers=world.h(world.manager), json={"is_active": False}
    )
    assert retired_again.status_code == 200
    newly = await _write(
        async_client, world, world.officer, case_id, contributing_factor_ids=[ids[2]]
    )
    assert newly.status_code == 422


async def test_an_approved_investigation_keeps_the_names_a_later_rename_cannot_change(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    case_id = await _case(async_client, world)
    await _to_investigating(async_client, world, case_id)
    await _complete(async_client, world, world.officer, case_id)
    base = INVESTIGATION.format(case_id=case_id)
    approved = await async_client.post(
        f"{base}/approve", headers=world.h(world.manager)
    )
    assert approved.status_code == 200, approved.text
    before = approved.json()["contributing_factors"]
    assert len(before) == 2
    target = before[0]

    renamed = await async_client.patch(
        f"{API}/contributing-factors/{target['id']}",
        headers=world.h(world.manager),
        json={"name": "Renamed later", "category": "supervision"},
    )
    assert renamed.status_code == 200, renamed.text
    after = (await async_client.get(base, headers=world.h(world.officer))).json()
    assert after["contributing_factors"] == before
    shown = next(f for f in after["contributing_factors"] if f["id"] == target["id"])
    assert shown["name"] == target["name"]
    assert shown["category"] == target["category"]


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

    other_id = f"cfa_{uuid.uuid4().hex[:16]}"
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
    still take a signed-in session only (like the rest of the case engine), so a key
    is refused."""
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
