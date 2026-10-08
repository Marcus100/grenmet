"""Explicit HR organisation identity and setup boundaries."""

import pytest
from sqlalchemy import select

from src.audit.models import AuditEntry
from src.auth.models import UserRoleAssignment
from src.baseline import service as baseline
from src.baseline.models import ApprovalPolicy
from src.baseline.schemas import GradeInput, StaffInput
from src.exceptions import AppException
from src.hr import organisations
from src.hr.models import Grade
from tests.factories import make_department, make_employee, make_user


async def test_organisation_routes_require_superuser_and_preserve_stable_identity(
    async_client, superuser_token_headers_async, normal_user_token_headers_async
):
    payload = {"id": "route_employer", "code": "ROUTEEMP", "name": "Route Employer"}
    forbidden = await async_client.post(
        "/api/v1/hr/organisations",
        headers=normal_user_token_headers_async,
        json=payload,
    )
    assert forbidden.status_code == 403
    created = await async_client.post(
        "/api/v1/hr/organisations", headers=superuser_token_headers_async, json=payload
    )
    assert created.status_code == 201
    assert created.json() == payload
    duplicate = await async_client.post(
        "/api/v1/hr/organisations", headers=superuser_token_headers_async, json=payload
    )
    assert duplicate.status_code == 409
    renamed = await async_client.patch(
        "/api/v1/hr/organisations/route_employer",
        headers=superuser_token_headers_async,
        json={"name": "Updated Route Employer"},
    )
    assert renamed.status_code == 200
    assert renamed.json() == {**payload, "name": "Updated Route Employer"}
    denied_rename = await async_client.patch(
        "/api/v1/hr/organisations/route_employer",
        headers=normal_user_token_headers_async,
        json={"name": "Forbidden"},
    )
    assert denied_rename.status_code == 403
    invalid = await async_client.post(
        "/api/v1/hr/organisations",
        headers=superuser_token_headers_async,
        json={**payload, "id": "invalid employer"},
    )
    assert invalid.status_code == 422


async def test_register_and_rename_preserve_identity_and_do_not_grant_access(db_async):
    actor = await make_user(db_async, superuser=True)
    organisation = await organisations.create_organisation(
        db_async,
        actor,
        organisation_id="test_employer",
        code="TESTEMP",
        name=" Test Employer ",
    )
    assert organisation.name == "Test Employer"
    assert (
        await db_async.execute(
            select(UserRoleAssignment).where(
                UserRoleAssignment.organisation_id == organisation.id
            )
        )
    ).scalars().all() == []
    renamed = await organisations.rename_organisation(
        db_async, actor, organisation.id, "Updated Employer"
    )
    assert (renamed.id, renamed.code, renamed.name) == (
        "test_employer",
        "TESTEMP",
        "Updated Employer",
    )
    entries = list(
        (
            await db_async.execute(
                select(AuditEntry).where(
                    AuditEntry.entity_type == "organisation",
                    AuditEntry.entity_id == organisation.id,
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(entries) == 2
    assert {entry.actor_user_id for entry in entries} == {actor.id}
    with pytest.raises(AppException, match="already exists"):
        await organisations.create_organisation(
            db_async,
            actor,
            organisation_id="other_id",
            code="TESTEMP",
            name="Duplicate",
        )
    with pytest.raises(AppException, match="name is required"):
        await organisations.rename_organisation(db_async, actor, organisation.id, " ")


async def test_ordinary_staff_cannot_register_or_rename_an_organisation(db_async):
    actor = await make_user(db_async)
    with pytest.raises(AppException, match="Only a superuser"):
        await organisations.create_organisation(
            db_async,
            actor,
            organisation_id="forbidden",
            code="FORBIDDEN",
            name="Forbidden",
        )
    with pytest.raises(AppException, match="Only a superuser"):
        await organisations.rename_organisation(db_async, actor, "gaa", "Forbidden")


async def test_staff_grades_and_policies_follow_selected_employer(db_async):
    actor = await make_user(db_async, superuser=True)
    await organisations.create_organisation(
        db_async,
        actor,
        organisation_id="other_employer",
        code="OTHEREMP",
        name="Other Employer",
    )
    first = await make_department(db_async, "first_unit")
    second = await make_department(
        db_async, "second_unit", organisation_id="other_employer"
    )
    employee = await make_user(db_async)
    outsider = await make_user(db_async)
    unplaced = await make_user(db_async)
    await make_employee(db_async, user=employee, department_id=first.id)
    await make_employee(db_async, user=outsider, department_id=second.id)
    for department in [first, second]:
        db_async.add(
            Grade(
                id=f"{department.id}_staff",
                department_id=department.id,
                code="STAFF",
                label="Staff",
                rank=1,
            )
        )
        db_async.add(ApprovalPolicy(key=f"hr:{department.id}:LEAVE"))
    db_async.add(ApprovalPolicy(key="hr:firstXunit:LEAVE"))
    await db_async.commit()
    own = await baseline.list_staff(db_async, "gaa")
    other = await baseline.list_staff(db_async, "other_employer")
    assert {person.user_id for person in own} == {employee.id}
    assert {person.organisation_id for person in own} == {"gaa"}
    assert {person.user_id for person in other} == {outsider.id}
    queue = await baseline.list_staff(db_async, unassigned=True)
    assert unplaced.id in {person.user_id for person in queue}
    assert employee.id not in {person.user_id for person in queue}
    assert all(person.organisation_id is None for person in queue)
    grades = await baseline.read_setup_grades(
        session=db_async, current_user=actor, organisation_id="other_employer"
    )
    assert {grade.department_id for grade in grades} == {second.id}
    policies = await baseline.read_setup_policies(
        session=db_async, current_user=actor, organisation_id="gaa"
    )
    assert {policy.key for policy in policies} == {f"hr:{first.id}:LEAVE"}
    with pytest.raises(AppException, match="outside the selected organisation"):
        await baseline.save_staff(
            db_async,
            actor,
            unplaced.id,
            StaffInput(
                organisation_id="gaa",
                department_id=second.id,
                grade_id=f"{second.id}_staff",
            ),
        )
    with pytest.raises(AppException, match="Organisation not found"):
        await baseline.list_staff(db_async, "unknown")
    with pytest.raises(AppException, match="do not have an organisation"):
        await baseline.list_staff(db_async, "gaa", unassigned=True)


async def test_new_employer_grade_collision_keeps_existing_definition(db_async):
    actor = await make_user(db_async, superuser=True)
    department = await make_department(db_async, "grade_unit")
    body = GradeInput(department_id=department.id, code="STAFF", label="Staff", rank=1)
    await baseline.save_grade(db_async, actor, "first_grade", body)
    with pytest.raises(AppException, match="Grade code already exists"):
        await baseline.save_grade(db_async, actor, "duplicate_grade", body)
    assert await db_async.get(Grade, "duplicate_grade") is None
    updated = await baseline.save_grade(
        db_async,
        actor,
        "first_grade",
        body.model_copy(update={"label": "Updated Staff"}),
    )
    assert updated.label == "Updated Staff"
    assert updated.department_id == department.id
