"""Launch invariants: additive structure, least access, immutable workflow snapshots."""

import uuid
from datetime import timedelta

import pytest
from sqlalchemy.orm import selectinload
from sqlmodel import select

from src.auth import access
from src.auth import service as auth_service
from src.auth.models import (
    Role,
    RoleAssignmentScope,
    User,
    UserRoleAssignment,
    UserRoleLink,
)
from src.auth.permissions import seed_permissions_and_roles_async
from src.auth.schemas import UserRoleAssignmentCreate
from src.baseline import organisation
from src.baseline.models import AccessReview, ApprovalPolicy, OrganisationPosition
from src.exceptions import AppException
from src.hr.models import Department
from src.hr.workflow import configuration, service
from src.hr.workflow.models import (
    WorkflowAction,
    WorkflowInstance,
    WorkflowStatus,
    WorkflowStepInstance,
    WorkflowStepTemplate,
    WorkflowTemplate,
    WorkflowType,
)
from src.hr.workflow.schemas import WorkflowActionRequest, WorkflowConfigurationInput
from src.utils.datetime import utc_now


async def people(session):
    admin = User(
        username="governance-admin",
        email="governance-admin@example.com",
        first_name="Admin",
        last_name="Reviewer",
        hashed_password="unused",
        is_superuser=True,
    )
    staff = User(
        username="governance-staff",
        email="governance-staff@example.com",
        first_name="Staff",
        last_name="Member",
        hashed_password="unused",
    )
    session.add_all(
        [
            admin,
            staff,
            Department(
                organisation_id="gaa",
                code="gms",
                id="gms",
                name="Meteorological Department",
            ),
        ]
    )
    await session.commit()
    await seed_permissions_and_roles_async(session)
    return admin, staff


@pytest.mark.asyncio
async def test_organisation_is_additive_and_preserves_online_edits(db_async):
    admin, staff = await people(db_async)
    before = await organisation.preview(db_async, admin)
    assert len(before.catalogue.positions) == 102
    assert "gms" not in before.missing_departments
    assert not (await db_async.execute(select(OrganisationPosition))).scalars().all()
    await organisation.apply(db_async, admin)
    again = await organisation.apply(db_async, admin)
    assert not again.missing_positions and not again.missing_units
    assert not (await db_async.execute(select(UserRoleAssignment))).scalars().all()
    position = await db_async.get(OrganisationPosition, "GMS_MANAGER")
    position.title = "Verified local title"
    await db_async.commit()
    assert (await organisation.preview(db_async, admin)).conflicts
    with pytest.raises(AppException):
        await organisation.apply(db_async, admin)
    assert (await db_async.get(User, staff.id)).first_name == "Staff"


@pytest.mark.asyncio
async def test_assignment_grants_expiry_and_review_revocation(db_async):
    admin, staff = await people(db_async)
    role = (
        (await db_async.execute(select(Role).where(Role.name == "staff")))
        .scalars()
        .one()
    )
    assignment = await auth_service.create_user_role_assignment(
        session=db_async,
        assignment_in=UserRoleAssignmentCreate(user_id=staff.id, role_id=role.id),
    )
    assert "staff" in (await access.current(db_async, staff)).role_names
    assignment.effective_to = utc_now() - timedelta(seconds=1)
    await db_async.commit()
    assert "staff" not in (await access.current(db_async, staff)).role_names
    # A leftover legacy link must not resurrect an expired scoped assignment.
    db_async.add(UserRoleLink(user_id=staff.id, role_id=role.id))
    await db_async.commit()
    assert "staff" not in (await access.current(db_async, staff)).role_names
    await access.review(
        db_async,
        admin,
        assignment.id,
        access.ReviewInput(decision="REVOKE", reason="No longer needed"),
    )
    assert "staff" not in (await access.current(db_async, staff)).role_names
    assert (
        (await db_async.execute(select(AccessReview)))
        .scalars()
        .one()
        .snapshot["permission_keys"]
    )
    assert (await db_async.execute(select(AccessReview))).scalars().one().snapshot[
        "role_name"
    ] == "staff"


@pytest.mark.asyncio
async def test_self_review_and_non_admin_are_denied(db_async):
    admin, staff = await people(db_async)
    role = (
        (await db_async.execute(select(Role).where(Role.name == "staff")))
        .scalars()
        .one()
    )
    assignment = UserRoleAssignment(
        organisation_id="gaa", user_id=admin.id, role_id=role.id
    )
    db_async.add(assignment)
    await db_async.commit()
    with pytest.raises(AppException):
        await access.review(
            db_async,
            admin,
            assignment.id,
            access.ReviewInput(decision="RETAIN", reason="Keep access"),
        )
    with pytest.raises(AppException):
        await organisation.preview(db_async, staff)


@pytest.mark.asyncio
async def test_workflow_edits_preserve_instances_and_recording_does_not_block(db_async):
    admin, staff = await people(db_async)
    role = (
        (
            await db_async.execute(
                select(Role)
                .where(Role.name == "management")
                .options(selectinload(Role.permissions))
            )
        )
        .scalars()
        .one()
    )
    template = WorkflowTemplate(
        department_id="gms", workflow_type=WorkflowType.LEAVE_REQUEST, name="Leave"
    )
    db_async.add(template)
    await db_async.flush()
    db_async.add(
        WorkflowStepTemplate(
            workflow_template_id=template.id,
            step_order=1,
            required_role_id=role.id,
            required_scope=RoleAssignmentScope.DEPARTMENT,
        )
    )
    db_async.add(
        ApprovalPolicy(
            key="hr:gms:LEAVE_REQUEST",
            allow_self_approval=False,
            require_distinct_approvers=True,
        )
    )
    instance = WorkflowInstance(
        workflow_template_id=template.id,
        department_id="gms",
        workflow_type=WorkflowType.LEAVE_REQUEST,
        entity_type="test",
        entity_id=uuid.uuid4(),
        requested_by_user_id=staff.id,
        status=WorkflowStatus.PENDING,
        current_step_order=1,
        allow_self_approval=False,
        require_distinct_approvers=True,
    )
    db_async.add(instance)
    await db_async.flush()
    await service._create_step_instances_for_workflow(
        session=db_async,
        workflow_instance_id=instance.id,
        workflow_template_id=template.id,
    )
    await db_async.commit()
    body = WorkflowConfigurationInput(
        name="Leave updated",
        steps=[
            {
                "step_order": 1,
                "required_role_id": role.id,
                "label": "Manager review",
                "purpose": "REVIEW",
                "is_required": True,
            },
            {
                "step_order": 2,
                "required_user_id": admin.id,
                "label": "HR records",
                "purpose": "RECORDING",
                "is_required": False,
            },
        ],
    )
    await configuration.save(db_async, admin, template.id, body)
    old_steps = (
        (
            await db_async.execute(
                select(WorkflowStepInstance).where(
                    WorkflowStepInstance.workflow_instance_id == instance.id
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(old_steps) == 1 and old_steps[0].purpose == "APPROVAL"
    recording = WorkflowStepInstance(
        workflow_instance_id=instance.id,
        step_order=2,
        required_user_id=admin.id,
        purpose="RECORDING",
        label="HR records",
        is_required=False,
    )
    db_async.add(recording)
    await db_async.commit()
    await service.apply_workflow_action(
        session=db_async,
        current_user=admin,
        workflow_instance_id=instance.id,
        action_in=WorkflowActionRequest(action=WorkflowAction.APPROVE),
    )
    assert instance.status == WorkflowStatus.APPROVED and recording.action is None
    inbox = await service.list_actionable_instances(
        session=db_async, current_user=admin
    )
    assert any(step.id == recording.id for _, step, _ in inbox)
    await service.apply_workflow_action(
        session=db_async,
        current_user=admin,
        workflow_instance_id=instance.id,
        action_in=WorkflowActionRequest(
            action=WorkflowAction.APPROVE, step_id=recording.id
        ),
    )
    assert (
        instance.status == WorkflowStatus.APPROVED
        and recording.action == WorkflowAction.APPROVE
    )


@pytest.mark.asyncio
async def test_governance_endpoints_require_administrator(
    async_client, normal_user_token_headers_async
):
    for path in [
        "/auth/access-reviews",
        "/hr/setup/organisation",
        "/hr/setup/workflows",
    ]:
        response = await async_client.get(
            "/api/v1" + path, headers=normal_user_token_headers_async
        )
        assert response.status_code == 403
    response = await async_client.get(
        "/api/v1/auth/access/me", headers=normal_user_token_headers_async
    )
    assert response.status_code == 200


def test_catalogue_keeps_all_primary_and_secondary_reporting_lines():
    positions = {p.id: p for p in organisation.CATALOGUE.positions}
    assert len(positions) == 102
    assert positions["GMS_ENTRY_TECH"].reports_to_position_id == "GMS_SENIOR_TECH"
    assert positions["ATS_ATC_CO1"].reports_to_position_id == "ATS_ATC_CO3"
    assert positions["QAC_MANAGER"].additional_connection_id == "GEN_GENERAL_MANAGER"
    assert [p.id for p in positions.values() if p.reports_to_position_id is None] == [
        "GEN_GENERAL_MANAGER"
    ]
    for position in positions.values():
        seen = set()
        current = position
        while current.reports_to_position_id:
            assert current.id not in seen
            seen.add(current.id)
            current = positions[current.reports_to_position_id]


@pytest.mark.asyncio
async def test_legacy_grants_are_visible_and_revocable(db_async):
    admin, staff = await people(db_async)
    role = (
        (await db_async.execute(select(Role).where(Role.name == "staff")))
        .scalars()
        .one()
    )
    db_async.add(UserRoleLink(user_id=staff.id, role_id=role.id))
    await db_async.commit()
    review_data = await access.read_reviews(db_async, admin)
    legacy = next(row for row in review_data.assignments if row.user_id == staff.id)
    assert legacy.scope.startswith("LEGACY")
    await access.review(
        db_async,
        admin,
        legacy.id,
        access.ReviewInput(decision="REVOKE", reason="Remove legacy access"),
    )
    assert not (await access.current(db_async, staff)).role_names
    assert (await db_async.execute(select(AccessReview))).scalars().one().snapshot[
        "permission_keys"
    ] == legacy.permissions


@pytest.mark.asyncio
async def test_configured_scope_restricts_named_users_and_global_role_holders(db_async):
    from src.hr.models import EmploymentRecord

    admin, staff = await people(db_async)
    other = User(
        username="other-dept",
        email="other-dept@example.com",
        first_name="Other",
        last_name="Department",
        hashed_password="unused",
    )
    db_async.add_all(
        [
            other,
            Department(
                organisation_id="gaa", code="hr", id="hr", name="Human Resources"
            ),
        ]
    )
    await db_async.flush()
    db_async.add_all(
        [
            EmploymentRecord(
                organisation_id="gaa", user_id=staff.id, department_id="gms"
            ),
            EmploymentRecord(
                organisation_id="gaa", user_id=other.id, department_id="hr"
            ),
        ]
    )
    role = (
        (await db_async.execute(select(Role).where(Role.name == "management")))
        .scalars()
        .one()
    )
    db_async.add(
        UserRoleAssignment(
            organisation_id="gaa",
            user_id=other.id,
            role_id=role.id,
            scope=RoleAssignmentScope.ALL,
        )
    )
    await db_async.commit()
    template = WorkflowTemplate(
        department_id="gms", workflow_type=WorkflowType.LEAVE_REQUEST, name="Scoped"
    )
    instance = WorkflowInstance(
        workflow_template_id=template.id,
        department_id="gms",
        workflow_type=WorkflowType.LEAVE_REQUEST,
        entity_type="test",
        entity_id=uuid.uuid4(),
        requested_by_user_id=staff.id,
        allow_self_approval=False,
        require_distinct_approvers=False,
    )
    step = WorkflowStepInstance(
        workflow_instance_id=instance.id,
        step_order=1,
        required_role_id=role.id,
        required_scope=RoleAssignmentScope.DEPARTMENT,
        scope_enforced=True,
    )
    assert not await service._is_actor_allowed_for_step(
        session=db_async,
        current_user=other,
        workflow_instance=instance,
        workflow_step=step,
    )
    step.required_scope = RoleAssignmentScope.ALL
    assert await service._is_actor_allowed_for_step(
        session=db_async,
        current_user=other,
        workflow_instance=instance,
        workflow_step=step,
    )
    step.required_role_id = None
    step.required_user_id = other.id
    step.required_scope = RoleAssignmentScope.SELF
    assert not await service._is_actor_allowed_for_step(
        session=db_async,
        current_user=other,
        workflow_instance=instance,
        workflow_step=step,
    )
