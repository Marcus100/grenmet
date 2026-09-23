"""Change history: flush capture, actor attribution, scoped reads, sensitive masking."""

from datetime import date, datetime

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.audit.models import AuditEntry
from src.auth.models import RoleAssignmentScope
from src.exceptions import AuthorizationError, NotFoundError
from src.hr.calendar.schemas import CalendarEventCreate
from src.hr.calendar.service import create_calendar_event
from src.hr.models import Grade, Organisation
from src.hr.training.models import TrainingRecord
from src.hr.workflow.models import WorkflowTemplate, WorkflowType
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_user,
)


async def _training(
    db: AsyncSession, *, user_id, department_id, created_by
) -> TrainingRecord:
    record = TrainingRecord(
        organisation_id="gaa",
        department_id=department_id,
        user_id=user_id,
        course_name="Aviation first aid",
        provider="Red Cross",
        completed_on=date(2026, 1, 10),
        result="completed",
        expires_on=date(2028, 1, 10),
        notes="Private remark",
        created_by=created_by,
    )
    db.add(record)
    await db.commit()
    return record


async def _entries(db: AsyncSession, record_id) -> list[AuditEntry]:
    rows = await db.execute(
        select(AuditEntry)
        .where(AuditEntry.record_id == str(record_id))
        .order_by(AuditEntry.created_at)
    )
    return list(rows.scalars().all())


async def test_create_update_delete_are_recorded_with_actor(
    db_async: AsyncSession,
) -> None:
    dept = await make_department(db_async, "dept_audit_crud")
    manager = await make_user(db_async)
    employee = await make_user(db_async)
    audit_service.set_actor(db_async, manager.id)

    record = await _training(
        db_async, user_id=employee.id, department_id=dept.id, created_by=manager.id
    )
    record.notes = "Corrected remark"
    record.provider = "St John"
    await db_async.commit()
    await db_async.delete(record)
    await db_async.commit()

    entries = await _entries(db_async, record.id)
    assert [entry.action for entry in entries] == ["create", "update", "delete"]
    assert all(entry.actor_user_id == manager.id for entry in entries)
    assert entries[0].entity_type == "training_record"
    assert entries[0].organisation_id == "gaa"
    created = {change["field"]: change for change in entries[0].changes}
    assert created["course_name"]["new"] == "Aviation first aid"
    assert created["completed_on"]["new"] == "2026-01-10"
    assert "created_at" not in created  # bookkeeping columns are excluded
    updated = {change["field"]: change for change in entries[1].changes}
    assert set(updated) == {"notes", "provider"}
    assert updated["provider"] == {
        "field": "provider",
        "old": "Red Cross",
        "new": "St John",
        "sensitive": False,
    }
    assert updated["notes"]["sensitive"] is True


async def test_unchanged_flush_records_nothing(db_async: AsyncSession) -> None:
    dept = await make_department(db_async, "dept_audit_noop")
    employee = await make_user(db_async)
    record = await _training(
        db_async, user_id=employee.id, department_id=dept.id, created_by=employee.id
    )
    record.provider = "Red Cross"  # same value
    await db_async.commit()
    assert [entry.action for entry in await _entries(db_async, record.id)] == ["create"]


async def test_writes_without_signed_in_user_are_system(db_async: AsyncSession) -> None:
    dept = await make_department(db_async, "dept_audit_system")
    employee = await make_user(db_async)
    record = await _training(
        db_async, user_id=employee.id, department_id=dept.id, created_by=employee.id
    )
    superuser = await make_user(db_async, superuser=True)
    history = await audit_service.list_history(
        session=db_async,
        actor=superuser,
        entity_type="training_record",
        entity_id=str(record.id),
    )
    assert history.count == 1
    assert history.data[0].actor_user_id is None
    assert history.data[0].actor_name == "System"


async def test_employee_sees_own_history_with_sensitive_values_masked(
    db_async: AsyncSession,
) -> None:
    dept = await make_department(db_async, "dept_audit_mask")
    employee = await make_user(db_async)
    record = await _training(
        db_async, user_id=employee.id, department_id=dept.id, created_by=employee.id
    )
    history = await audit_service.list_history(
        session=db_async,
        actor=employee,
        entity_type="training_record",
        entity_id=str(record.id),
    )
    changes = {change.field: change for change in history.data[0].changes}
    assert changes["course_name"].new == "Aviation first aid"
    assert changes["notes"].masked is True
    assert changes["notes"].new is None


async def test_sensitive_permission_reveals_values(db_async: AsyncSession) -> None:
    dept = await make_department(db_async, "dept_audit_reveal")
    employee = await make_user(db_async)
    await make_employee(db_async, user=employee, department_id=dept.id)
    reviewer = await make_user(db_async)
    role, _ = await make_role_with_permission(
        db_async, "hr.training.read.department", "audit.view_sensitive"
    )
    await assign_role(
        db_async,
        user=reviewer,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=dept.id,
    )
    record = await _training(
        db_async, user_id=employee.id, department_id=dept.id, created_by=reviewer.id
    )
    history = await audit_service.list_history(
        session=db_async,
        actor=reviewer,
        entity_type="training_record",
        entity_id=str(record.id),
    )
    changes = {change.field: change for change in history.data[0].changes}
    assert changes["notes"].masked is False
    assert changes["notes"].new == "Private remark"


async def test_out_of_scope_reader_is_denied(db_async: AsyncSession) -> None:
    home = await make_department(db_async, "dept_audit_home")
    other = await make_department(db_async, "dept_audit_other")
    employee = await make_user(db_async)
    await make_employee(db_async, user=employee, department_id=home.id)
    outsider = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "hr.training.read.department")
    await assign_role(
        db_async,
        user=outsider,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=other.id,
    )
    record = await _training(
        db_async, user_id=employee.id, department_id=home.id, created_by=employee.id
    )
    with pytest.raises(AuthorizationError):
        await audit_service.list_history(
            session=db_async,
            actor=outsider,
            entity_type="training_record",
            entity_id=str(record.id),
        )


async def test_setup_history_cannot_be_read_across_organisations(
    db_async: AsyncSession,
) -> None:
    db_async.add(Organisation(id="other", code="OTHER", name="Other organisation"))
    await db_async.commit()
    actor = await make_user(db_async)
    role, _ = await make_role_with_permission(
        db_async, "hr.employment.manage", "calendar.view"
    )
    await assign_role(db_async, user=actor, role=role, scope=RoleAssignmentScope.ALL)
    home = await make_department(db_async, "audit_home")
    other = await make_department(db_async, "audit_other", organisation_id="other")
    grade = Grade(
        id="audit_other_grade",
        department_id=other.id,
        code="PRIVATE",
        label="Private grade",
        rank=1,
    )
    template = WorkflowTemplate(
        department_id=other.id,
        workflow_type=WorkflowType.LEAVE_REQUEST,
        name="Private workflow",
    )
    db_async.add_all([grade, template])
    await db_async.commit()
    author = await make_user(db_async, superuser=True)
    event = await create_calendar_event(
        session=db_async,
        current_user=author,
        payload=CalendarEventCreate(
            department_id=other.id,
            title="Private event",
            starts_at=datetime(2026, 7, 6, 9),
            ends_at=datetime(2026, 7, 6, 10),
        ),
    )
    for entity_type, entity_id in (
        ("department", other.id),
        ("grade", grade.id),
        ("workflow_template", str(template.id)),
        ("calendar_event", str(event.id)),
    ):
        with pytest.raises(AuthorizationError):
            await audit_service.list_history(
                session=db_async,
                actor=actor,
                entity_type=entity_type,
                entity_id=entity_id,
            )
    home_history = await audit_service.list_history(
        session=db_async,
        actor=actor,
        entity_type="department",
        entity_id=home.id,
    )
    assert home_history.count == 1


async def test_unknown_entity_type_is_not_found(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    with pytest.raises(NotFoundError):
        await audit_service.list_history(
            session=db_async, actor=user, entity_type="nope", entity_id="x"
        )


async def test_history_endpoint(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    dept = await make_department(db_async, "dept_audit_api")
    employee = await make_user(db_async)
    record = await _training(
        db_async, user_id=employee.id, department_id=dept.id, created_by=employee.id
    )
    response = await async_client.get(
        f"/api/v1/audit/training_record/{record.id}",
        headers=superuser_token_headers_async,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == 1
    assert body["data"][0]["record_label"] == "Training record"
    assert body["data"][0]["action"] == "create"


async def test_authenticated_request_session_carries_actor(
    db_async: AsyncSession,
) -> None:
    """Every credential path goes through get_authenticated_user, which tags the
    request session so later audited writes are attributed to that person."""
    from src.audit.listener import ACTOR_KEY
    from src.dependencies import get_authenticated_user

    user = await make_user(db_async)
    db_async.info.pop(ACTOR_KEY, None)
    await get_authenticated_user(db_async, user.id)
    assert db_async.info[ACTOR_KEY] == user.id

    dept = await make_department(db_async, "dept_audit_actor")
    dept.name = "Renamed"
    await db_async.commit()
    entries = await _entries(db_async, dept.id)
    assert entries[-1].action == "update"
    assert entries[-1].actor_user_id == user.id
