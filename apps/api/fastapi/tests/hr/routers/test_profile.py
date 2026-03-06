import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from src.auth.models import Role
from src.auth.schemas import UserCreate
from src.auth.service import create_user
from src.config import settings
from src.hr.models import Department, EmploymentRecord
from tests.utils.user import user_authentication_headers_async
from tests.utils.utils import random_email, random_lower_string


async def test_read_hr_profile_me(
    async_client: httpx.AsyncClient,
    normal_user_token_headers_async: dict[str, str],
) -> None:
    response = await async_client.get(
        f"{settings.API_V1_STR}/hr/profile/me",
        headers=normal_user_token_headers_async,
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["identity"]["email"] is not None
    assert "profile" in payload
    assert "address" in payload
    assert "employment" in payload


async def test_update_hr_profile_me(
    async_client: httpx.AsyncClient,
    normal_user_token_headers_async: dict[str, str],
) -> None:
    response = await async_client.patch(
        f"{settings.API_V1_STR}/hr/profile/me",
        headers=normal_user_token_headers_async,
        json={
            "profile": {
                "first_name": "Updated",
                "last_name": "Person",
                "nationality": "Grenadian",
            },
            "address": {
                "line_1": "Point Salines",
                "city": "St. George's",
                "country": "Grenada",
            },
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["profile"]["first_name"] == "Updated"
    assert payload["profile"]["display_name"] == "Updated Person"
    assert payload["address"]["city"] == "St. George's"


async def test_supervisor_cannot_update_other_department(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    supervisor = await create_user(
        session=db_async,
        user_create=UserCreate(
            email=random_email(),
            username=f"sup_{random_lower_string()}",
            password="password123",
            first_name="Dept",
            last_name="Supervisor",
        ),
    )
    target_user = await create_user(
        session=db_async,
        user_create=UserCreate(
            email=random_email(),
            username=f"emp_{random_lower_string()}",
            password="password123",
            first_name="Dept",
            last_name="Employee",
        ),
    )

    result = await db_async.execute(select(Role).where(Role.name == "SUPERVISOR"))
    role = result.scalars().first()
    if not role:
        role = Role(name="SUPERVISOR")
        db_async.add(role)
        await db_async.commit()
        await db_async.refresh(role)

    await db_async.refresh(supervisor)
    if role.id not in {assigned_role.id for assigned_role in supervisor.roles}:
        supervisor.roles.append(role)
        db_async.add(supervisor)

    if not await db_async.get(Department, "dept_one"):
        db_async.add(Department(id="dept_one", name="Dept One"))
    if not await db_async.get(Department, "dept_two"):
        db_async.add(Department(id="dept_two", name="Dept Two"))
    await db_async.commit()

    supervisor_employment = EmploymentRecord(
        user_id=supervisor.id,
        employee_number=f"SUP-{random_lower_string()}",
        department_id="dept_one",
        position="Supervisor",
    )
    target_employment = EmploymentRecord(
        user_id=target_user.id,
        employee_number=f"EMP-{random_lower_string()}",
        department_id="dept_two",
        position="Officer",
    )
    db_async.add(supervisor_employment)
    db_async.add(target_employment)
    await db_async.commit()

    headers = await user_authentication_headers_async(
        client=async_client,
        email=supervisor.email,
        password="password123",
    )
    response = await async_client.patch(
        f"{settings.API_V1_STR}/hr/employment/{target_user.id}",
        headers=headers,
        json={
            "employment": {"position": "Senior Officer"},
        },
    )

    assert response.status_code == 403
