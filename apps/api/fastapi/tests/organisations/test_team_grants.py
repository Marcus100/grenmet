"""Team-management grant routes (ADR-0044, S3)."""

from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.exc import DBAPIError, IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.organisations import grants, role_bundles, service
from src.organisations.dependencies import OrgContext
from src.organisations.exceptions import GrantConflictError, GrantNotHeldError
from src.organisations.members import apply_removal
from src.organisations.models import Membership, MembershipGrant, MembershipRole
from src.organisations.team import conflicts_as_409
from src.utils.datetime import utc_now
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

API = "/api/v1/organisations/org"
ORG_API = "/api/v1/organisations"


async def _membership(db: AsyncSession, org_id: str, user) -> Membership:
    return (
        await db.execute(
            select(Membership)
            .where(Membership.organisation_id == org_id, Membership.user_id == user.id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()


async def _seed_grant(db, grantor, org, target, role_key, **kw) -> MembershipGrant:
    resolved = await service.resolve_membership(
        db, user_id=grantor.id, organisation_id=org.id
    )
    context = OrgContext(
        organisation=resolved.organisation, membership=resolved.membership, user=grantor
    )
    row = await _membership(db, org.id, target)
    grant = await grants.grant_role(
        db, context, membership_id=row.id, role_key=role_key, **kw
    )
    await db.commit()
    return grant


async def _world(db: AsyncSession):
    owner = await make_user(db)
    lead = await make_user(db)
    other = await make_user(db)
    org = await make_org(
        db,
        "Venue",
        members=(
            (owner, MembershipRole.OWNER),
            (lead, MembershipRole.MEMBER),
            (other, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    return owner, lead, other, org


async def _grant(client, actor, org, target_membership_id, role_key, **body):
    return await client.post(
        f"{API}/members/{target_membership_id}/grants",
        json={"role_key": role_key, **body},
        headers=headers_for(actor, org.id),
    )


async def test_member_without_team_manage_is_refused_everywhere(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, lead, other, org = await _world(db_async)
    mid = (await _membership(db_async, org.id, other)).id
    headers = headers_for(lead, org.id)
    assert (
        await async_client.get(f"{API}/role-bundles", headers=headers)
    ).status_code == 403
    assert (
        await async_client.get(f"{API}/members/{mid}/grants", headers=headers)
    ).status_code == 403
    assert (
        await _grant(async_client, lead, org, mid, "events-door")
    ).status_code == 403
    assert (
        await async_client.post(f"{API}/grants/grant_x/revoke", headers=headers)
    ).status_code == 403
    assert (
        await async_client.get(f"{API}/members/{mid}/issued-grants", headers=headers)
    ).status_code == 403


async def test_owner_grants_lists_and_revokes_without_emails(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, lead, other, org = await _world(db_async)
    mid = (await _membership(db_async, org.id, other)).id
    when = (utc_now() + timedelta(days=2)).isoformat() + "Z"
    created = await _grant(
        async_client, owner, org, mid, "events-door", expires_at=when
    )
    assert created.status_code == 201
    body = created.json()
    assert body["role_key"] == "events-door"
    assert body["member_name"] == other.full_name
    assert body["granted_by_name"] == owner.full_name
    assert body["expires_at"] is not None

    listed = await async_client.get(
        f"{API}/members/{mid}/grants", headers=headers_for(owner, org.id)
    )
    assert [g["id"] for g in listed.json()] == [body["id"]]
    for response in (created, listed):
        assert "@" not in response.text
        assert other.email not in response.text and owner.email not in response.text

    dup = await _grant(async_client, owner, org, mid, "events-door")
    assert dup.status_code == 409

    revoked = await async_client.post(
        f"{API}/grants/{body['id']}/revoke", headers=headers_for(owner, org.id)
    )
    assert revoked.status_code == 200
    assert revoked.json()["revoked_at"] is not None
    assert "@" not in revoked.text
    again = await async_client.get(
        f"{API}/members/{mid}/grants", headers=headers_for(owner, org.id)
    )
    assert again.json() == []


async def test_expired_grants_are_not_listed(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, _, other, org = await _world(db_async)
    row = await _membership(db_async, org.id, other)
    grant = await _seed_grant(db_async, owner, org, other, "events-till")
    grant.expires_at = utc_now() - timedelta(minutes=1)
    await db_async.commit()
    listed = await async_client.get(
        f"{API}/members/{row.id}/grants", headers=headers_for(owner, org.id)
    )
    assert listed.status_code == 200 and listed.json() == []


async def test_lead_grants_only_bundles_they_hold_and_not_to_self(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, lead, other, org = await _world(db_async)
    await _seed_grant(db_async, owner, org, lead, "events-team")
    await _seed_grant(db_async, owner, org, lead, "events-door")
    mid = (await _membership(db_async, org.id, other)).id
    lead_mid = (await _membership(db_async, org.id, lead)).id

    assert (
        await _grant(async_client, lead, org, mid, "events-door")
    ).status_code == 201
    # Not held by the lead.
    assert (
        await _grant(async_client, lead, org, mid, "events-till")
    ).status_code == 403
    assert (
        await _grant(async_client, lead, org, mid, "events-manager")
    ).status_code == 403
    # Self-grant, even of a bundle they hold.
    assert (
        await _grant(async_client, lead, org, lead_mid, "events-door")
    ).status_code == 403
    assert (
        await _grant(async_client, lead, org, lead_mid, "events-till")
    ).status_code == 403
    assert (
        await _grant(async_client, lead, org, mid, "events-nope")
    ).status_code == 422

    bundles = await async_client.get(
        f"{API}/role-bundles", headers=headers_for(lead, org.id)
    )
    assert bundles.status_code == 200
    flags = {b["role_key"]: b["grantable"] for b in bundles.json()}
    assert flags == {
        "events-door": True,
        "events-manager": False,
        "events-refunds": False,
        "events-team": True,
        "events-till": False,
    }
    assert all(b["product"] == "events" for b in bundles.json())


async def test_self_grant_by_owner_is_refused(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, _, _, org = await _world(db_async)
    own = (await _membership(db_async, org.id, owner)).id
    response = await _grant(async_client, owner, org, own, "events-door")
    assert response.status_code == 403


async def test_expiry_cannot_outlast_the_grantors_access(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, lead, other, org = await _world(db_async)
    soon = utc_now() + timedelta(days=1)
    await _seed_grant(db_async, owner, org, lead, "events-team", expires_at=soon)
    await _seed_grant(db_async, owner, org, lead, "events-door", expires_at=soon)
    mid = (await _membership(db_async, org.id, other)).id

    beyond = (soon + timedelta(days=3)).isoformat() + "Z"
    assert (
        await _grant(async_client, lead, org, mid, "events-door", expires_at=beyond)
    ).status_code == 422
    assert (
        await _grant(async_client, lead, org, mid, "events-door")
    ).status_code == 422
    past = (utc_now() - timedelta(hours=1)).isoformat() + "Z"
    assert (
        await _grant(async_client, owner, org, mid, "events-door", expires_at=past)
    ).status_code == 422
    within = (soon - timedelta(hours=1)).isoformat() + "Z"
    assert (
        await _grant(async_client, lead, org, mid, "events-door", expires_at=within)
    ).status_code == 201


async def test_cross_organisation_and_superuser_without_membership_get_404(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
):
    owner, _, other, org = await _world(db_async)
    outsider = await make_user(db_async)
    foreign = await make_org(
        db_async,
        "Elsewhere",
        members=((outsider, MembershipRole.OWNER),),
        apps=("events",),
    )
    mid = (await _membership(db_async, org.id, other)).id
    grant = await _seed_grant(db_async, owner, org, other, "events-door")

    # A stranger naming our organisation: no existence leak.
    for response in (
        await async_client.get(
            f"{API}/role-bundles", headers=headers_for(outsider, org.id)
        ),
        await async_client.get(
            f"{API}/members/{mid}/grants", headers=headers_for(outsider, org.id)
        ),
        await _grant(async_client, outsider, org, mid, "events-door"),
        await async_client.post(
            f"{API}/grants/{grant.id}/revoke", headers=headers_for(outsider, org.id)
        ),
    ):
        assert response.status_code == 404

    # Their own organisation, someone else's member or grant: not found.
    assert (
        await _grant(async_client, outsider, foreign, mid, "events-door")
    ).status_code == 404
    assert (
        await async_client.get(
            f"{API}/members/{mid}/grants", headers=headers_for(outsider, foreign.id)
        )
    ).status_code == 404
    assert (
        await async_client.get(
            f"{API}/members/{mid}/issued-grants",
            headers=headers_for(outsider, foreign.id),
        )
    ).status_code == 404
    assert (
        await async_client.post(
            f"{API}/grants/{grant.id}/revoke", headers=headers_for(outsider, foreign.id)
        )
    ).status_code == 404

    # A superuser without a membership gets no bypass.
    sh = {**superuser_token_headers_async, "X-Barrels-Organisation": org.id}
    assert (
        await async_client.get(f"{API}/role-bundles", headers=sh)
    ).status_code == 404
    assert (
        await async_client.post(
            f"{API}/members/{mid}/grants", json={"role_key": "events-door"}, headers=sh
        )
    ).status_code == 404


async def test_unentitled_organisation_has_no_bundles_to_manage(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner = await make_user(db_async)
    org = await make_org(db_async, "NoEvents", members=((owner, MembershipRole.OWNER),))
    response = await async_client.get(
        f"{API}/role-bundles", headers=headers_for(owner, org.id)
    )
    assert response.status_code == 403


async def test_changes_are_audited_with_the_actor(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, _, other, org = await _world(db_async)
    mid = (await _membership(db_async, org.id, other)).id
    created = await _grant(async_client, owner, org, mid, "events-door")
    await async_client.post(
        f"{API}/grants/{created.json()['id']}/revoke",
        headers=headers_for(owner, org.id),
    )
    entries = list(
        (
            await db_async.scalars(
                select(AuditEntry)
                .where(
                    AuditEntry.entity_id == org.id,
                    AuditEntry.record_type == "organisation_membership_grant",
                )
                .order_by(AuditEntry.created_at)
                .execution_options(populate_existing=True)
            )
        ).all()
    )
    assert [(e.action, e.actor_user_id) for e in entries] == [
        ("create", owner.id),
        ("update", owner.id),
    ]


async def test_removing_an_issuer_revokes_what_they_issued_and_demotion_lists_it(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, lead, other, org = await _world(db_async)
    await _seed_grant(db_async, owner, org, lead, "events-team")
    await _seed_grant(db_async, owner, org, lead, "events-door")
    lead_mid = (await _membership(db_async, org.id, lead)).id
    other_mid = (await _membership(db_async, org.id, other)).id
    assert (
        await _grant(async_client, lead, org, other_mid, "events-door")
    ).status_code == 201
    owner_headers = headers_for(owner, org.id)

    # Demotion keeps the grants but an admin can review them.
    demoted = await async_client.patch(
        f"{ORG_API}/{org.id}/members/{lead_mid}",
        json={"role": "member"},
        headers=owner_headers,
    )
    assert demoted.status_code == 200
    issued = await async_client.get(
        f"{API}/members/{lead_mid}/issued-grants", headers=owner_headers
    )
    assert [(g["role_key"], g["member_name"]) for g in issued.json()] == [
        ("events-door", other.full_name)
    ]
    assert "@" not in issued.text

    # Removal revokes what they issued, and their own roles.
    removed = await async_client.delete(
        f"{ORG_API}/{org.id}/members/{lead_mid}", headers=owner_headers
    )
    assert removed.status_code == 204
    after = await async_client.get(
        f"{API}/members/{other_mid}/grants", headers=owner_headers
    )
    assert after.json() == []
    rows = (
        await db_async.scalars(
            select(MembershipGrant)
            .where(MembershipGrant.organisation_id == org.id)
            .execution_options(populate_existing=True)
        )
    ).all()
    assert rows and all(r.revoked_at is not None for r in rows)
    count_entry = await db_async.scalar(
        select(AuditEntry).where(
            AuditEntry.entity_id == org.id, AuditEntry.action == "revoke_issued_grants"
        )
    )
    assert count_entry is not None and count_entry.actor_user_id == owner.id
    # Audit: the removal's revocations name the person who removed them.
    updates = list(
        (
            await db_async.scalars(
                select(AuditEntry).where(
                    AuditEntry.entity_id == org.id,
                    AuditEntry.record_type == "organisation_membership_grant",
                    AuditEntry.action == "update",
                )
            )
        ).all()
    )
    assert updates and all(e.actor_user_id == owner.id for e in updates)


async def test_conflicts_map_to_409():
    class _Cause(Exception):
        def __init__(self, state: str) -> None:
            self.sqlstate = state

    for state in ("40P01", "40001", "23505"):
        with pytest.raises(GrantConflictError):
            async with conflicts_as_409():
                raise DBAPIError("stmt", {}, _Cause(state))
    # Other integrity errors (or unknown driver errors) are bugs, not races.
    with pytest.raises(IntegrityError):
        async with conflicts_as_409():
            raise IntegrityError("stmt", {}, _Cause("23503"))
    with pytest.raises(DBAPIError):
        async with conflicts_as_409():
            raise DBAPIError("stmt", {}, Exception())


async def test_revoke_checks_authority_before_returning_a_revoked_grant(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, lead, other, org = await _world(db_async)
    await _seed_grant(db_async, owner, org, lead, "events-team")
    await _seed_grant(db_async, owner, org, lead, "events-door")
    till = await _seed_grant(db_async, owner, org, other, "events-till")
    live = await _seed_grant(db_async, owner, org, other, "events-door")
    ended = await _seed_grant(db_async, owner, org, other, "events-refunds")
    ended.revoked_at = utc_now()
    await db_async.commit()

    headers = headers_for(lead, org.id)
    for grant_id in (till.id, ended.id):  # live and already revoked, not held
        response = await async_client.post(
            f"{API}/grants/{grant_id}/revoke", headers=headers
        )
        assert response.status_code == 403
        assert other.full_name not in response.text
    await db_async.refresh(till)
    assert till.revoked_at is None
    # A bundle they do hold can be revoked; repeating is idempotent.
    for _ in range(2):
        assert (
            await async_client.post(f"{API}/grants/{live.id}/revoke", headers=headers)
        ).status_code == 200


async def test_listing_is_limited_to_products_the_caller_manages(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, lead, other, org = await _world(db_async)
    await _seed_grant(db_async, owner, org, other, "events-door")
    # A role of a product the organisation is not entitled to (retired or foreign).
    db_async.add(
        MembershipGrant(
            id="grant_foreign",
            membership_id=(await _membership(db_async, org.id, other)).id,
            organisation_id=org.id,
            role_key="bookings-agenda",
            granted_by=owner.id,
            granted_at=utc_now(),
        )
    )
    await db_async.commit()
    mid = (await _membership(db_async, org.id, other)).id
    listed = await async_client.get(
        f"{API}/members/{mid}/grants", headers=headers_for(owner, org.id)
    )
    assert [g["role_key"] for g in listed.json()] == ["events-door"]


async def test_grantor_removed_first_cannot_grant(db_async: AsyncSession):
    owner, lead, other, org = await _world(db_async)
    await _seed_grant(db_async, owner, org, lead, "events-team")
    await _seed_grant(db_async, owner, org, lead, "events-door")
    resolved = await service.resolve_membership(
        db_async, user_id=lead.id, organisation_id=org.id
    )
    stale = OrgContext(
        organisation=resolved.organisation, membership=resolved.membership, user=lead
    )
    lead_row = await _membership(db_async, org.id, lead)
    await apply_removal(
        db_async,
        org.id,
        lead_row.id,
        actor_id=owner.id,
        actor_may_grant_owner=True,
    )
    await db_async.commit()
    target = await _membership(db_async, org.id, other)
    with pytest.raises(GrantNotHeldError):
        await grants.grant_role(
            db_async, stale, membership_id=target.id, role_key="events-door"
        )
    assert (
        await grants.list_issued_by(db_async, organisation_id=org.id, user_id=lead.id)
        == []
    )


# ── Roster, capabilities, bundle copy ────────────────────────────────────────

TEAM = f"{API}/team"


async def test_every_bundle_has_label_and_description():
    assert set(role_bundles.BUNDLE_COPY) == set(role_bundles.ROLE_BUNDLES)
    for role_key, (label, description) in role_bundles.BUNDLE_COPY.items():
        assert label.strip() and description.strip(), role_key


async def test_bundles_return_label_and_description(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, _, _, org = await _world(db_async)
    response = await async_client.get(
        f"{API}/role-bundles", headers=headers_for(owner, org.id)
    )
    bundles = response.json()
    assert len(bundles) == len(role_bundles.ROLE_BUNDLES)
    for bundle in bundles:
        label, description = role_bundles.BUNDLE_COPY[bundle["role_key"]]
        assert bundle["label"] == label and bundle["description"] == description


async def test_roster_for_team_manager_is_limited_to_their_products(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, lead, other, org = await _world(db_async)
    await _seed_grant(db_async, owner, org, lead, "events-team")
    await _seed_grant(db_async, owner, org, other, "events-door")
    # A grant of a product the lead does not manage must not show.
    other_row = await _membership(db_async, org.id, other)
    db_async.add(
        MembershipGrant(
            id="grant_bk",
            organisation_id=org.id,
            membership_id=other_row.id,
            role_key="bookings-manager",
            granted_by=owner.id,
        )
    )
    await db_async.commit()

    lead_view = await async_client.get(
        f"{TEAM}/members", headers=headers_for(lead, org.id)
    )
    assert lead_view.status_code == 200
    body = lead_view.json()
    assert body["count"] == 3
    by_id = {m["membership_id"]: m for m in body["data"]}
    assert [g["role_key"] for g in by_id[other_row.id]["grants"]] == ["events-door"]
    assert "bookings-manager" not in lead_view.text
    assert "@" not in lead_view.text
    for user in (owner, lead, other):
        assert user.email not in lead_view.text

    owner_view = await async_client.get(
        f"{TEAM}/members", headers=headers_for(owner, org.id)
    )
    roles = {m["role"] for m in owner_view.json()["data"]}
    assert roles == {"owner", "member"}
    owner_row = await _membership(db_async, org.id, owner)
    assert by_id[owner_row.id]["role"] == "owner"
    assert by_id[owner_row.id]["name"] == owner.full_name


async def test_roster_marks_only_the_callers_own_row(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, lead, other, org = await _world(db_async)
    await _seed_grant(db_async, owner, org, lead, "events-team")
    owner_row = await _membership(db_async, org.id, owner)
    lead_row = await _membership(db_async, org.id, lead)
    other_row = await _membership(db_async, org.id, other)

    lead_view = await async_client.get(
        f"{TEAM}/members", headers=headers_for(lead, org.id)
    )
    assert lead_view.status_code == 200
    lead_flags = {m["membership_id"]: m["is_self"] for m in lead_view.json()["data"]}
    assert lead_flags == {
        owner_row.id: False,
        lead_row.id: True,
        other_row.id: False,
    }

    owner_view = await async_client.get(
        f"{TEAM}/members", headers=headers_for(owner, org.id)
    )
    owner_flags = {m["membership_id"]: m["is_self"] for m in owner_view.json()["data"]}
    assert owner_flags == {
        owner_row.id: True,
        lead_row.id: False,
        other_row.id: False,
    }
    assert "@" not in lead_view.text + owner_view.text
    assert owner.email not in owner_view.text


async def test_roster_names_who_gave_each_grant(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, lead, other, org = await _world(db_async)
    await _seed_grant(db_async, owner, org, lead, "events-team")
    lead_row = await _membership(db_async, org.id, lead)

    view = await async_client.get(f"{TEAM}/members", headers=headers_for(lead, org.id))
    by_id = {m["membership_id"]: m for m in view.json()["data"]}
    [given] = by_id[lead_row.id]["grants"]
    assert given["granted_by_name"] == owner.full_name
    assert owner.email not in view.text
    assert "@" not in view.text


async def test_roster_names_a_giver_who_has_since_been_removed(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, lead, other, org = await _world(db_async)
    await _seed_grant(db_async, owner, org, lead, "events-team")
    lead_row = await _membership(db_async, org.id, lead)
    await apply_removal(
        db_async, org.id, lead_row.id, actor_id=owner.id, actor_may_grant_owner=True
    )
    # Removal normally revokes what a person handed out. A live grant whose giver
    # is no longer a member must still name them rather than show nothing.
    other_row = await _membership(db_async, org.id, other)
    db_async.add(
        MembershipGrant(
            id="grant_from_removed",
            organisation_id=org.id,
            membership_id=other_row.id,
            role_key="events-door",
            granted_by=lead.id,
        )
    )
    await db_async.commit()

    view = await async_client.get(f"{TEAM}/members", headers=headers_for(owner, org.id))
    by_id = {m["membership_id"]: m for m in view.json()["data"]}
    assert lead_row.id not in by_id
    [given] = by_id[other_row.id]["grants"]
    assert given["granted_by_name"] == lead.full_name
    assert lead.email not in view.text


async def test_roster_refuses_plain_member_and_unknown_org(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, lead, _, org = await _world(db_async)
    assert (
        await async_client.get(f"{TEAM}/members", headers=headers_for(lead, org.id))
    ).status_code == 403
    outsider = await make_user(db_async)
    assert (
        await async_client.get(f"{TEAM}/members", headers=headers_for(outsider, org.id))
    ).status_code == 404
    assert (
        await async_client.get(f"{TEAM}/me", headers=headers_for(outsider, org.id))
    ).status_code == 404
    root = await make_user(db_async, superuser=True)
    for path in ("members", "me"):
        assert (
            await async_client.get(f"{TEAM}/{path}", headers=headers_for(root, org.id))
        ).status_code == 404


async def test_roster_admin_sees_all_entitled_products_and_excludes_inactive(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, lead, other, org = await _world(db_async)
    admin = await make_user(db_async)
    await service.add_member(
        db_async, organisation_id=org.id, user_id=admin.id, role=MembershipRole.ADMIN
    )
    await db_async.commit()
    await _seed_grant(db_async, owner, org, other, "events-till")
    lead_row = await _membership(db_async, org.id, lead)
    lead_row.status = "removed"
    await db_async.commit()

    response = await async_client.get(
        f"{TEAM}/members", headers=headers_for(admin, org.id)
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert response.json()["count"] == 3
    assert lead_row.id not in {m["membership_id"] for m in data}
    admin_row = next(m for m in data if m["role"] == "admin")
    assert admin_row["name"] == admin.full_name
    till = next(m for m in data if m["grants"])
    assert till["grants"][0]["role_key"] == "events-till"


async def test_roster_excludes_invited_and_paginates(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, lead, other, org = await _world(db_async)
    other_row = await _membership(db_async, org.id, other)
    other_row.status = "invited"
    await db_async.commit()

    headers = headers_for(owner, org.id)
    first = await async_client.get(
        f"{TEAM}/members", params={"page": 1, "size": 1}, headers=headers
    )
    second = await async_client.get(
        f"{TEAM}/members", params={"page": 2, "size": 1}, headers=headers
    )
    third = await async_client.get(
        f"{TEAM}/members", params={"page": 3, "size": 1}, headers=headers
    )
    assert first.json()["count"] == 2
    assert len(first.json()["data"]) == len(second.json()["data"]) == 1
    assert third.json()["data"] == []
    ids = {
        first.json()["data"][0]["membership_id"],
        second.json()["data"][0]["membership_id"],
    }
    assert other_row.id not in ids and len(ids) == 2


async def test_team_me_capabilities(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, lead, other, org = await _world(db_async)
    await _seed_grant(db_async, owner, org, lead, "events-team")

    async def me(user):
        r = await async_client.get(f"{TEAM}/me", headers=headers_for(user, org.id))
        assert r.status_code == 200
        return r.json()

    assert await me(owner) == {
        "role": "owner",
        "managed_products": ["events"],
        "is_admin_or_owner": True,
    }
    assert await me(lead) == {
        "role": "member",
        "managed_products": ["events"],
        "is_admin_or_owner": False,
    }
    assert await me(other) == {
        "role": "member",
        "managed_products": [],
        "is_admin_or_owner": False,
    }


async def test_product_keys_with_team_manage_are_safe_for_prefix_filter():
    products = sorted({role_bundles.product_of_key(k) for k in grants.product_keys()})
    managed = [p for p in products if f"{p}.team.manage" in grants.product_keys()]
    assert managed
    for product in managed:
        assert not set("-_%") & set(product), product
        assert not any(o != product and o.startswith(product) for o in products), (
            product
        )


async def test_roster_excludes_deactivated_accounts(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, lead, other, org = await _world(db_async)
    other.is_active = False
    await db_async.commit()
    response = await async_client.get(
        f"{TEAM}/members", headers=headers_for(owner, org.id)
    )
    assert response.json()["count"] == 2
    other_row = await _membership(db_async, org.id, other)
    assert other_row.id not in {m["membership_id"] for m in response.json()["data"]}


async def test_roster_never_lists_another_organisations_members(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, _, _, org = await _world(db_async)
    stranger = await make_user(db_async)
    await make_org(
        db_async,
        "Other",
        members=((stranger, MembershipRole.OWNER),),
        apps=("events",),
    )
    response = await async_client.get(
        f"{TEAM}/members", headers=headers_for(owner, org.id)
    )
    assert response.json()["count"] == 3
    assert stranger.full_name not in response.text or stranger.full_name in {
        owner.full_name
    }
    stranger_row = await db_async.scalar(
        select(Membership.id).where(Membership.user_id == stranger.id)
    )
    assert stranger_row not in {m["membership_id"] for m in response.json()["data"]}


async def test_lead_loses_team_routes_when_entitlement_is_switched_off(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, lead, _, org = await _world(db_async)
    await _seed_grant(db_async, owner, org, lead, "events-team")
    headers = headers_for(lead, org.id)
    assert (
        await async_client.get(f"{TEAM}/members", headers=headers)
    ).status_code == 200
    await service.set_app_enabled(
        db_async, organisation_id=org.id, app_key="events", enabled=False
    )
    await db_async.commit()
    for path in (f"{TEAM}/members", f"{API}/role-bundles"):
        assert (await async_client.get(path, headers=headers)).status_code == 403


async def test_nobody_can_revoke_their_own_grant(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    """The Events team screen hides own-row controls because the API refuses them:
    a lead holding the door bundle cannot take their own door grant away, even
    though they could revoke the same bundle from someone else."""
    owner, lead, other, org = await _world(db_async)
    await _seed_grant(db_async, owner, org, lead, "events-team")
    own = await _seed_grant(db_async, owner, org, lead, "events-door")
    theirs = await _seed_grant(db_async, owner, org, other, "events-door")

    headers = headers_for(lead, org.id)
    refused = await async_client.post(f"{API}/grants/{own.id}/revoke", headers=headers)
    assert refused.status_code == 403
    assert refused.json() == {"detail": "You cannot change your own roles"}
    await db_async.refresh(own)
    assert own.revoked_at is None

    allowed = await async_client.post(
        f"{API}/grants/{theirs.id}/revoke", headers=headers
    )
    assert allowed.status_code == 200
