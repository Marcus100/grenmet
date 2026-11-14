"""Account deletion anonymises the account (ADR-0058 section 7, issue #1375).

The person cannot sign in again and their credentials are revoked. Personal fields
are replaced. Rows that other tables reference (the rewards ledger, HR employment
records, audit) stay and point at the now-anonymous account. The deletion is audited
without any personal value.
"""

import re
import uuid
from datetime import date

import httpx
import pytest
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth import app_service, placeholders, service
from src.auth import utils as auth_utils
from src.auth.models import (
    Session,
    Title,
    User,
    UserImage,
    UserRoleAssignment,
    UserRoleLink,
)
from src.auth.modern_models import ExternalIdentity
from src.auth.schemas import UserCreate, UserUpdate, UserUpdateMe
from src.auth.utils import (
    ANONYMISED_PASSWORD_MARKER,
    verify_password,
    verify_password_async,
)
from src.baseline.models import StaffCredential
from src.contacts.models import Contact
from src.exceptions import AppException
from src.hr.models import (
    EmploymentRecord,
    EmploymentStatus,
    Gender,
    Grade,
    UserAddress,
    UserProfile,
)
from src.notifications.models import Notification, NotificationPreference
from src.organisations import api_keys
from src.organisations.models import (
    ApiKey,
    Membership,
    MembershipGrant,
    MembershipRole,
    MembershipStatus,
)
from src.organisations.schemas import ApiKeyCreate
from src.profile_images import service as profile_images_service
from src.rewards import service as rewards_service
from src.rewards.exceptions import RedemptionNotFoundError
from src.rewards.models import Entry, EntryStatus
from src.rewards.schemas import ProgramCreate
from src.utils.datetime import utc_now
from tests.factories import (
    make_department,
    make_employee,
    make_role_with_permission,
    make_user,
)
from tests.organisations.support import make_org

SESSIONS = "/api/v1/auth/sessions"
ME = "/api/v1/auth/users/me"
PASSWORD = "password123"


async def _login_headers(
    async_client: httpx.AsyncClient, db: AsyncSession, user: User
) -> dict[str, str]:
    await db.commit()
    login = await async_client.post(
        SESSIONS, json={"email": user.email, "password": PASSWORD}
    )
    assert login.status_code == 200, login.text
    return {"Authorization": "Bearer " + login.json()["access_token"]}


async def _session_count(db: AsyncSession, user_id: uuid.UUID) -> int:
    return int(
        await db.scalar(
            select(func.count()).select_from(Session).where(Session.user_id == user_id)
        )
        or 0
    )


async def _cafe_with_card(db: AsyncSession, *, stamps: int = 5):
    """An organisation with a stamp card and a customer who holds ``stamps`` stamps."""
    owner = await make_user(db)
    customer = await make_user(db)
    org = await make_org(
        db,
        "Anonymise Cafe",
        members=((owner, MembershipRole.OWNER),),
        apps=("rewards",),
    )
    program = await rewards_service.create_program(
        db,
        organisation_id=org.id,
        actor=owner,
        payload=ProgramCreate(
            name="Coffee card",
            stamps_required=5,
            reward_description="A free coffee",
        ),
    )
    for _ in range(stamps):
        await rewards_service.record_qualifying_action(
            db,
            source_type=rewards_service.EVENTS_ADMISSION,
            source_id=f"anon-{uuid.uuid4().hex[:8]}",
            organisation_id=org.id,
            user_id=customer.id,
        )
    await db.commit()
    return customer, program


async def _ledger_ids(db: AsyncSession, user_id: uuid.UUID) -> set[uuid.UUID]:
    rows = await db.scalars(select(Entry.id).where(Entry.account_id == user_id))
    return set(rows.all())


async def _deletion_audit_rows(
    db: AsyncSession, user_id: uuid.UUID
) -> list[AuditEntry]:
    rows = await db.scalars(
        select(AuditEntry).where(
            AuditEntry.entity_type == "account",
            AuditEntry.entity_id == str(user_id),
            AuditEntry.record_type == "account_deletion",
        )
    )
    return list(rows.all())


@pytest.mark.usefixtures("db_async")
async def test_deleted_account_cannot_sign_in_again(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user = await make_user(db_async)
    email = user.email
    headers = await _login_headers(async_client, db_async, user)

    deleted = await async_client.delete(ME, headers=headers)
    assert deleted.status_code == 200, deleted.text

    again = await async_client.post(
        SESSIONS, json={"email": email, "password": PASSWORD}
    )
    assert again.status_code == 400
    stale = await async_client.get(ME, headers=headers)
    assert stale.status_code == 401


async def test_deletion_scrubs_personal_fields_and_keeps_the_row(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async)
    user.middle_name = "Quentin"
    user.title = Title.MR
    user.phone_e164 = "+14735550123"
    user.phone_verified_at = utc_now()
    user.totp_secret = "fernet-secret-placeholder"
    user.totp_enabled = True
    user.mfa_recovery_hashes = ["0123abcd"]
    user.known_device_keys = ["Chrome on Linux"]
    user.staff_access_requested_at = utc_now()
    user.last_login_at = utc_now()
    await db_async.commit()
    user_id = user.id
    old_email, old_username = user.email, user.username
    old_hash = user.hashed_password

    await service.delete_user(session=db_async, user=user)

    anonymous = await db_async.get(User, user_id)
    assert anonymous is not None
    assert anonymous.is_active is False
    assert anonymous.is_superuser is False
    assert anonymous.email.startswith("deleted-")
    assert anonymous.email != old_email
    assert anonymous.username != old_username
    assert anonymous.first_name == "Deleted"
    assert anonymous.last_name == "user"
    assert anonymous.middle_name is None
    assert anonymous.title is None
    assert anonymous.phone_e164 is None
    assert anonymous.phone_verified_at is None
    assert anonymous.totp_secret is None
    assert anonymous.totp_enabled is False
    assert anonymous.mfa_recovery_hashes == []
    assert anonymous.known_device_keys == []
    assert anonymous.last_login_at is None
    assert anonymous.hashed_password != old_hash
    assert verify_password(PASSWORD, anonymous.hashed_password) is False


async def test_the_placeholder_is_random_and_not_the_user_id(
    db_async: AsyncSession,
) -> None:
    """Ids are visible to other people, so the placeholder must not be derived from one."""
    user = await make_user(db_async)
    await db_async.commit()
    user_id = user.id

    await service.delete_user(session=db_async, user=user)

    anonymous = await db_async.get(User, user_id)
    assert anonymous is not None
    assert user_id.hex not in anonymous.email
    assert user_id.hex not in anonymous.username
    token = anonymous.email.removeprefix("deleted-").removesuffix("@example.com")
    assert re.fullmatch(r"[0-9a-f]{32}", token)


async def test_sign_up_cannot_register_a_placeholder_address(
    db_async: AsyncSession,
) -> None:
    placeholder = placeholders.placeholder_email(placeholders.new_placeholder_token())
    with pytest.raises(AppException) as refused:
        await app_service._create_member(
            db_async, email=placeholder, first_name=None, last_name=None
        )
    assert refused.value.status_code == 400
    assert refused.value.message == "That email address can't be used. Use another."

    # Only the reserved form is refused, not the local part on a real domain.
    member = await app_service._create_member(
        db_async, email="deleted-ada@example.org", first_name=None, last_name=None
    )
    assert member.email == "deleted-ada@example.org"


async def test_sign_up_never_takes_a_placeholder_username(
    db_async: AsyncSession,
) -> None:
    """A local part of exactly "deleted" would make the reserved username form."""
    username = await app_service._unique_username(db_async, "deleted@example.org")
    assert username.startswith("member-")
    assert not placeholders.is_placeholder_username(username)


async def test_deletion_revokes_every_session(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user = await make_user(db_async)
    await _login_headers(async_client, db_async, user)
    await _login_headers(async_client, db_async, user)
    assert await _session_count(db_async, user.id) == 2

    await service.delete_user(session=db_async, user=user)

    assert await _session_count(db_async, user.id) == 0


async def test_deletion_keeps_the_rewards_ledger_under_the_anonymous_id(
    db_async: AsyncSession,
) -> None:
    customer, _program = await _cafe_with_card(db_async, stamps=2)
    before = await _ledger_ids(db_async, customer.id)
    assert before

    await service.delete_user(session=db_async, user=customer)

    assert await _ledger_ids(db_async, customer.id) == before


async def test_deletion_cancels_an_open_redemption_code(db_async: AsyncSession) -> None:
    customer, program = await _cafe_with_card(db_async, stamps=5)
    redemption, _ = await rewards_service.request_redemption(
        db_async, account=customer, program_id=program.id
    )
    await db_async.commit()
    redemption_id = redemption.id
    assert redemption.status == EntryStatus.PENDING.value

    await service.delete_user(session=db_async, user=customer)

    cancelled = await db_async.get(Entry, redemption_id)
    assert cancelled is not None
    assert cancelled.status == EntryStatus.REVERSED.value


async def test_a_code_confirmed_during_the_deletion_is_skipped(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Staff confirm the code between the lookup and the lock: that code is spent, so the
    deletion must finish rather than fail with a 409."""
    customer, program = await _cafe_with_card(db_async, stamps=5)
    redemption, _ = await rewards_service.request_redemption(
        db_async, account=customer, program_id=program.id
    )
    await db_async.commit()
    redemption_id = redemption.id
    real_cancel = rewards_service.cancel_redemption

    async def confirmed_just_before(
        session: AsyncSession, *, account: User, entry_id: uuid.UUID
    ) -> Entry:
        await session.execute(
            update(Entry)
            .where(Entry.id == entry_id)
            .values(status=EntryStatus.CONFIRMED.value, settled_at=utc_now())
        )
        return await real_cancel(session, account=account, entry_id=entry_id)

    monkeypatch.setattr(rewards_service, "cancel_redemption", confirmed_just_before)

    await service.delete_user(session=db_async, user=customer)

    spent = await db_async.get(Entry, redemption_id)
    assert spent is not None
    assert spent.status == EntryStatus.CONFIRMED.value
    anonymous = await db_async.get(User, customer.id)
    assert anonymous is not None
    assert anonymous.is_active is False


async def test_deletion_keeps_hr_employment_records(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    department = await make_department(db_async)
    record = await make_employee(db_async, user=user, department_id=department.id)
    await db_async.commit()
    record_id, user_id = record.id, user.id

    await service.delete_user(session=db_async, user=user)

    # A SQL read, not get(): the identity map could hand back a row a DB cascade removed.
    kept = await db_async.scalar(
        select(EmploymentRecord).where(EmploymentRecord.id == record_id)
    )
    assert kept is not None
    assert kept.user_id == user_id


async def test_deletion_is_audited_without_personal_values(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async)
    old_email = user.email
    await db_async.commit()
    user_id = user.id

    await service.delete_user(session=db_async, user=user)

    rows = await _deletion_audit_rows(db_async, user_id)
    assert len(rows) == 1
    assert rows[0].action == "anonymised"
    assert rows[0].actor_user_id == user_id
    assert old_email not in str(rows[0].changes)


async def test_a_second_deletion_changes_nothing(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    await db_async.commit()
    user_id = user.id
    await service.delete_user(session=db_async, user=user)
    first = await db_async.get(User, user_id)
    assert first is not None
    first_email = first.email

    again = await db_async.get(User, user_id)
    assert again is not None
    await service.delete_user(session=db_async, user=again)

    assert len(await _deletion_audit_rows(db_async, user_id)) == 1
    unchanged = await db_async.get(User, user_id)
    assert unchanged is not None
    assert unchanged.email == first_email


async def test_the_audit_names_the_superuser_who_deleted_the_account(
    db_async: AsyncSession,
) -> None:
    """A pending redemption makes the deletion reverse a ledger entry. That reversal must
    not leave the deleted customer named as the actor of the deletion."""
    customer, program = await _cafe_with_card(db_async, stamps=5)
    await rewards_service.request_redemption(
        db_async, account=customer, program_id=program.id
    )
    superuser = await make_user(db_async, superuser=True)
    await db_async.commit()
    superuser_id, customer_id = superuser.id, customer.id

    await service.delete_user(session=db_async, user=customer, actor=superuser)

    rows = await _deletion_audit_rows(db_async, customer_id)
    assert len(rows) == 1
    assert rows[0].actor_user_id == superuser_id


async def test_superuser_deletion_anonymises_and_names_the_superuser_as_actor(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    customer, _program = await _cafe_with_card(db_async, stamps=1)
    customer_id = customer.id

    deleted = await async_client.delete(
        f"/api/v1/auth/users/{customer_id}", headers=superuser_token_headers_async
    )
    assert deleted.status_code == 200, deleted.text

    # The request ran in its own session: reload the row this test already holds.
    anonymous = await db_async.get(User, customer_id)
    assert anonymous is not None
    await db_async.refresh(anonymous)
    assert anonymous.is_active is False
    assert await _ledger_ids(db_async, customer_id)
    row = await db_async.scalar(
        select(AuditEntry).where(
            AuditEntry.record_type == "account_deletion",
            AuditEntry.entity_id == str(customer_id),
        )
    )
    assert row is not None
    assert row.actor_user_id is not None
    assert row.actor_user_id != customer_id


async def test_deletion_removes_access_and_personal_links(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    removed_files: list[str] = []

    async def fake_delete_stored_files(prefix: str) -> None:
        removed_files.append(prefix)

    monkeypatch.setattr(
        profile_images_service, "delete_stored_files", fake_delete_stored_files
    )
    owner = await make_user(db_async)
    user = await make_user(db_async)
    org = await make_org(
        db_async,
        "Links Org",
        members=((owner, MembershipRole.OWNER), (user, MembershipRole.ADMIN)),
        apps=("bookings", "rewards"),
    )
    role, _ = await make_role_with_permission(db_async, "app.account.access")
    db_async.add(UserRoleLink(user_id=user.id, role_id=role.id))
    db_async.add(
        UserRoleAssignment(organisation_id="gaa", user_id=user.id, role_id=role.id)
    )
    membership = await db_async.scalar(
        select(Membership).where(
            Membership.organisation_id == org.id, Membership.user_id == user.id
        )
    )
    assert membership is not None
    db_async.add(
        MembershipGrant(
            id=f"grant-{uuid.uuid4().hex[:12]}",
            membership_id=membership.id,
            organisation_id=org.id,
            role_key="events.team",
            granted_at=utc_now(),
        )
    )
    department = await make_department(db_async)
    grade_id = f"grade-{uuid.uuid4().hex[:8]}"
    db_async.add(
        Grade(
            id=grade_id,
            department_id=department.id,
            code="TEST",
            label="Test grade",
            rank=1,
        )
    )
    await db_async.flush()
    db_async.add(
        StaffCredential(user_id=user.id, department_id=department.id, grade_id=grade_id)
    )
    db_async.add(
        Notification(recipient_user_id=user.id, event_key="test.event", title="Hi")
    )
    db_async.add(NotificationPreference(user_id=user.id, event_key="test.event"))
    db_async.add(
        ExternalIdentity(
            provider="google", subject=f"sub-{uuid.uuid4().hex[:8]}", user_id=user.id
        )
    )
    contact = Contact(
        organisation_id=org.id,
        email_hash=f"hash-{uuid.uuid4().hex}",
        email="person@example.org",
        name="Person",
        user_id=user.id,
        source="bookings",
    )
    db_async.add(contact)
    object_key = f"users/{user.id}/profile-image/{uuid.uuid4().hex}"
    db_async.add(UserImage(user_id=user.id, object_key=object_key))
    await db_async.flush()
    key, _secret = await api_keys.create_key(
        db_async,
        user,
        organisation_id=org.id,
        payload=ApiKeyCreate(name="Till", scopes=["bookings.read"]),
    )
    await db_async.commit()
    user_id, key_id, contact_id = user.id, key.id, contact.id

    await service.delete_user(session=db_async, user=user)

    assert (
        await db_async.scalars(
            select(UserRoleLink).where(UserRoleLink.user_id == user_id)
        )
    ).first() is None
    live = await db_async.scalars(
        select(UserRoleAssignment).where(
            UserRoleAssignment.user_id == user_id,
            UserRoleAssignment.effective_to.is_(None),
        )
    )
    assert live.first() is None
    membership_after = await db_async.get(Membership, membership.id)
    assert membership_after is not None
    assert membership_after.status == MembershipStatus.REMOVED.value
    grant_after = await db_async.scalar(
        select(MembershipGrant).where(MembershipGrant.membership_id == membership.id)
    )
    assert grant_after is not None
    assert grant_after.revoked_at is not None
    credential = await db_async.get(StaffCredential, user_id)
    assert credential is not None
    assert credential.revoked_at is not None
    assert (
        await db_async.scalars(
            select(Notification).where(Notification.recipient_user_id == user_id)
        )
    ).first() is None
    assert (
        await db_async.scalars(
            select(NotificationPreference).where(
                NotificationPreference.user_id == user_id
            )
        )
    ).first() is None
    # A SQL read: the core UPDATE does not refresh the ApiKey this test already holds.
    revoked_at = await db_async.scalar(
        select(ApiKey.revoked_at).where(ApiKey.id == key_id)
    )
    assert revoked_at is not None
    assert (
        await db_async.scalars(
            select(ExternalIdentity).where(ExternalIdentity.user_id == user_id)
        )
    ).first() is None
    contact_after = await db_async.get(Contact, contact_id)
    assert contact_after is not None
    assert contact_after.user_id is None
    assert (
        await db_async.scalars(select(UserImage).where(UserImage.user_id == user_id))
    ).first() is None
    assert removed_files == [object_key]


async def _hr_details(db: AsyncSession, user: User) -> tuple[UserProfile, UserAddress]:
    profile = UserProfile(
        user_id=user.id,
        phone="+14735550199",
        date_of_birth=date(1990, 4, 12),
        nationality="Grenadian",
        gender=Gender.FEMALE,
        emergency_contact_name="Next Of Kin",
        emergency_contact_phone="+14735550198",
        emergency_contact_relationship="Sister",
    )
    address = UserAddress(
        user_id=user.id, line_1="1 Church Street", city="St. George's"
    )
    db.add(profile)
    db.add(address)
    await db.commit()
    return profile, address


async def test_contact_details_are_cleared_and_a_customers_birth_date_and_address_go(
    db_async: AsyncSession,
) -> None:
    customer = await make_user(db_async)
    await _hr_details(db_async, customer)
    customer_id = customer.id

    await service.delete_user(session=db_async, user=customer)

    profile = await db_async.scalar(
        select(UserProfile).where(UserProfile.user_id == customer_id)
    )
    assert profile is not None
    assert profile.phone is None
    assert profile.emergency_contact_name is None
    assert profile.emergency_contact_phone is None
    assert profile.emergency_contact_relationship is None
    assert profile.gender is None
    assert profile.nationality is None
    assert profile.date_of_birth is None
    assert (
        await db_async.scalars(
            select(UserAddress).where(UserAddress.user_id == customer_id)
        )
    ).first() is None


async def test_a_former_employees_birth_date_and_address_are_kept(
    db_async: AsyncSession,
) -> None:
    former = await make_user(db_async)
    department = await make_department(db_async)
    record = await make_employee(db_async, user=former, department_id=department.id)
    record.status = EmploymentStatus.TERMINATED
    record.end_date = date(2020, 6, 30)
    await _hr_details(db_async, former)
    former_id, record_id = former.id, record.id

    await service.delete_user(session=db_async, user=former)

    profile = await db_async.scalar(
        select(UserProfile).where(UserProfile.user_id == former_id)
    )
    assert profile is not None
    assert profile.date_of_birth == date(1990, 4, 12)
    assert profile.phone is None
    assert profile.emergency_contact_name is None
    assert profile.gender is None
    assert profile.nationality is None
    assert (
        await db_async.scalars(
            select(UserAddress).where(UserAddress.user_id == former_id)
        )
    ).first() is not None
    kept = await db_async.scalar(
        select(EmploymentRecord).where(EmploymentRecord.id == record_id)
    )
    assert kept is not None
    assert kept.status == EmploymentStatus.TERMINATED


async def test_an_inactive_record_with_no_end_date_blocks_self_deletion(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """Owner decision (14 Nov 2026): any record that has not ended blocks, whatever its
    status. INACTIVE with no end date is not an ended employment."""
    person = await make_user(db_async)
    department = await make_department(db_async)
    record = await make_employee(db_async, user=person, department_id=department.id)
    record.status = EmploymentStatus.INACTIVE
    record.end_date = None
    headers = await _login_headers(async_client, db_async, person)

    refused = await async_client.delete(ME, headers=headers)

    assert refused.status_code == 403
    assert "Contact HR" in refused.json()["detail"]
    await db_async.refresh(person)
    assert person.is_active is True


async def test_an_active_employee_cannot_delete_their_account(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    employee = await make_user(db_async)
    department = await make_department(db_async)
    await make_employee(db_async, user=employee, department_id=department.id)
    headers = await _login_headers(async_client, db_async, employee)

    refused = await async_client.delete(ME, headers=headers)

    assert refused.status_code == 403
    assert "Contact HR" in refused.json()["detail"]
    await db_async.refresh(employee)
    assert employee.is_active is True
    assert not employee.email.startswith("deleted-")


async def test_a_former_employee_can_delete_their_account(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    former = await make_user(db_async)
    department = await make_department(db_async)
    record = await make_employee(db_async, user=former, department_id=department.id)
    record.status = EmploymentStatus.TERMINATED
    record.end_date = date(2020, 6, 30)
    headers = await _login_headers(async_client, db_async, former)

    deleted = await async_client.delete(ME, headers=headers)

    assert deleted.status_code == 200, deleted.text
    # The request ran in its own session: reload the row this test already holds.
    anonymous = await db_async.get(User, former.id)
    assert anonymous is not None
    await db_async.refresh(anonymous)
    assert anonymous.is_active is False


async def test_a_deactivated_account_holding_a_placeholder_email_is_really_anonymised(
    db_async: AsyncSession,
) -> None:
    """The placeholder form can no longer be set by a person (it is refused on every
    write path). If it is ever on an account another way, deleting that account must
    still erase it: only an anonymised account may take the early return."""
    user = await make_user(db_async)
    user.email = placeholders.placeholder_email(placeholders.new_placeholder_token())
    user.is_active = False
    await db_async.commit()
    user_id, old_email = user.id, user.email
    old_hash = user.hashed_password

    await service.delete_user(session=db_async, user=user)

    anonymous = await db_async.get(User, user_id)
    assert anonymous is not None
    assert anonymous.email != old_email
    assert anonymous.hashed_password != old_hash
    assert anonymous.hashed_password == ANONYMISED_PASSWORD_MARKER
    assert len(await _deletion_audit_rows(db_async, user_id)) == 1


async def test_the_placeholder_email_and_username_are_refused_on_every_write(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async)
    reserved_email = placeholders.placeholder_email(
        placeholders.new_placeholder_token()
    )
    reserved_username = placeholders.placeholder_username(
        placeholders.new_placeholder_token()
    )
    await db_async.commit()

    with pytest.raises(AppException) as by_email:
        await service.update_user_me(
            session=db_async,
            current_user=user,
            user_in=UserUpdateMe(email=reserved_email),
        )
    assert by_email.value.status_code == 400
    assert by_email.value.message == "That email address can't be used. Use another."

    with pytest.raises(AppException) as by_username:
        await service.update_user_me(
            session=db_async,
            current_user=user,
            user_in=UserUpdateMe(username=reserved_username),
        )
    assert by_username.value.status_code == 400
    assert by_username.value.message == "That username can't be used. Choose another."

    with pytest.raises(AppException) as admin_edit:
        await service.update_user(
            session=db_async,
            db_user=user,
            user_in=UserUpdate(email=reserved_email),
        )
    assert admin_edit.value.status_code == 400

    with pytest.raises(AppException) as created:
        await service.create_user(
            session=db_async,
            user_create=UserCreate(
                email=reserved_email,
                username="fresh-member",
                password="password123",
                first_name="Ada",
                last_name="Lovelace",
            ),
        )
    assert created.value.status_code == 400


async def test_a_legitimate_address_and_username_are_not_refused(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async)
    await db_async.commit()

    updated = await service.update_user_me(
        session=db_async,
        current_user=user,
        user_in=UserUpdateMe(email="ada.new@example.org", username="ada-new"),
    )

    assert updated.email == "ada.new@example.org"
    assert updated.username == "ada-new"


async def test_a_pending_redemption_cannot_be_confirmed_once_the_account_is_deactivated(
    db_async: AsyncSession,
) -> None:
    """A redemption requested in a parallel request during the deletion stays pending.
    Confirming it must still fail, because the account can no longer redeem."""
    customer, program = await _cafe_with_card(db_async, stamps=5)
    redemption, _ = await rewards_service.request_redemption(
        db_async, account=customer, program_id=program.id
    )
    await db_async.commit()
    code, redemption_id = redemption.redeem_code, redemption.id
    customer.is_active = False
    await db_async.commit()

    with pytest.raises(RedemptionNotFoundError):
        await rewards_service.confirm_redemption(
            db_async,
            organisation_id=program.organisation_id,
            code=code,
            staff=None,
        )

    still_open = await db_async.get(Entry, redemption_id)
    assert still_open is not None
    assert still_open.status == EntryStatus.PENDING.value


async def test_the_marker_never_matches_and_never_raises() -> None:
    """The anonymised marker is not bcrypt. Verifying any password against it answers
    False, without raising, whatever the password is."""
    for candidate in ("", PASSWORD, ANONYMISED_PASSWORD_MARKER, "x" * 200):
        assert verify_password(candidate, ANONYMISED_PASSWORD_MARKER) is False
        assert (
            await verify_password_async(candidate, ANONYMISED_PASSWORD_MARKER) is False
        )


async def test_a_second_process_does_not_repeat_the_deletion(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    """DUMMY_PASSWORD_HASH differs in every process. A repeat deletion in another
    process must still see the account as anonymised: one audit row, no second pass."""
    user = await make_user(db_async)
    await db_async.commit()
    user_id = user.id
    await service.delete_user(session=db_async, user=user)
    stored = await db_async.get(User, user_id)
    assert stored is not None
    assert stored.hashed_password == ANONYMISED_PASSWORD_MARKER

    other_process_hash = auth_utils.get_password_hash("another process's secret")
    monkeypatch.setattr(auth_utils, "DUMMY_PASSWORD_HASH", other_process_hash)
    monkeypatch.setattr(service, "DUMMY_PASSWORD_HASH", other_process_hash)
    again = await db_async.get(User, user_id)
    assert again is not None
    await service.delete_user(session=db_async, user=again)

    assert len(await _deletion_audit_rows(db_async, user_id)) == 1


async def test_login_against_an_anonymised_account_fails_cleanly(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user = await make_user(db_async)
    old_email = user.email
    headers = await _login_headers(async_client, db_async, user)
    deleted = await async_client.delete(ME, headers=headers)
    assert deleted.status_code == 200, deleted.text
    anonymous = await db_async.get(User, user.id)
    assert anonymous is not None
    await db_async.refresh(anonymous)
    placeholder_email = anonymous.email

    for email in (old_email, placeholder_email):
        for password in (PASSWORD, "an arbitrary guess at a password"):
            attempt = await async_client.post(
                SESSIONS, json={"email": email, "password": password}
            )
            assert attempt.status_code == 400, attempt.text


def test_padded_placeholder_forms_are_refused() -> None:
    assert placeholders.is_placeholder_username("  deleted-abc")
    assert placeholders.is_placeholder_email(" deleted-abc@example.com ")
    with pytest.raises(AppException):
        placeholders.require_usable_identity(email=None, username=" Deleted-abc ")
