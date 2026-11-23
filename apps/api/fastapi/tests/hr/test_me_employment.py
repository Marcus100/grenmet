"""``GET /hr/me/employment``: a person reads only their own live employment."""

import uuid
from datetime import timedelta
from decimal import Decimal

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.utils import create_access_token
from src.hr.leave import ledger
from src.hr.models import EmploymentStatus, EmploymentType, Organisation
from src.utils.timezones import local_today
from tests.factories import make_department, make_employee, make_user

URL = "/api/v1/hr/me/employment"


def _headers(user: User) -> dict[str, str]:
    token = create_access_token(user.id, expires_delta=timedelta(minutes=5))
    return {"Authorization": f"Bearer {token}"}


async def _me_with_employment(db: AsyncSession, *, position: str = "Duty Officer"):
    department = await make_department(db, "me-emp-ops")
    user = await make_user(db)
    employment = await make_employee(
        db, user=user, department_id=department.id, position=position
    )
    return user, employment, department


async def test_returns_own_live_employment_and_leave_balance(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user, employment, department = await _me_with_employment(db_async)
    employment.start_date = local_today() - timedelta(days=400)
    employment.employment_type = EmploymentType.FULL_TIME
    await ledger.set_to(
        db_async,
        user_id=user.id,
        leave_type="VACATION",
        target=Decimal("12.50"),
        reason="Opening balance",
        actor_id=user.id,
    )
    await db_async.commit()

    response = await async_client.get(
        URL, params={"organisation_id": "gaa"}, headers=_headers(user)
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body == {
        "organisation_id": "gaa",
        "status": "ACTIVE",
        "position": "Duty Officer",
        "department_name": department.name,
        "employment_type": "FULL_TIME",
        "start_date": employment.start_date.isoformat(),
        "end_date": None,
        "leave_balances": [{"leave_type": "VACATION", "balance_days": "12.50"}],
    }


async def test_no_leave_entries_gives_empty_balances(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user, _, _ = await _me_with_employment(db_async)

    response = await async_client.get(
        URL, params={"organisation_id": "gaa"}, headers=_headers(user)
    )

    assert response.status_code == 200, response.text
    assert response.json()["leave_balances"] == []


async def test_other_organisation_is_the_same_404_as_unknown(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user, _, _ = await _me_with_employment(db_async)
    db_async.add(Organisation(id="other-me", code="OTHER-ME", name="Other org"))
    await db_async.commit()
    headers = _headers(user)

    other = await async_client.get(
        URL, params={"organisation_id": "other-me"}, headers=headers
    )
    unknown = await async_client.get(
        URL, params={"organisation_id": "no-such-org"}, headers=headers
    )

    assert other.status_code == 404, other.text
    assert unknown.status_code == 404, unknown.text
    assert other.json() == unknown.json()


async def test_ended_employment_is_404_but_last_day_is_live(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user, employment, _ = await _me_with_employment(db_async)
    headers = _headers(user)

    employment.end_date = local_today() - timedelta(days=1)
    await db_async.commit()
    expired = await async_client.get(
        URL, params={"organisation_id": "gaa"}, headers=headers
    )
    assert expired.status_code == 404, expired.text

    employment.end_date = local_today()
    await db_async.commit()
    last_day = await async_client.get(
        URL, params={"organisation_id": "gaa"}, headers=headers
    )
    assert last_day.status_code == 200, last_day.text
    assert last_day.json()["end_date"] == local_today().isoformat()


async def test_inactive_employment_is_404(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user, employment, _ = await _me_with_employment(db_async)
    employment.status = EmploymentStatus.INACTIVE
    await db_async.commit()

    response = await async_client.get(
        URL, params={"organisation_id": "gaa"}, headers=_headers(user)
    )

    assert response.status_code == 404, response.text


async def test_superuser_without_employment_is_404(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    superuser = await make_user(db_async, superuser=True)

    response = await async_client.get(
        URL, params={"organisation_id": "gaa"}, headers=_headers(superuser)
    )

    assert response.status_code == 404, response.text


async def test_spoofed_user_id_is_ignored_and_balances_stay_personal(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    me, _, _ = await _me_with_employment(db_async, position="Mine")
    colleague, _, _ = await _me_with_employment(db_async, position="Theirs")
    await ledger.set_to(
        db_async,
        user_id=me.id,
        leave_type="VACATION",
        target=Decimal("5"),
        reason="Opening balance",
        actor_id=me.id,
    )
    await ledger.set_to(
        db_async,
        user_id=colleague.id,
        leave_type="VACATION",
        target=Decimal("99"),
        reason="Opening balance",
        actor_id=colleague.id,
    )
    await db_async.commit()

    response = await async_client.get(
        URL,
        params={
            "organisation_id": "gaa",
            "user_id": str(colleague.id),
            "employee_id": str(uuid.uuid4()),
        },
        headers=_headers(me),
    )

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["position"] == "Mine"
    assert body["leave_balances"] == [
        {"leave_type": "VACATION", "balance_days": "5.00"}
    ]


async def test_organisation_id_is_required(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    user, _, _ = await _me_with_employment(db_async)

    response = await async_client.get(URL, headers=_headers(user))

    assert response.status_code == 422, response.text


async def test_requires_authentication(async_client: httpx.AsyncClient) -> None:
    response = await async_client.get(URL, params={"organisation_id": "gaa"})

    assert response.status_code == 401, response.text
