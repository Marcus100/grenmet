import json
from pathlib import Path

import pytest
from sqlalchemy import select

from src.auth.models import Role, User
from src.baseline import catalogue, product_access, service
from src.baseline.models import ApprovalPolicy, BaselineAudit, StaffCredential
from src.baseline.schemas import StaffInput
from src.exceptions import AppException
from src.hr.models import Department, EmploymentStatus, Grade
from src.utils.datetime import utc_now


async def setup(session):
    actor = User(
        username="catalogue-admin",
        email="catalogue@example.com",
        first_name="Setup",
        last_name="Admin",
        hashed_password="unused",
        is_superuser=True,
    )
    session.add(actor)
    session.add(
        Department(
            organisation_id="gaa",
            code="meteorological_department",
            id="meteorological_department",
            name="Meteorological Department",
        )
    )
    for name in ("management", "hr-supervisor", "hr-recorder"):
        if (
            not (await session.execute(select(Role).where(Role.name == name)))
            .scalars()
            .first()
        ):
            session.add(Role(name=name))
    await session.commit()
    return actor


def test_runtime_catalogue_matches_ingested_grades():
    profile = (
        Path(__file__).resolve().parents[5] / "scripts/gms-roster/profiles/gms.json"
    )
    assert catalogue.GRADE_SPECS == json.loads(profile.read_text())["grades"]


@pytest.mark.asyncio
async def test_preview_apply_repeat_preserves_online_records(db_async):
    actor = await setup(db_async)
    preview = await catalogue.preview(db_async, actor, "meteorological_department")
    assert len(preview.missing_grade_ids) == 6
    assert len(preview.missing_policy_keys) == 7
    assert not (await db_async.execute(select(Grade))).scalars().all()
    result = await catalogue.apply(db_async, actor, "meteorological_department")
    assert not result.missing_grade_ids and not result.missing_policy_keys
    grade = await db_async.get(Grade, "GMS_SENIOR_TECH")
    grade.label = "Verified online label"
    policy = await db_async.get(ApprovalPolicy, "cap")
    policy.allow_self_approval = True
    await db_async.commit()
    await catalogue.apply(db_async, actor, "meteorological_department")
    await db_async.refresh(grade)
    await db_async.refresh(policy)
    assert grade.label == "Verified online label"
    assert policy.allow_self_approval
    assert not (await db_async.execute(select(StaffCredential))).scalars().all()
    assert (
        len(
            (
                await db_async.execute(
                    select(BaselineAudit).where(
                        BaselineAudit.action == "catalogue.import"
                    )
                )
            )
            .scalars()
            .all()
        )
        == 1
    )


@pytest.mark.asyncio
async def test_conflicting_department_prevents_partial_import(db_async):
    actor = await setup(db_async)
    db_async.add(
        Department(
            organisation_id="gaa",
            code="gms",
            id="gms",
            name="Other existing GMS identity",
        )
    )
    await db_async.flush()
    db_async.add(
        Grade(
            id="GMS_MANAGER",
            department_id="gms",
            code="MANAGER",
            label="Manager",
            rank=1,
        )
    )
    await db_async.commit()
    preview = await catalogue.preview(db_async, actor, "meteorological_department")
    assert preview.conflicts
    with pytest.raises(AppException):
        await catalogue.apply(db_async, actor, "meteorological_department")
    assert not (await db_async.execute(select(ApprovalPolicy))).scalars().all()
    assert len((await db_async.execute(select(Grade))).scalars().all()) == 1


@pytest.mark.asyncio
async def test_incomplete_personnel_can_save_grade_but_cannot_submit(db_async):
    actor = await setup(db_async)
    await catalogue.apply(db_async, actor, "meteorological_department")
    await service.save_staff(
        db_async,
        actor,
        actor.id,
        StaffInput(
            department_id="meteorological_department",
            grade_id="GMS_SENIOR_TECH",
            employee_number="MET-TEST",
            employment_type="FULL_TIME",
            mailbox_ready=True,
        ),
    )
    employment = await service.employment_for(db_async, actor.id)
    assert employment.employee_number == "MET-TEST" and employment.start_date is None
    assert not service.employment_complete(employment)
    with pytest.raises(AppException):
        await service.require_ready(db_async, actor.id, "meteorological_department")
    actor.is_superuser = False
    assert "morning" in await product_access.allowed_kinds(db_async, actor)
    employment.department_id = "gms"
    assert await product_access.allowed_kinds(db_async, actor) == []


@pytest.mark.asyncio
async def test_catalogue_admin_boundary(
    async_client, normal_user_token_headers_async, superuser_token_headers_async
):
    response = await async_client.get(
        "/api/v1/hr/setup/catalogue?department_id=gms",
        headers=normal_user_token_headers_async,
    )
    assert response.status_code == 403
    response = await async_client.post(
        "/api/v1/hr/setup/catalogue",
        headers=normal_user_token_headers_async,
        json={"department_id": "gms"},
    )
    assert response.status_code == 403
    response = await async_client.get(
        "/api/v1/hr/setup/catalogue?department_id=unrelated",
        headers=superuser_token_headers_async,
    )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_inactive_grades_are_reported_and_preserved(db_async):
    actor = await setup(db_async)
    await catalogue.apply(db_async, actor, "meteorological_department")
    grade = await db_async.get(Grade, "GMS_MANAGER")
    grade.is_active = False
    await db_async.commit()
    result = await catalogue.preview(db_async, actor, "meteorological_department")
    assert any("inactive" in conflict for conflict in result.conflicts)
    with pytest.raises(AppException):
        await catalogue.apply(db_async, actor, "meteorological_department")
    await db_async.refresh(grade)
    assert not grade.is_active


@pytest.mark.asyncio
@pytest.mark.parametrize("order,required", [(1, False), (2, True)])
async def test_malformed_required_chain_is_reported(db_async, order, required):
    from src.hr.workflow.models import WorkflowStepTemplate

    actor = await setup(db_async)
    await catalogue.apply(db_async, actor, "meteorological_department")
    steps = (await db_async.execute(select(WorkflowStepTemplate))).scalars().all()
    for step in steps:
        step.is_required = False
    steps[0].is_required = required
    steps[0].step_order = order + 10 if order == 2 else order
    await db_async.commit()
    preview = await catalogue.preview(db_async, actor, "meteorological_department")
    assert any("consecutive stages" in message for message in preview.conflicts)
    with pytest.raises(AppException):
        await catalogue.apply(db_async, actor, "meteorological_department")


@pytest.mark.asyncio
async def test_optional_stage_between_required_stages_is_valid(db_async):
    from src.hr.workflow.models import WorkflowStepTemplate

    actor = await setup(db_async)
    await catalogue.apply(db_async, actor, "meteorological_department")
    steps = (await db_async.execute(select(WorkflowStepTemplate))).scalars().all()
    for step in steps:
        if step.step_order == 2:
            step.is_required = False
        elif step.step_order == 3:
            step.is_required = True
            step.purpose = "REVIEW"
    await db_async.commit()
    result = await catalogue.preview(db_async, actor, "meteorological_department")
    assert not result.conflicts


@pytest.mark.asyncio
async def test_group_authoring_check_matches_the_single_user_rule(db_async):
    actor = await setup(db_async)
    await catalogue.apply(db_async, actor, "meteorological_department")
    await service.save_staff(
        db_async,
        actor,
        actor.id,
        StaffInput(
            department_id="meteorological_department",
            grade_id="GMS_SENIOR_TECH",
            employee_number="MET-GROUP",
            employment_type="FULL_TIME",
            mailbox_ready=True,
        ),
    )
    actor.is_superuser = False
    assert "morning" in await product_access.allowed_kinds(db_async, actor)
    assert await product_access.users_who_may_author(
        db_async, "morning", [actor.id]
    ) == {actor.id}
    assert (
        await product_access.users_who_may_author(db_async, "unknown", [actor.id])
        == set()
    )
    credential = await db_async.get(StaffCredential, actor.id)
    credential.revoked_at = utc_now()
    await db_async.commit()
    assert await product_access.allowed_kinds(db_async, actor) == []
    assert (
        await product_access.users_who_may_author(db_async, "morning", [actor.id])
        == set()
    )


async def _staffed_actor(db_async):
    actor = await setup(db_async)
    await catalogue.apply(db_async, actor, "meteorological_department")
    await service.save_staff(
        db_async,
        actor,
        actor.id,
        StaffInput(
            department_id="meteorological_department",
            grade_id="GMS_SENIOR_TECH",
            employee_number="MET-EDGE",
            employment_type="FULL_TIME",
            mailbox_ready=True,
        ),
    )
    actor.is_superuser = False
    db_async.add(Department(organisation_id="gaa", code="other", id="other", name="O"))
    await db_async.commit()
    return actor


async def _agree(db_async, user, expected: bool) -> None:
    await db_async.commit()
    single = "morning" in await product_access.allowed_kinds(db_async, user)
    group = bool(
        await product_access.users_who_may_author(db_async, "morning", [user.id])
    )
    assert single == group == expected


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "case",
    [
        "employment_inactive",
        "non_gms_department",
        "inactive_grade",
        "grade_of_another_department",
        "pending_registration",
    ],
)
async def test_group_authoring_check_refuses_what_the_single_rule_refuses(
    db_async, case
):
    actor = await _staffed_actor(db_async)
    await _agree(db_async, actor, True)
    employment = await service.employment_for(db_async, actor.id)
    if case == "employment_inactive":
        employment.status = EmploymentStatus.INACTIVE
    elif case == "non_gms_department":
        employment.department_id = "other"
    elif case == "inactive_grade":
        (await db_async.get(Grade, employment.grade_id)).is_active = False
    elif case == "grade_of_another_department":
        db_async.add(
            Grade(id="OTHER_G", department_id="other", code="G", label="G", rank=1)
        )
        await db_async.flush()
        employment.grade_id = "OTHER_G"
    else:
        actor.registration_pending = True
    await _agree(db_async, actor, False)


@pytest.mark.asyncio
async def test_group_authoring_check_lets_a_superuser_without_employment_author(
    db_async,
):
    admin = await setup(db_async)
    assert admin.is_superuser
    await _agree(db_async, admin, True)
