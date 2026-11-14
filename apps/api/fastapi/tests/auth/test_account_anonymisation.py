"""Account deletion anonymises the account (ADR-0058 section 7, issue #1375).

The person cannot sign in again and their credentials are revoked. Personal fields
are replaced. Rows that other tables reference (the rewards ledger, HR employment
records, audit) stay and point at the now-anonymous account. The deletion is audited
without any personal value.
"""

import uuid

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth import service
from src.auth.models import Session, Title, User
from src.auth.utils import verify_password
from src.hr.models import EmploymentRecord
from src.organisations.models import MembershipRole
from src.rewards import service as rewards_service
from src.rewards.models import Entry, EntryStatus
from src.rewards.schemas import ProgramCreate
from src.utils.datetime import utc_now
from tests.factories import make_department, make_employee, make_user
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

    rows = (
        await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.entity_type == "account",
                AuditEntry.entity_id == str(user_id),
                AuditEntry.record_type == "account_deletion",
            )
        )
    ).all()
    assert len(rows) == 1
    assert rows[0].action == "anonymised"
    assert rows[0].actor_user_id == user_id
    assert old_email not in str(rows[0].changes)


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
