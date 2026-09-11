import uuid
from datetime import date, timedelta

import pytest
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import RoleAssignmentScope
from src.exceptions import AppException
from src.hr.models import Organisation
from src.hr.training import service
from src.hr.training.schemas import TrainingArchiveInput, TrainingRecordInput
from src.utils.datetime import utc_now
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_user,
)


async def setup_people(session: AsyncSession):
    dept = await make_department(session)
    employee = await make_user(session)
    await make_employee(session, user=employee, department_id=dept.id)
    manager = await make_user(session)
    role, _ = await make_role_with_permission(session, "hr.training.manage")
    assignment = await assign_role(
        session,
        user=manager,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=dept.id,
    )
    return dept, employee, manager, assignment


def payload(user_id: uuid.UUID, **changes):
    return TrainingRecordInput(
        **dict(
            {
                "organisation_id": "gaa",
                "user_id": user_id,
                "course_name": "Observer refresher",
                "provider": "Training provider",
                "completed_on": date(2025, 1, 1),
                "result": "completed",
                "expires_on": date(2027, 1, 1),
            },
            **changes,
        )
    )


async def records(session, actor, user_id, include_archived=False):
    return await service.list_records(
        session=session,
        actor=actor,
        organisation_id="gaa",
        user_id=user_id,
        include_archived=include_archived,
        page=1,
        size=20,
    )


@pytest.mark.asyncio
async def test_manager_records_employee_reads_and_archive_retains_history(db_async):
    _, employee, manager, _ = await setup_people(db_async)
    record = await service.create_record(
        session=db_async, actor=manager, payload=payload(employee.id)
    )
    own = await records(db_async, employee, employee.id)
    assert own.count == 1 and not own.can_create and not own.data[0].can_manage
    assert (await records(db_async, manager, employee.id)).data[0].can_manage
    with pytest.raises(AppException):
        await service.archive_record(
            session=db_async,
            actor=employee,
            record_id=record.id,
            payload=TrainingArchiveInput(reason="Incorrect entry"),
        )
    archived = await service.archive_record(
        session=db_async,
        actor=manager,
        record_id=record.id,
        payload=TrainingArchiveInput(reason="Incorrect completion date"),
    )
    assert archived.archived_by == manager.id
    assert (await records(db_async, employee, employee.id)).count == 0
    history = await records(db_async, employee, employee.id, True)
    assert (
        history.count == 1
        and history.data[0].archive_reason == "Incorrect completion date"
    )


@pytest.mark.asyncio
async def test_scopes_apply_to_counts_picker_and_writes(db_async):
    _, employee, manager, _ = await setup_people(db_async)
    other_dept = await make_department(db_async)
    outsider = await make_user(db_async)
    await make_employee(db_async, user=outsider, department_id=other_dept.id)
    await service.create_record(
        session=db_async, actor=manager, payload=payload(employee.id)
    )
    assert (await records(db_async, outsider, employee.id)).count == 0
    with pytest.raises(AppException):
        await service.create_record(
            session=db_async, actor=manager, payload=payload(outsider.id)
        )
    choice = await service.list_employees(
        session=db_async,
        actor=manager,
        organisation_id="gaa",
        search="",
        page=1,
        size=1,
    )
    assert choice.count == 1 and choice.data[0].user_id == employee.id
    own = await service.list_employees(
        session=db_async,
        actor=outsider,
        organisation_id="gaa",
        search="",
        page=1,
        size=20,
    )
    assert [row.user_id for row in own.data] == [outsider.id]


@pytest.mark.asyncio
async def test_expired_and_self_assignments_cannot_manage_department(db_async):
    _, employee, manager, assignment = await setup_people(db_async)
    assignment.scope = RoleAssignmentScope.SELF
    db_async.add(assignment)
    await db_async.commit()
    with pytest.raises(AppException):
        await service.create_record(
            session=db_async, actor=manager, payload=payload(employee.id)
        )
    assignment.scope = RoleAssignmentScope.DEPARTMENT
    assignment.effective_to = utc_now() - timedelta(days=1)
    db_async.add(assignment)
    await db_async.commit()
    with pytest.raises(AppException):
        await service.create_record(
            session=db_async, actor=manager, payload=payload(employee.id)
        )


@pytest.mark.asyncio
async def test_other_organisation_cannot_be_used_with_employee_id(db_async):
    _, employee, manager, _ = await setup_people(db_async)
    db_async.add(Organisation(id="other", code="OTHER", name="Other employer"))
    await db_async.commit()
    with pytest.raises(AppException):
        await service.create_record(
            session=db_async,
            actor=manager,
            payload=payload(employee.id, organisation_id="other"),
        )
    admin = await make_user(db_async, superuser=True)
    with pytest.raises(AppException):
        await service.create_record(
            session=db_async,
            actor=admin,
            payload=payload(employee.id, organisation_id="other"),
        )


@pytest.mark.asyncio
async def test_future_history_rejected_and_pagination_stable(db_async):
    _, employee, manager, _ = await setup_people(db_async)
    with pytest.raises(AppException):
        await service.create_record(
            session=db_async,
            actor=manager,
            payload=payload(
                employee.id, completed_on=date(2099, 1, 1), expires_on=None
            ),
        )
    for i in range(3):
        await service.create_record(
            session=db_async,
            actor=manager,
            payload=payload(employee.id, course_name=f"Course {i}"),
        )
    first = await service.list_records(
        session=db_async,
        actor=employee,
        organisation_id="gaa",
        user_id=None,
        include_archived=False,
        page=1,
        size=2,
    )
    second = await service.list_records(
        session=db_async,
        actor=employee,
        organisation_id="gaa",
        user_id=None,
        include_archived=False,
        page=2,
        size=2,
    )
    assert first.count == second.count == 3
    assert len(first.data) == 2 and len(second.data) == 1
    assert not {r.id for r in first.data} & {r.id for r in second.data}


@pytest.mark.parametrize(
    "changes",
    [
        {"course_name": "   "},
        {"expires_on": date(2024, 1, 1)},
        {"result": "failed"},
        {"result": "attended"},
    ],
)
def test_invalid_training_details(changes):
    with pytest.raises(ValidationError):
        payload(uuid.uuid4(), **changes)


@pytest.mark.asyncio
async def test_department_transfer_retains_discoverable_filing_history(db_async):
    from sqlmodel import select

    from src.hr.models import EmploymentRecord

    department, employee, manager, _ = await setup_people(db_async)
    await service.create_record(
        session=db_async, actor=manager, payload=payload(employee.id)
    )
    new_department = await make_department(db_async)
    employment = await db_async.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == employee.id)
    )
    employment.department_id = new_department.id
    db_async.add(employment)
    await db_async.commit()
    choices = await service.list_employees(
        session=db_async,
        actor=manager,
        organisation_id="gaa",
        search="",
        page=1,
        size=20,
    )
    assert choices.count == 1
    assert choices.data[0].user_id == employee.id
    assert choices.data[0].department_id == "Historical records"
    assert not choices.data[0].can_create
    assert (await records(db_async, manager, employee.id)).data[
        0
    ].department_id == department.id
    with pytest.raises(AppException):
        await service.create_record(
            session=db_async, actor=manager, payload=payload(employee.id)
        )


@pytest.mark.asyncio
async def test_historical_organisation_remains_available_to_subject(db_async):
    from sqlmodel import select

    from src.hr import organisations
    from src.hr.models import EmploymentRecord

    _, employee, manager, _ = await setup_people(db_async)
    await service.create_record(
        session=db_async, actor=manager, payload=payload(employee.id)
    )
    db_async.add(Organisation(id="neworg", code="NEW", name="New employer"))
    await db_async.commit()
    new_department = await make_department(db_async, organisation_id="neworg")
    employment = await db_async.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == employee.id)
    )
    employment.organisation_id = "neworg"
    employment.department_id = new_department.id
    db_async.add(employment)
    await db_async.commit()
    assert {
        org.id for org in await organisations.organisation_choices(db_async, employee)
    } == {"gaa", "neworg"}
    choices = await service.list_employees(
        session=db_async,
        actor=employee,
        organisation_id="gaa",
        search="",
        page=1,
        size=20,
    )
    assert choices.count == 1 and not choices.data[0].can_create
    assert (await records(db_async, employee, employee.id)).count == 1


@pytest.mark.asyncio
async def test_repeated_archive_retains_first_audit(db_async):
    _, employee, manager, _ = await setup_people(db_async)
    record = await service.create_record(
        session=db_async, actor=manager, payload=payload(employee.id)
    )
    await service.archive_record(
        session=db_async,
        actor=manager,
        record_id=record.id,
        payload=TrainingArchiveInput(reason="Original archive reason"),
    )
    repeat = await service.archive_record(
        session=db_async,
        actor=manager,
        record_id=record.id,
        payload=TrainingArchiveInput(reason="Different archive reason"),
    )
    assert repeat.archive_reason == "Original archive reason"


@pytest.mark.asyncio
async def test_concurrent_archive_preserves_one_audit_event(db_async):
    import asyncio

    from src.database import async_session_factory
    from tests.factories import _load_user_with_roles

    _, employee, manager, _ = await setup_people(db_async)
    record = await service.create_record(
        session=db_async, actor=manager, payload=payload(employee.id)
    )

    async def archive(reason):
        async with async_session_factory() as session:
            actor = await _load_user_with_roles(session, manager.id)
            result = await service.archive_record(
                session=session,
                actor=actor,
                record_id=record.id,
                payload=TrainingArchiveInput(reason=reason),
            )
            return result.archive_reason, result.archived_at, result.archived_by

    first, second = await asyncio.gather(
        archive("First request reason"), archive("Second request reason")
    )
    assert first == second
    assert first[0] in {"First request reason", "Second request reason"}
