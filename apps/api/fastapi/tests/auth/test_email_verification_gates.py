"""Email verification gates for money and power (ADR-0018, 2026-10-20).

Sign-in and browsing never need a verified email. A deposit, an administrator
role or membership, and payout details do.
"""

import uuid

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.assignments import create_user_role_assignment
from src.auth.email_verification import (
    ERROR_CODE,
    EmailNotVerifiedError,
    require_verified_email,
)
from src.auth.models import Role
from src.auth.schemas import UserRoleAssignmentCreate
from src.bookings.models import Booking
from src.exceptions import AppException
from src.organisations import service as org_service
from src.organisations.models import MembershipRole
from src.utils.datetime import utc_now
from tests.bookings.email_code_helpers import get_proof
from tests.bookings.test_deposits import _deposit_studio
from tests.bookings.test_public_bookings import API as BOOKINGS
from tests.bookings.test_public_bookings import _body, _slots, _studio
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org
from tests.organisations.test_members import API as ORGS
from tests.organisations.test_members import _accept, _invite, _membership, _token_for


async def _verify(db: AsyncSession, user) -> None:
    user.email_verified_at = utc_now()
    await db.commit()


async def _book_as(client, studio, user=None, *, email=None, proof=None):
    slots = await _slots(client, studio)
    headers = {"Idempotency-Key": uuid.uuid4().hex}
    if user is not None:
        headers.update(headers_for(user))
    body = _body(studio, slots[0], **({"customer_email": email} if email else {}))
    if proof:
        body["email_proof"] = proof
    return await client.post(
        f"{BOOKINGS}/public/{studio.slug}/bookings", headers=headers, json=body
    )


# --- the rule itself -------------------------------------------------------------------


async def test_unverified_user_is_refused_with_a_stable_code(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async, verified=False)
    with pytest.raises(EmailNotVerifiedError) as raised:
        require_verified_email(user, "do a thing")
    assert raised.value.status_code == 403
    assert raised.value.message.startswith(f"{ERROR_CODE}:")
    await _verify(db_async, user)
    require_verified_email(user, "do a thing")


# --- sign-in and browsing never need verification -------------------------------------


async def test_sign_in_and_browsing_work_unverified(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    user = await make_user(db_async, password="password123", verified=False)
    assert user.email_verified_at is None
    signed_in = await async_client.post(
        "/api/v1/auth/sessions", json={"email": user.email, "password": "password123"}
    )
    assert signed_in.status_code == 200, signed_in.text
    # Browsing a public page with an unverified sign-in is fine.
    studio = await _studio(db_async, async_client)
    slots = await async_client.get(
        f"{BOOKINGS}/public/{studio.slug}/availability",
        params={
            "service_id": studio.service_id,
            "first_day": "2030-01-07",
            "last_day": "2030-01-07",
        },
        headers=headers_for(user),
    )
    assert slots.status_code == 200, slots.text


# --- (a) deposit ----------------------------------------------------------------------


async def test_unverified_account_needs_a_code_for_a_deposit(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _deposit_studio(db_async, async_client)
    payer = await make_user(db_async, verified=False)
    address = payer.email
    auth = headers_for(payer)
    response = await _book_as(async_client, studio, payer, email=address)
    assert response.status_code == 403, response.text
    assert response.json()["detail"].startswith(f"{ERROR_CODE}:")
    # Nothing was stored: no booking holds the slot.
    db_async.expire_all()
    assert not (await db_async.scalars(select(Booking))).all()
    # With the emailed code the same account can pay.
    slot = (await _slots(async_client, studio))[0]
    proof = await get_proof(db_async, async_client, studio, slot, address, auth)
    await db_async.refresh(payer)
    ok = await _book_as(async_client, studio, payer, email=address, proof=proof)
    assert ok.status_code == 201, ok.text
    assert ok.json()["payment_required"] is True


async def test_verified_account_booking_its_own_email_has_no_step(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _deposit_studio(db_async, async_client)
    payer = await make_user(db_async, verified=True)
    ok = await _book_as(async_client, studio, payer, email=payer.email)
    assert ok.status_code == 201, ok.text
    # Another address than the account's still needs proof.
    other = await _book_as(async_client, studio, payer, email="friend@example.com")
    assert other.status_code == 403


async def test_guest_deposit_is_gated_and_no_deposit_bookings_are_not(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    deposit_studio = await _deposit_studio(db_async, async_client)
    assert (await _book_as(async_client, deposit_studio)).status_code == 403
    free_studio = await _studio(db_async, async_client)
    unverified = await make_user(db_async, verified=False)
    assert (await _book_as(async_client, free_studio, unverified)).status_code == 201
    assert (await _book_as(async_client, free_studio)).status_code == 201


async def test_a_bad_token_on_the_public_route_is_treated_as_a_guest(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _deposit_studio(db_async, async_client)
    slots = await _slots(async_client, studio)
    response = await async_client.post(
        f"{BOOKINGS}/public/{studio.slug}/bookings",
        headers={"Idempotency-Key": "k" * 16, "Authorization": "Bearer nonsense"},
        json=_body(studio, slots[0]),
    )
    assert response.status_code == 403, response.text


# --- (b) staff or administrator role ---------------------------------------------------


async def test_staff_role_needs_a_verified_email(db_async: AsyncSession) -> None:
    target = await make_user(db_async, verified=False)
    role = Role(name="gate_staff_role", description="test")
    db_async.add(role)
    await db_async.commit()
    payload = UserRoleAssignmentCreate(user_id=target.id, role_id=role.id)
    with pytest.raises(AppException) as raised:
        await create_user_role_assignment(session=db_async, assignment_in=payload)
    assert raised.value.status_code == 403
    assert raised.value.message.startswith(ERROR_CODE)
    # A verified target gets past the gate and the assignment is stored (or fails
    # for an unrelated ownership rule, never the verification code).
    await _verify(db_async, target)
    try:
        created = await create_user_role_assignment(
            session=db_async, assignment_in=payload
        )
    except AppException as error:
        assert not error.message.startswith(ERROR_CODE)
        raise
    assert created.user_id == target.id


async def test_unauthorised_caller_cannot_probe_email_verification(
    db_async: AsyncSession,
) -> None:
    caller = await make_user(db_async)  # verified, but no assignment-management rights
    target = await make_user(db_async, verified=False)
    role = Role(name="gate_probe_role", description="test")
    db_async.add(role)
    await db_async.commit()
    payload = UserRoleAssignmentCreate(user_id=target.id, role_id=role.id)
    with pytest.raises(AppException) as raised:
        await create_user_role_assignment(
            session=db_async, assignment_in=payload, current_user=caller
        )
    assert not raised.value.message.startswith(ERROR_CODE)


async def test_admin_membership_needs_a_verified_email(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    owner = await make_user(db_async)
    org = await make_org(db_async, "Gate Org", members=((owner, MembershipRole.OWNER),))
    invitee = await make_user(db_async, verified=False)

    # Invited as admin: acceptance is refused until the email is verified.
    created = await _invite(async_client, owner, org, invitee.email, "admin")
    assert created.status_code == 201, created.text
    token = await _token_for(db_async, invitee.email)
    refused = await _accept(async_client, invitee, token)
    assert refused.status_code == 403, refused.text
    assert refused.json()["detail"].startswith(f"{ERROR_CODE}:")
    await _verify(db_async, invitee)
    assert (await _accept(async_client, invitee, token)).status_code == 200

    # Promoting an unverified ordinary member to admin is refused too.
    member = await make_user(db_async, verified=False)
    invited = await _invite(async_client, owner, org, member.email, "member")
    assert invited.status_code == 201, invited.text
    accepted = await _accept(
        async_client, member, await _token_for(db_async, member.email)
    )
    assert accepted.status_code == 200, accepted.text
    row = await _membership(db_async, org.id, member.id)
    assert row is not None
    membership_id = row.id
    promote = await async_client.patch(
        f"{ORGS}/{org.id}/members/{membership_id}",
        json={"role": "admin"},
        headers=headers_for(owner, org.id),
    )
    assert promote.status_code == 403, promote.text
    assert promote.json()["detail"].startswith(f"{ERROR_CODE}:")
    await _verify(db_async, member)
    ok = await async_client.patch(
        f"{ORGS}/{org.id}/members/{membership_id}",
        json={"role": "admin"},
        headers=headers_for(owner, org.id),
    )
    assert ok.status_code == 200, ok.text


async def test_ordinary_membership_never_needs_verification(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    owner = await make_user(db_async)
    org = await make_org(db_async, "Open Org", members=((owner, MembershipRole.OWNER),))
    guest = await make_user(db_async, verified=False)
    assert (
        await _invite(async_client, owner, org, guest.email, "member")
    ).status_code == 201
    token = await _token_for(db_async, guest.email)
    assert (await _accept(async_client, guest, token)).status_code == 200


# --- organisation owner/admin through add_member (ADR-0018) ----------------------------


@pytest.mark.parametrize("role", [MembershipRole.OWNER, MembershipRole.ADMIN])
async def test_add_member_needs_a_verified_email_for_owner_and_admin(
    db_async: AsyncSession, role: MembershipRole
) -> None:
    org = await make_org(db_async, name="Gate org")
    unverified = await make_user(db_async, verified=False)
    with pytest.raises(AppException) as raised:
        await org_service.add_member(
            db_async, organisation_id=org.id, user_id=unverified.id, role=role
        )
    assert raised.value.status_code == 403
    assert raised.value.message.startswith(ERROR_CODE)
    verified = await make_user(db_async)
    membership = await org_service.add_member(
        db_async, organisation_id=org.id, user_id=verified.id, role=role
    )
    assert membership.role == role.value


async def test_add_member_allows_ordinary_roles_and_explicit_exemption(
    db_async: AsyncSession,
) -> None:
    org = await make_org(db_async, name="Gate org 2")
    user = await make_user(db_async, verified=False)
    member = await org_service.add_member(
        db_async, organisation_id=org.id, user_id=user.id, role=MembershipRole.MEMBER
    )
    assert member.role == MembershipRole.MEMBER.value
    other = await make_user(db_async, verified=False)
    owner = await org_service.add_member(
        db_async,
        organisation_id=org.id,
        user_id=other.id,
        role=MembershipRole.OWNER,
        skip_email_check=True,
    )
    assert owner.role == MembershipRole.OWNER.value


# --- administrator-activated accounts are exempt (owner decision 2026-10-21) -----------


async def _admin_activate(db: AsyncSession, user) -> None:
    from src.auth import onboarding
    from src.auth.onboarding_schemas import ActivationConfirm

    admin = await make_user(db, superuser=True)
    link = await onboarding.issue_activation(db, admin, user.id, True)
    token = link.activation_url.split("token=", 1)[1]
    await onboarding.confirm_activation(
        db, ActivationConfirm(token=token, new_password="New-password-123!")
    )
    await db.refresh(user)
    assert user.email_verified_at is None  # activation leaves the mailbox unverified


async def test_admin_activated_account_can_receive_roles_and_memberships(
    db_async: AsyncSession,
) -> None:
    staff = await make_user(db_async, verified=False)
    await _admin_activate(db_async, staff)
    role = Role(name="gate_activated_role", description="test")
    db_async.add(role)
    await db_async.commit()
    created = await create_user_role_assignment(
        session=db_async,
        assignment_in=UserRoleAssignmentCreate(user_id=staff.id, role_id=role.id),
    )
    assert created.user_id == staff.id
    org = await make_org(db_async, name="Activated org")
    membership = await org_service.add_member(
        db_async, organisation_id=org.id, user_id=staff.id, role=MembershipRole.ADMIN
    )
    assert membership.role == MembershipRole.ADMIN.value


async def test_self_registered_unverified_account_is_still_refused(
    db_async: AsyncSession,
) -> None:
    person = await make_user(db_async, verified=False)
    role = Role(name="gate_selfreg_role", description="test")
    db_async.add(role)
    await db_async.commit()
    with pytest.raises(AppException) as raised:
        await create_user_role_assignment(
            session=db_async,
            assignment_in=UserRoleAssignmentCreate(user_id=person.id, role_id=role.id),
        )
    assert raised.value.message.startswith(ERROR_CODE)
    org = await make_org(db_async, name="Selfreg org")
    with pytest.raises(AppException) as raised:
        await org_service.add_member(
            db_async,
            organisation_id=org.id,
            user_id=person.id,
            role=MembershipRole.OWNER,
        )
    assert raised.value.message.startswith(ERROR_CODE)


async def test_activated_account_passes_invitation_accept_and_change_role(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    owner = await make_user(db_async)
    org = await make_org(db_async, "Act Org", members=((owner, MembershipRole.OWNER),))
    invitee = await make_user(db_async, verified=False)
    await _admin_activate(db_async, invitee)
    assert (
        await _invite(async_client, owner, org, invitee.email, "admin")
    ).status_code == 201
    token = await _token_for(db_async, invitee.email)
    assert (await _accept(async_client, invitee, token)).status_code == 200
    member = await make_user(db_async, verified=False)
    await _admin_activate(db_async, member)
    assert (
        await _invite(async_client, owner, org, member.email, "member")
    ).status_code == 201
    accepted = await _accept(
        async_client, member, await _token_for(db_async, member.email)
    )
    assert accepted.status_code == 200, accepted.text
    row = await _membership(db_async, org.id, member.id)
    assert row is not None
    promote = await async_client.patch(
        f"{ORGS}/{org.id}/members/{row.id}",
        json={"role": "admin"},
        headers=headers_for(owner, org.id),
    )
    assert promote.status_code == 200, promote.text


async def test_activation_link_issued_but_not_confirmed_is_refused(
    db_async: AsyncSession,
) -> None:
    from src.auth import onboarding

    person = await make_user(db_async, verified=False)
    admin = await make_user(db_async, superuser=True)
    await onboarding.issue_activation(db_async, admin, person.id, True)
    role = Role(name="gate_unconfirmed_role", description="test")
    db_async.add(role)
    await db_async.commit()
    with pytest.raises(AppException) as raised:
        await create_user_role_assignment(
            session=db_async,
            assignment_in=UserRoleAssignmentCreate(user_id=person.id, role_id=role.id),
        )
    assert raised.value.message.startswith(ERROR_CODE)


async def test_activated_account_that_changes_its_email_is_refused_again(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    from src.auth.schemas import UserUpdateMe
    from src.auth.service import update_user_me

    owner = await make_user(db_async)
    org = await make_org(db_async, "Swap Org", members=((owner, MembershipRole.OWNER),))
    victim_email = "victim-invitee@example.com"
    assert (
        await _invite(async_client, owner, org, victim_email, "admin")
    ).status_code == 201
    token = await _token_for(db_async, victim_email)

    person = await make_user(db_async, verified=False)
    await _admin_activate(db_async, person)
    await update_user_me(
        session=db_async,
        current_user=person,
        user_in=UserUpdateMe(email=victim_email),
    )
    assert person.email_verification_required is True

    refused = await _accept(async_client, person, token)
    assert refused.status_code == 403, refused.text
    assert refused.json()["detail"].startswith(f"{ERROR_CODE}:")
    role = Role(name="gate_swapped_role", description="test")
    db_async.add(role)
    await db_async.commit()
    with pytest.raises(AppException) as raised:
        await create_user_role_assignment(
            session=db_async,
            assignment_in=UserRoleAssignmentCreate(user_id=person.id, role_id=role.id),
        )
    assert raised.value.message.startswith(ERROR_CODE)
    with pytest.raises(AppException) as raised:
        await org_service.add_member(
            db_async,
            organisation_id=org.id,
            user_id=person.id,
            role=MembershipRole.OWNER,
        )
    assert raised.value.message.startswith(ERROR_CODE)
