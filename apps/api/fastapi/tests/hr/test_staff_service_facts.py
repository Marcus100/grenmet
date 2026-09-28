from datetime import date

import httpx
import pytest
from sqlalchemy import select

from src.baseline import service as setup_service
from src.baseline.models import BaselineAudit
from src.baseline.schemas import StaffInput
from src.exceptions import AppException
from src.hr import service
from src.hr.models import EmploymentRecord, EmploymentStatus, Grade
from src.hr.schemas import EmploymentCreate, EmploymentUpdate
from tests.factories import make_department, make_employee, make_user


async def test_recorded_service_facts_setup_profile_and_authorized_api(
    db_async, async_client: httpx.AsyncClient, superuser_token_headers_async
):
    department = await make_department(db_async, "facts_department")
    admin = await make_user(db_async, superuser=True)
    employee = await make_user(db_async)
    grade = Grade(
        id="facts_grade",
        code="FACTS",
        department_id=department.id,
        label="Officer",
        rank=1,
    )
    db_async.add(grade)
    await db_async.commit()
    body = StaffInput(
        department_id=department.id,
        grade_id=grade.id,
        mailbox_ready=True,
        employee_number="VERIFIED-1",
        employment_type="FULL_TIME",
        start_date=date(2024, 4, 1),
        continuous_service_date=date(2020, 4, 1),
        probation_end_date=date(2024, 10, 1),
        probation_completed_date=date(2024, 11, 1),
        service_details_source="HR appointment and confirmation letters",
    )
    await setup_service.save_staff(db_async, admin, employee.id, body)
    profile = await service.read_profile_for_user(
        session=db_async, current_user=employee
    )
    assert profile.employment.continuous_service_date == date(2020, 4, 1)
    assert profile.employment.probation_end_date == date(2024, 10, 1)
    assert profile.employment.probation_completed_date == date(2024, 11, 1)
    staff = next(
        row
        for row in await setup_service.list_staff(db_async)
        if row.user_id == employee.id
    )
    assert staff.service_details_source == body.service_details_source
    # Omitted facts remain unchanged on an ordinary grade save.
    await setup_service.save_staff(
        db_async,
        admin,
        employee.id,
        StaffInput(department_id=department.id, grade_id=grade.id, mailbox_ready=True),
    )
    employment = await db_async.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == employee.id)
    )
    assert employment.continuous_service_date == date(2020, 4, 1)
    assert await db_async.scalar(
        select(BaselineAudit.id).where(
            BaselineAudit.subject_id == employee.id,
            BaselineAudit.action == "staff.setup",
        )
    )
    response = await async_client.get(
        f"/api/v1/hr/employment/{employee.id}", headers=superuser_token_headers_async
    )
    assert response.status_code == 200
    assert response.json()["probation_completed_date"] == "2024-11-01"
    update = await async_client.patch(
        f"/api/v1/hr/employment/{employee.id}",
        headers=superuser_token_headers_async,
        json={"employment": {"probation_completed_date": None}},
    )
    assert update.status_code == 200
    assert update.json()["employment"]["probation_completed_date"] is None
    assert update.json()["employment"]["continuous_service_date"] == "2020-04-01"


async def test_service_fact_validation_and_supervisor_cycles(db_async):
    department = await make_department(db_async, "facts_validation")
    admin = await make_user(db_async, superuser=True)
    employee = await make_user(db_async)
    supervisor = await make_user(db_async)
    manager = await make_user(db_async)
    await make_employee(db_async, user=employee, department_id=department.id)
    sup_record = await make_employee(
        db_async, user=supervisor, department_id=department.id
    )
    manager_record = await make_employee(
        db_async, user=manager, department_id=department.id
    )
    for changes in [
        {"continuous_service_date": "2020-01-01"},
        {
            "start_date": "2024-04-01",
            "probation_end_date": "2024-03-31",
            "service_details_source": "HR file",
        },
        {"probation_completed_date": "2099-01-01", "service_details_source": "HR file"},
        {"supervisor_id": employee.id},
    ]:
        with pytest.raises(AppException):
            await service.update_employment_for_user(
                session=db_async,
                current_user=admin,
                target_user_id=employee.id,
                employment_update=EmploymentUpdate(**changes),
                approval_update=None,
            )
    sup_record.supervisor_id = manager.id
    manager_record.supervisor_id = employee.id
    await db_async.commit()
    with pytest.raises(AppException, match="cycle"):
        await service.update_employment_for_user(
            session=db_async,
            current_user=admin,
            target_user_id=employee.id,
            employment_update=EmploymentUpdate(supervisor_id=supervisor.id),
            approval_update=None,
        )
    sup_record.supervisor_id = None
    sup_record.status = EmploymentStatus.TERMINATED
    await db_async.commit()
    with pytest.raises(AppException, match="active employee"):
        await service.update_employment_for_user(
            session=db_async,
            current_user=admin,
            target_user_id=employee.id,
            employment_update=EmploymentUpdate(supervisor_id=supervisor.id),
            approval_update=None,
        )
    new_employee = await make_user(db_async)
    with pytest.raises(AppException):
        await service.create_employment_for_user(
            session=db_async,
            current_user=admin,
            target_user_id=new_employee.id,
            payload=EmploymentCreate(
                employee_number="FACT-2",
                department_id=department.id,
                probation_completed_date=date(2024, 1, 1),
            ),
        )
