"""Tests for department and employment record creation (user onboarding)."""

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.schemas import UserCreate
from src.auth.service import create_user
from src.exceptions import AppException, NotFoundError
from src.hr import service as hr_service
from src.hr.models import Department, EmploymentType
from src.hr.schemas import DepartmentCreate, DepartmentUpdate, EmploymentCreate
from tests.utils.utils import random_email, random_lower_string


async def _superuser(db_async: AsyncSession):
    return await create_user(
        session=db_async,
        user_create=UserCreate(
            email=random_email(),
            username=f"da_{random_lower_string()}",
            password="password123",
            first_name="Dept",
            last_name="Admin",
            is_superuser=True,
        ),
    )


async def test_create_and_rename_department(db_async: AsyncSession) -> None:
    admin = await _superuser(db_async)

    department = await hr_service.create_department(
        session=db_async,
        current_user=admin,
        payload=DepartmentCreate(id="dept_ops_test", name="Operations Test"),
    )
    assert department.id == "dept_ops_test"

    with pytest.raises(AppException):
        await hr_service.create_department(
            session=db_async,
            current_user=admin,
            payload=DepartmentCreate(id="dept_ops_test", name="Duplicate"),
        )

    renamed = await hr_service.update_department(
        session=db_async,
        current_user=admin,
        department_id="dept_ops_test",
        payload=DepartmentUpdate(name="Operations Renamed"),
    )
    assert renamed.name == "Operations Renamed"

    with pytest.raises(NotFoundError):
        await hr_service.update_department(
            session=db_async,
            current_user=admin,
            department_id="dept_missing",
            payload=DepartmentUpdate(name="Nope"),
        )


async def test_create_employment_record(db_async: AsyncSession) -> None:
    admin = await _superuser(db_async)
    staff = await create_user(
        session=db_async,
        user_create=UserCreate(
            email=random_email(),
            username=f"emp_{random_lower_string()}",
            password="password123",
            first_name="New",
            last_name="Cadet",
        ),
    )
    if not await db_async.get(Department, "dept_emp_test"):
        db_async.add(Department(id="dept_emp_test", name="Dept Employment Test"))
        await db_async.commit()

    record = await hr_service.create_employment_for_user(
        session=db_async,
        current_user=admin,
        target_user_id=staff.id,
        payload=EmploymentCreate(
            employee_number=f"GMD-{random_lower_string()[:6].upper()}",
            department_id="dept_emp_test",
            position="Meteorological Cadet",
            employment_type=EmploymentType.FULL_TIME,
        ),
    )
    assert record.user_id == staff.id
    assert record.position == "Meteorological Cadet"

    # Duplicate employment for the same user is rejected.
    with pytest.raises(AppException):
        await hr_service.create_employment_for_user(
            session=db_async,
            current_user=admin,
            target_user_id=staff.id,
            payload=EmploymentCreate(
                employee_number=f"GMD-{random_lower_string()[:6].upper()}",
                department_id="dept_emp_test",
            ),
        )


async def test_create_employment_unknown_department_or_user(
    db_async: AsyncSession,
) -> None:
    import uuid as uuid_mod

    admin = await _superuser(db_async)
    staff = await create_user(
        session=db_async,
        user_create=UserCreate(
            email=random_email(),
            username=f"emp2_{random_lower_string()}",
            password="password123",
            first_name="No",
            last_name="Dept",
        ),
    )

    with pytest.raises(NotFoundError):
        await hr_service.create_employment_for_user(
            session=db_async,
            current_user=admin,
            target_user_id=staff.id,
            payload=EmploymentCreate(
                employee_number="GMD-XX1", department_id="dept_ghost"
            ),
        )

    with pytest.raises(NotFoundError):
        await hr_service.create_employment_for_user(
            session=db_async,
            current_user=admin,
            target_user_id=uuid_mod.uuid4(),
            payload=EmploymentCreate(
                employee_number="GMD-XX2", department_id="dept_emp_test"
            ),
        )
