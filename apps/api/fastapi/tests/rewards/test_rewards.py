"""Rewards ledger (U2), programmes/redemption (U3), badges (U4), account bridge (U1)."""

import uuid
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import func, select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth.models import User
from src.events.models import Admission, Listing, Order, Organiser, Ticket
from src.organisations.models import MembershipRole
from src.rewards import service
from src.rewards.config import rewards_settings
from src.rewards.models import (
    Entry,
    EntryKind,
    EntryStatus,
    Program,
    ProgramStatus,
    ReviewFlag,
)
from src.rewards.schemas import ProgramCreate
from src.utils.datetime import utc_now
from tests.events.support import SessionFactory
from tests.factories import assign_role, make_role_with_permission, make_user
from tests.organisations.support import headers_for, make_org

API = "/api/v1/rewards"


async def _rewards_org(*args, **kwargs):
    """An organisation entitled to rewards (its organisation routes require it)."""
    return await make_org(*args, apps=("rewards",), **kwargs)


async def _setup(
    db: AsyncSession, stamps: int = 2, **extra: int
) -> tuple[User, User, str, Program]:
    """A customer, an organisation admin and the organisation's stamp card."""
    customer = await make_user(db)
    owner = await make_user(db)
    org = await _rewards_org(
        db, f"Cafe {uuid.uuid4().hex[:6]}", members=((owner, MembershipRole.OWNER),)
    )
    program = await service.create_program(
        db,
        organisation_id=org.id,
        actor=owner,
        payload=ProgramCreate(
            name="Coffee card",
            stamps_required=stamps,
            reward_description="A free coffee",
            **extra,
        ),
    )
    await db.commit()
    return customer, owner, org.id, program


async def _earn(
    db: AsyncSession, customer: User, org_id: str, n: int, tag: str = "a"
) -> None:
    for i in range(n):
        await service.earn_for_source(
            db,
            account_id=customer.id,
            organisation_id=org_id,
            source_type=service.EVENTS_ADMISSION,
            source_id=f"{tag}-{i}-{uuid.uuid4().hex[:6]}",
        )
    await db.commit()


async def _card(client: httpx.AsyncClient, user: User) -> dict:
    resp = await client.get(f"{API}/me", headers=headers_for(user))
    assert resp.status_code == 200, resp.text
    return resp.json()[0]


# --- ledger invariants -----------------------------------------------------------


@pytest.mark.asyncio
async def test_earn_is_idempotent_per_source_and_balance_is_sql(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    customer, _owner, org_id, _program = await _setup(db_async, stamps=3)
    for _ in range(2):
        await service.earn_for_source(
            db_async,
            account_id=customer.id,
            organisation_id=org_id,
            source_type=service.EVENTS_ADMISSION,
            source_id="admission-1",
        )
    await db_async.commit()
    card = await _card(async_client, customer)
    assert (card["balance"], card["pending"], card["available"]) == (1, 0, 1)
    assert card["can_redeem"] is False


@pytest.mark.asyncio
async def test_pending_earn_is_not_spendable_until_confirmed(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    customer, _owner, org_id, _program = await _setup(db_async, stamps=1)
    created = await service.earn_for_source(
        db_async,
        account_id=customer.id,
        organisation_id=org_id,
        source_type=service.EVENTS_ADMISSION,
        source_id="p-1",
        status=EntryStatus.PENDING,
    )
    await db_async.commit()
    card = await _card(async_client, customer)
    assert (card["balance"], card["pending"], card["can_redeem"]) == (0, 1, False)
    assert await service.confirm_pending_earn(db_async, created[0].id)
    await db_async.commit()
    assert (await _card(async_client, customer))["balance"] == 1


@pytest.mark.asyncio
async def test_paused_programme_earns_nothing(db_async: AsyncSession) -> None:
    customer, owner, org_id, program = await _setup(db_async)
    program.status = ProgramStatus.PAUSED.value
    await db_async.commit()
    created = await service.earn_for_source(
        db_async,
        account_id=customer.id,
        organisation_id=org_id,
        source_type=service.EVENTS_ADMISSION,
        source_id="x",
    )
    assert created == []
    assert owner.id  # organisation owner unaffected


@pytest.mark.asyncio
async def test_ledger_is_append_only(db_async: AsyncSession) -> None:
    customer, _owner, org_id, _program = await _setup(db_async)
    await _earn(db_async, customer, org_id, 1)
    customer_id = customer.id
    for statement in (
        "UPDATE rewards.entry SET amount = 99",
        "UPDATE rewards.entry SET account_id = account_id, source_id = 'forged'",
        "DELETE FROM rewards.entry",
    ):
        with pytest.raises(DBAPIError, match="append-only"):
            await db_async.execute(text(statement))
        await db_async.rollback()
    total = await db_async.scalar(
        select(func.sum(Entry.amount)).where(Entry.account_id == customer_id)
    )
    assert total == 1


@pytest.mark.asyncio
async def test_reverse_for_source_nets_to_zero_and_is_idempotent(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    customer, _owner, org_id, _program = await _setup(db_async)
    await service.earn_for_source(
        db_async,
        account_id=customer.id,
        organisation_id=org_id,
        source_type=service.EVENTS_ADMISSION,
        source_id="refund-me",
    )
    await db_async.commit()
    assert (
        await service.reverse_for_source(
            db_async, service.EVENTS_ADMISSION, "refund-me"
        )
        == 1
    )
    assert (
        await service.reverse_for_source(
            db_async, service.EVENTS_ADMISSION, "refund-me"
        )
        == 0
    )
    await db_async.commit()
    card = await _card(async_client, customer)
    assert card["balance"] == 0
    kinds = sorted(
        await db_async.scalars(
            select(Entry.kind).where(Entry.account_id == customer.id)
        )
    )
    assert kinds == ["earn", "reverse"]
    original = await db_async.scalar(
        select(Entry).where(Entry.account_id == customer.id, Entry.kind == "earn")
    )
    assert original is not None
    assert original.status == EntryStatus.REVERSED.value
    # A reversed source cannot be credited again.
    assert not await service.earn_for_source(
        db_async,
        account_id=customer.id,
        organisation_id=org_id,
        source_type=service.EVENTS_ADMISSION,
        source_id="refund-me",
    )


@pytest.mark.asyncio
async def test_velocity_rule_flags_without_blocking(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(rewards_settings, "VELOCITY_MAX_EARNS", 3)
    customer, _owner, org_id, _program = await _setup(db_async)
    await _earn(db_async, customer, org_id, 5)
    flags = list(
        await db_async.scalars(
            select(ReviewFlag).where(ReviewFlag.account_id == customer.id)
        )
    )
    assert len(flags) == 1
    assert flags[0].resolved_at is None
    entries = await db_async.scalar(
        select(func.count()).select_from(Entry).where(Entry.account_id == customer.id)
    )
    assert entries == 5


# --- redemption and limits ---------------------------------------------------------


@pytest.mark.asyncio
async def test_redeem_flow_with_staff_code_and_cross_organisation_denial(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    customer, owner, org_id, program = await _setup(db_async, stamps=2)
    other_owner = await make_user(db_async)
    other_org = await _rewards_org(
        db_async, "Other cafe", members=((other_owner, MembershipRole.OWNER),)
    )
    body = {"program_id": str(program.id)}
    mine = headers_for(customer)

    assert (
        await async_client.post(f"{API}/me/redemptions", headers=mine, json=body)
    ).status_code == 409
    await _earn(db_async, customer, org_id, 2)
    resp = await async_client.post(f"{API}/me/redemptions", headers=mine, json=body)
    assert resp.status_code == 201, resp.text
    code = resp.json()["code"]
    # One open redemption at a time; the held stamps are no longer available.
    assert (
        await async_client.post(f"{API}/me/redemptions", headers=mine, json=body)
    ).status_code == 409
    assert (await _card(async_client, customer))["available"] == 0

    wrong = await async_client.post(
        f"{API}/redemptions/confirm",
        headers=headers_for(other_owner, other_org.id),
        json={"code": code},
    )
    assert wrong.status_code == 404
    outsider = await async_client.post(
        f"{API}/redemptions/confirm",
        headers=headers_for(customer, org_id),
        json={"code": code},
    )
    assert outsider.status_code == 404

    ok = await async_client.post(
        f"{API}/redemptions/confirm",
        headers=headers_for(owner, org_id),
        json={"code": code.lower()},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["reward_description"] == "A free coffee"
    again = await async_client.post(
        f"{API}/redemptions/confirm",
        headers=headers_for(owner, org_id),
        json={"code": code},
    )
    assert again.status_code == 409
    card = await _card(async_client, customer)
    assert (card["balance"], card["redemptions"], card["open_redemption_code"]) == (
        0,
        1,
        None,
    )


@pytest.mark.asyncio
async def test_cancel_releases_held_stamps(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    customer, _owner, org_id, program = await _setup(db_async, stamps=1)
    await _earn(db_async, customer, org_id, 1)
    mine = headers_for(customer)
    redeemed = await async_client.post(
        f"{API}/me/redemptions", headers=mine, json={"program_id": str(program.id)}
    )
    rid = redeemed.json()["id"]
    cancelled = await async_client.post(
        f"{API}/me/redemptions/{rid}/cancel", headers=mine
    )
    assert cancelled.status_code == 200, cancelled.text
    assert (await _card(async_client, customer))["available"] == 1
    again = await async_client.post(f"{API}/me/redemptions/{rid}/cancel", headers=mine)
    assert again.status_code == 409
    stranger = await make_user(db_async)
    other = await async_client.post(
        f"{API}/me/redemptions/{rid}/cancel", headers=headers_for(stranger)
    )
    assert other.status_code == 404


@pytest.mark.asyncio
async def test_redemption_cap_per_account(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    customer, owner, org_id, program = await _setup(
        db_async, stamps=1, max_redemptions_per_account=1
    )
    await _earn(db_async, customer, org_id, 2)
    mine = headers_for(customer)
    body = {"program_id": str(program.id)}
    first = await async_client.post(f"{API}/me/redemptions", headers=mine, json=body)
    await async_client.post(
        f"{API}/redemptions/confirm",
        headers=headers_for(owner, org_id),
        json={"code": first.json()["code"]},
    )
    second = await async_client.post(f"{API}/me/redemptions", headers=mine, json=body)
    assert second.status_code == 409
    assert "limit" in second.json()["detail"]


# --- programme configuration --------------------------------------------------------


@pytest.mark.asyncio
async def test_programme_roles_and_isolation(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    _customer, owner, org_id, program = await _setup(db_async)
    member = await make_user(db_async)
    other_owner = await make_user(db_async)
    org2 = await _rewards_org(
        db_async, "Rival", members=((other_owner, MembershipRole.OWNER),)
    )
    body = {
        "name": "Card",
        "stamps_required": 5,
        "reward_description": "Free item",
    }
    create = await async_client.post(
        f"{API}/programs", headers=headers_for(owner, org_id), json=body
    )
    assert create.status_code == 201, create.text
    assert (
        await async_client.post(
            f"{API}/programs", headers=headers_for(member, org_id), json=body
        )
    ).status_code == 404
    patch = await async_client.patch(
        f"{API}/programs/{program.id}",
        headers=headers_for(other_owner, org2.id),
        json={"status": "paused"},
    )
    assert patch.status_code == 404
    paused = await async_client.patch(
        f"{API}/programs/{program.id}",
        headers=headers_for(owner, org_id),
        json={"status": "paused"},
    )
    assert paused.status_code == 200
    assert paused.json()["status"] == "paused"
    listed = await async_client.get(
        f"{API}/programs", headers=headers_for(owner, org_id)
    )
    assert len(listed.json()) == 2
    assert (
        await async_client.post(
            f"{API}/programs",
            headers=headers_for(owner, org_id),
            json={**body, "stamps_required": 0},
        )
    ).status_code == 422


# --- administration, permissions, audit ---------------------------------------------


@pytest.mark.asyncio
async def test_admin_endpoints_need_rewards_manage(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    customer, _owner, org_id, program = await _setup(db_async)
    await _earn(db_async, customer, org_id, 1)
    adjust = {
        "account_id": str(customer.id),
        "program_id": str(program.id),
        "amount": 3,
        "reason": "Festival goodwill",
    }
    plain = headers_for(customer)
    for method, path in (
        ("get", "/admin/programs"),
        ("get", "/admin/flags"),
    ):
        assert (
            await async_client.request(method, API + path, headers=plain)
        ).status_code == 403
    assert (
        await async_client.post(f"{API}/admin/adjustments", headers=plain, json=adjust)
    ).status_code == 403

    delegate = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "rewards.manage")
    await assign_role(db_async, user=delegate, role=role)
    await db_async.commit()
    for headers in (headers_for(delegate), superuser_token_headers_async):
        listing = await async_client.get(f"{API}/admin/programs", headers=headers)
        assert listing.status_code == 200
        assert listing.json()["data"][0]["organisation_name"]

    done = await async_client.post(
        f"{API}/admin/adjustments", headers=headers_for(delegate), json=adjust
    )
    assert done.status_code == 201, done.text
    assert (await _card(async_client, customer))["balance"] == 4

    rows = list(
        await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.entity_type == "rewards_account",
                AuditEntry.entity_id == str(customer.id),
            )
        )
    )
    adjusted = [
        r
        for r in rows
        if r.action == "create"
        and any(
            c["field"] == "reason" and c["new"] == "Festival goodwill"
            for c in r.changes
        )
    ]
    assert adjusted
    assert adjusted[0].actor_user_id == delegate.id


@pytest.mark.asyncio
async def test_adjustment_rules(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    customer, _owner, _org_id, program = await _setup(db_async)
    base = {"account_id": str(customer.id), "program_id": str(program.id)}
    url = f"{API}/admin/adjustments"
    h = superuser_token_headers_async
    assert (
        await async_client.post(
            url, headers=h, json={**base, "amount": 0, "reason": "none"}
        )
    ).status_code == 422
    assert (
        await async_client.post(
            url, headers=h, json={**base, "amount": -1, "reason": "too low"}
        )
    ).status_code == 422
    assert (
        await async_client.post(
            url, headers=h, json={**base, "amount": 1, "reason": ""}
        )
    ).status_code == 422
    assert (
        await async_client.post(
            url, headers=h, json={**base, "amount": 1, "reason": "ok ok"}
        )
    ).status_code == 201


@pytest.mark.asyncio
async def test_flag_review_flow(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(rewards_settings, "VELOCITY_MAX_EARNS", 1)
    customer, _owner, org_id, _program = await _setup(db_async)
    await _earn(db_async, customer, org_id, 3)
    h = superuser_token_headers_async
    flags = (await async_client.get(f"{API}/admin/flags", headers=h)).json()
    mine = [f for f in flags if f["account_id"] == str(customer.id)]
    assert len(mine) == 1
    resolved = await async_client.post(
        f"{API}/admin/flags/{mine[0]['id']}/resolve",
        headers=h,
        json={"note": "Door staff scanned a group"},
    )
    assert resolved.status_code == 200
    assert resolved.json()["resolved_at"]
    again = await async_client.post(
        f"{API}/admin/flags/{mine[0]['id']}/resolve",
        headers=h,
        json={"note": "Door staff scanned a group"},
    )
    assert again.status_code == 409


# --- Events: badges, tickets ---------------------------------------------------


@pytest.fixture
def events_session(events_db: SessionFactory) -> SessionFactory:
    return events_db


async def _admit(
    factory: SessionFactory,
    *,
    user: User,
    organisation_id: str,
    total_minor: int = 0,
) -> tuple[uuid.UUID, uuid.UUID, uuid.UUID]:
    """An organiser linked to the organisation, one ticket for ``user``, admitted."""
    now = utc_now()
    async with factory() as db:
        suffix = uuid.uuid4().hex[:8]
        organiser = await db.scalar(
            select(Organiser).where(Organiser.organisation_id == organisation_id)
        )
        if organiser is None:
            organiser = Organiser(
                slug=f"org-{suffix}",
                name="Org",
                verified=True,
                organisation_id=organisation_id,
            )
            db.add(organiser)
            await db.flush()
        listing = Listing(
            slug=f"ev-{suffix}",
            title="Event",
            category="fete",
            parish="st-george",
            venue="Stadium",
            starts_at=now,
            ends_at=now + timedelta(hours=2),
            admission="free",
            organiser_id=organiser.id,
            status="published",
        )
        db.add(listing)
        await db.flush()
        from src.events.models import TicketTier

        tier = TicketTier(
            listing_id=listing.id,
            name="General",
            price_minor=total_minor,
            allocation=10,
        )
        order = Order(listing_id=listing.id, user_id=user.id, total_minor=total_minor)
        db.add_all([tier, order])
        await db.flush()
        ticket = Ticket(
            order_id=order.id,
            listing_id=listing.id,
            tier_id=tier.id,
            user_id=user.id,
            code=uuid.uuid4().hex,
        )
        db.add(ticket)
        await db.flush()
        admission = Admission(
            ticket_id=ticket.id, listing_id=listing.id, admitted_by=uuid.uuid4()
        )
        db.add(admission)
        await db.commit()
        return admission.id, ticket.id, order.id


@pytest.mark.asyncio
async def test_badges_are_derived_from_records(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    events_session: SessionFactory,
    mfa_admin,
) -> None:
    person = await make_user(db_async)
    org = await _rewards_org(
        db_async, "Verified Ltd", members=((person, MembershipRole.MEMBER),)
    )
    h = headers_for(person)

    def earned(resp: httpx.Response) -> dict[str, bool]:
        return {b["key"]: b["earned"] for b in resp.json()}

    start = await async_client.get(f"{API}/me/badges", headers=h)
    assert earned(start) == {
        "verified_organiser": False,
        "verified_attendee": False,
        "verified_purchaser": False,
    }
    verify = await async_client.post(
        f"/api/v1/organisations/{org.id}/verify",
        headers=(await mfa_admin())[1],
        json={"reason": "Checked registration"},
    )
    assert verify.status_code == 200, verify.text
    await _admit(events_session, user=person, organisation_id=org.id, total_minor=0)
    assert earned(await async_client.get(f"{API}/me/badges", headers=h)) == {
        "verified_organiser": True,
        "verified_attendee": True,
        "verified_purchaser": False,
    }
    await _admit(events_session, user=person, organisation_id=org.id, total_minor=5000)
    assert earned(await async_client.get(f"{API}/me/badges", headers=h))[
        "verified_purchaser"
    ]
    # Derived only: nothing can be written to a badge.
    for method in ("post", "put", "patch", "delete"):
        resp = await async_client.request(method, f"{API}/me/badges", headers=h)
        assert resp.status_code == 405


@pytest.mark.asyncio
async def test_my_tickets_lists_only_my_tickets(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    events_session: SessionFactory,
) -> None:
    mine = await make_user(db_async)
    theirs = await make_user(db_async)
    org = await _rewards_org(db_async, "Tickets Ltd")
    await _admit(events_session, user=mine, organisation_id=org.id)
    await _admit(events_session, user=theirs, organisation_id=org.id)
    resp = await async_client.get(f"{API}/me/tickets", headers=headers_for(mine))
    assert resp.status_code == 200, resp.text
    assert len(resp.json()) == 1


@pytest.mark.asyncio
async def test_rewards_routes_need_sign_in(async_client: httpx.AsyncClient) -> None:
    for path in ("/me", "/me/badges", "/me/tickets", "/me/entries", "/admin/programs"):
        assert (await async_client.get(API + path)).status_code == 401
    assert EntryKind.EARN.value == "earn"
