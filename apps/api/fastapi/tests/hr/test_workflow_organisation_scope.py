"""Synthetic two-organisation workflow and dashboard acceptance boundaries."""

from datetime import date, datetime, timedelta
from decimal import Decimal
from uuid import uuid4
from zoneinfo import ZoneInfo

import httpx
import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import (
    Role,
    RoleAssignmentScope,
    User,
    UserRoleAssignment,
    UserRoleLink,
)
from src.auth.utils import create_access_token
from src.exceptions import AppException, AuthorizationError
from src.hr import notifications
from src.hr.dashboard import service as dashboard_service
from src.hr.exceptions import HRValidationError
from src.hr.leave import service as leave_service
from src.hr.leave.schemas import LeaveRequestCreate, LeaveRequestSubmit
from src.hr.models import EmploymentRecord, EmploymentStatus, Organisation
from src.hr.roster.models import (
    RosterAssignment,
    RosterPeriod,
    RosterPeriodStatus,
    ShiftCatalog,
    ShiftCategory,
)
from src.hr.workflow import service
from src.hr.workflow.models import (
    WorkflowAction,
    WorkflowInstance,
    WorkflowStatus,
    WorkflowStepInstance,
    WorkflowTemplate,
    WorkflowType,
)
from src.hr.workflow.schemas import WorkflowActionRequest
from src.notifications import service as notification_service
from src.notifications.models import Notification
from src.utils.datetime import utc_now
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_permission,
    make_ready_staff,
    make_role_with_permission,
    make_user,
)


async def _setup(session: AsyncSession):
    session.add(Organisation(id="other", code="OTHER", name="Synthetic employer"))
    await session.commit()
    home = await make_department(session, "gaa-team")
    away = await make_department(session, "other-team", organisation_id="other")
    actor = await make_user(session)
    actor.email_verified_at = utc_now()
    owner = await make_user(session)
    outsider = await make_user(session)
    await make_employee(session, user=actor, department_id=home.id)
    await make_employee(session, user=owner, department_id=home.id)
    other_employment = await make_employee(
        session, user=outsider, department_id=away.id
    )
    role, _ = await make_role_with_permission(
        session,
        "workflow.template.manage",
        "workflow.template.view",
        "workflow.instance.action",
        "workflow.instance.view",
        "roster.view",
    )
    grant = await assign_role(
        session, user=actor, role=role, scope=RoleAssignmentScope.ALL
    )
    templates = [
        WorkflowTemplate(
            department_id=dept.id,
            workflow_type=WorkflowType.LEAVE_REQUEST,
            name="Synthetic approval",
        )
        for dept in (home, away)
    ]
    session.add_all(templates)
    await session.flush()
    instances = [
        WorkflowInstance(
            workflow_template_id=template.id,
            department_id=template.department_id,
            workflow_type=template.workflow_type,
            entity_type="synthetic_request",
            entity_id=uuid4(),
            requested_by_user_id=user.id,
            status=WorkflowStatus.PENDING,
            current_step_order=1,
        )
        for template, user in zip(templates, (owner, outsider), strict=True)
    ]
    session.add_all(instances)
    await session.flush()
    for instance in instances:
        session.add(
            WorkflowStepInstance(
                workflow_instance_id=instance.id,
                step_order=1,
                required_role_id=role.id,
                required_scope=RoleAssignmentScope.ALL,
                scope_enforced=True,
            )
        )
    await session.commit()
    return (
        actor,
        outsider,
        home,
        away,
        role,
        grant,
        templates,
        instances,
        other_employment,
    )


@pytest.mark.asyncio
async def test_workflow_counts_ids_history_and_mutations_reject_other_org(
    db_async: AsyncSession, async_client: httpx.AsyncClient
):
    actor, outsider, home, away, role, _, templates, instances, _ = await _setup(
        db_async
    )
    headers = {
        "Authorization": f"Bearer {create_access_token(actor.id, timedelta(minutes=5))}"
    }
    result = await async_client.get("/api/v1/hr/workflows/templates", headers=headers)
    assert result.status_code == 200, result.text
    assert result.json()["count"] == 1
    assert [row["department_id"] for row in result.json()["data"]] == [home.id]
    for department_id, expected in ((home.id, 200), (away.id, 403)):
        result = await async_client.get(
            "/api/v1/hr/workflows/templates",
            headers=headers,
            params={"department_id": department_id},
        )
        assert result.status_code == expected, result.text
    result = await async_client.post(
        "/api/v1/hr/workflows/templates",
        headers=headers,
        json={
            "department_id": away.id,
            "workflow_type": "LEAVE_REQUEST",
            "name": "Forbidden template",
        },
    )
    assert result.status_code == 403, result.text
    result = await async_client.post(
        f"/api/v1/hr/workflows/templates/{templates[1].id}/steps",
        headers=headers,
        json={"step_order": 2, "required_role_id": str(role.id)},
    )
    assert result.status_code == 403, result.text
    result = await async_client.post(
        f"/api/v1/hr/workflows/templates/{templates[0].id}/steps",
        headers=headers,
        json={"step_order": 2, "required_user_id": str(outsider.id)},
    )
    assert result.status_code == 400, result.text
    assert "Named approver" in result.text
    for instance, expected in zip(instances, (200, 403), strict=True):
        result = await async_client.get(
            f"/api/v1/hr/workflows/instances/{instance.id}", headers=headers
        )
        assert result.status_code == expected, result.text
    result = await async_client.post(
        f"/api/v1/hr/workflows/instances/{instances[1].id}/actions",
        headers=headers,
        json={"action": "APPROVE"},
    )
    assert result.status_code == 403, result.text
    inbox = await async_client.get(
        "/api/v1/hr/workflows/instances/inbox", headers=headers
    )
    assert inbox.status_code == 200, inbox.text
    assert inbox.json()["count"] == 1
    assert inbox.json()["data"][0]["instance_id"] == str(instances[0].id)
    assert actor.id in await notifications.pending_approvers(db_async, instances[0])
    assert actor.id not in await notifications.pending_approvers(db_async, instances[1])


@pytest.mark.asyncio
async def test_named_approver_membership_revocation_removes_inbox_history_and_notifications(
    db_async: AsyncSession,
):
    actor, _, _, away, role, _, _, instances, _ = await _setup(db_async)
    outsider = await make_user(db_async)
    employment = await make_employee(db_async, user=outsider, department_id=away.id)
    peer_grant = await assign_role(
        db_async, user=outsider, role=role, organisation_id="other"
    )
    named = WorkflowStepInstance(
        workflow_instance_id=instances[1].id,
        step_order=1,
        required_user_id=outsider.id,
    )
    db_async.add(named)
    await db_async.commit()
    assert await service._is_actor_allowed_for_step(
        session=db_async,
        current_user=outsider,
        workflow_instance=instances[1],
        workflow_step=named,
    )
    peer_grant.effective_to = utc_now() - timedelta(seconds=1)
    await db_async.commit()
    assert outsider.id not in await notifications.pending_approvers(
        db_async, instances[1]
    )
    with pytest.raises(AuthorizationError):
        await service.list_actionable_instances(session=db_async, current_user=outsider)
    peer_grant.effective_to = None
    # A named ID cannot confer access to a different organisation.
    named.required_user_id = actor.id
    await db_async.commit()
    assert not await service._is_actor_allowed_for_step(
        session=db_async,
        current_user=actor,
        workflow_instance=instances[1],
        workflow_step=named,
    )
    assert actor.id not in await notifications.pending_approvers(db_async, instances[1])
    with pytest.raises(AppException):
        await service.read_workflow_instance_details(
            session=db_async, current_user=actor, workflow_instance_id=instances[1].id
        )
    # Offboarding the named employee preserves their personal identity.
    named.required_user_id = outsider.id
    employment.status = EmploymentStatus.TERMINATED
    await db_async.commit()
    assert outsider.is_active
    assert outsider.id not in await notifications.pending_approvers(
        db_async, instances[1]
    )
    assert not await service.list_actionable_instances(
        session=db_async, current_user=outsider
    )
    with pytest.raises(AppException):
        await service.apply_workflow_action(
            session=db_async,
            current_user=outsider,
            workflow_instance_id=instances[1].id,
            action_in=WorkflowActionRequest(action=WorkflowAction.APPROVE),
        )


@pytest.mark.asyncio
async def test_dashboard_department_counts_and_people_use_active_scoped_grant(
    db_async: AsyncSession,
):
    actor, _, home, _, _, grant, _, _, _ = await _setup(db_async)
    today = datetime.now(ZoneInfo("America/Grenada")).date()
    colleague = await make_user(db_async)
    await make_employee(db_async, user=colleague, department_id=home.id)
    db_async.add(
        ShiftCatalog(code="SYN", label="Synthetic", category=ShiftCategory.WORK)
    )
    period = RosterPeriod(
        department_id=home.id,
        period_start=today,
        period_end=today,
        status=RosterPeriodStatus.PUBLISHED,
        created_by_user_id=actor.id,
    )
    db_async.add(period)
    await db_async.flush()
    db_async.add(
        RosterAssignment(
            roster_period_id=period.id,
            user_id=colleague.id,
            assignment_date=today,
            shift_code="SYN",
        )
    )
    await db_async.commit()
    dashboard = await dashboard_service.read_dashboard(
        session=db_async, current_user=actor
    )
    assert dashboard.active_staff == 3 and len(dashboard.on_duty) == 1
    grant.organisation_id = "other"
    await db_async.commit()
    dashboard = await dashboard_service.read_dashboard(
        session=db_async, current_user=actor
    )
    assert dashboard.scope == "Your records"
    assert dashboard.active_staff == 1 and dashboard.on_duty == []
    grant.organisation_id = "gaa"
    grant.effective_to = utc_now() - timedelta(seconds=1)
    await db_async.commit()
    dashboard = await dashboard_service.read_dashboard(
        session=db_async, current_user=actor
    )
    assert dashboard.active_staff == 1 and dashboard.on_duty == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("assigned_name", "required_name"),
    [
        ("department-manager", "department-assistant-manager"),
        ("department-assistant-manager", "department-manager"),
    ],
)
async def test_management_role_equivalence_reaches_inbox_and_notifications_with_scope(
    db_async: AsyncSession, assigned_name: str, required_name: str
):
    actor, _, home, away, _, _, _, instances, _ = await _setup(db_async)
    roles = {}
    for name in (assigned_name, required_name):
        role = await db_async.scalar(select(Role).where(Role.name == name))
        if role is None:
            role, _ = await make_role_with_permission(
                db_async,
                "workflow.instance.action",
                "workflow.instance.view",
                role_name=name,
            )
        else:
            await db_async.refresh(role, attribute_names=["permissions"])
            for key in ("workflow.instance.action", "workflow.instance.view"):
                permission = await make_permission(db_async, key)
                if permission not in role.permissions:
                    role.permissions.append(permission)
        roles[name] = role
    grant = await assign_role(
        db_async,
        user=actor,
        role=roles[assigned_name],
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=home.id,
    )
    step = await db_async.scalar(
        select(WorkflowStepInstance).where(
            WorkflowStepInstance.workflow_instance_id == instances[0].id
        )
    )
    assert step is not None
    step.required_role_id = roles[required_name].id
    await db_async.commit()
    rows = await service.list_actionable_instances(session=db_async, current_user=actor)
    assert [row[0].id for row in rows] == [instances[0].id]
    assert actor.id in await notifications.pending_approvers(db_async, instances[0])
    assert actor.id in await notification_service.users_with_roles(
        db_async, [assigned_name], organisation_id="gaa", department_id=home.id
    )
    grant.organisation_id = "other"
    grant.department_id = away.id
    await db_async.commit()
    rows = await service.list_actionable_instances(session=db_async, current_user=actor)
    assert all(row[0].id != instances[0].id for row in rows)

    assert actor.id not in await notifications.pending_approvers(db_async, instances[0])
    assert actor.id not in await notification_service.users_with_roles(
        db_async, [assigned_name], organisation_id="gaa", department_id=home.id
    )
    grant.organisation_id = "gaa"
    grant.department_id = home.id
    grant.effective_to = utc_now() - timedelta(seconds=1)
    await db_async.commit()
    rows = await service.list_actionable_instances(session=db_async, current_user=actor)
    assert all(row[0].id != instances[0].id for row in rows)
    assert actor.id not in await notifications.pending_approvers(db_async, instances[0])
    grant.effective_to = None
    employment = await db_async.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == actor.id)
    )
    assert employment is not None
    employment.status = EmploymentStatus.TERMINATED
    await db_async.commit()
    assert actor.is_active
    assert actor.id not in await notification_service.users_with_roles(
        db_async, [assigned_name], organisation_id="gaa", department_id=home.id
    )
    rows = await service.list_actionable_instances(session=db_async, current_user=actor)
    assert all(row[0].id != instances[0].id for row in rows)


@pytest.mark.asyncio
@pytest.mark.parametrize("placement", ["foreign", "inactive"])
async def test_leave_acting_officer_validation_precedes_preview_and_all_writes(
    db_async: AsyncSession, placement: str
):
    actor, outsider, home, _, _, _, _, instances, _ = await _setup(db_async)
    if placement == "inactive":
        outsider = await make_user(db_async)
        employment = await make_employee(db_async, user=outsider, department_id=home.id)
        employment.status = EmploymentStatus.TERMINATED
        await db_async.commit()
    creator, _ = await make_role_with_permission(db_async, "leave.request.create.self")
    await assign_role(db_async, user=actor, role=creator)
    await make_ready_staff(db_async, actor, home.id)
    payload = LeaveRequestCreate(
        department_id=home.id,
        leave_type="VACATION",
        start_date=date(2026, 10, 1),
        end_date=date(2026, 10, 1),
        days_requested=Decimal("1"),
        as_draft=True,
        requires_acting_appointment=True,
        acting_officer_id=outsider.id,
    )
    for operation in (
        leave_service.create_leave_request,
        leave_service.preview_leave_request_pdf,
    ):
        with pytest.raises(HRValidationError, match="Acting officer"):
            await operation(session=db_async, current_user=actor, payload=payload)
    # Self and unset remain permitted; no new eligibility policy is inferred.
    await leave_service.validate_acting_officer(db_async, home.id, actor.id)
    await leave_service.validate_acting_officer(db_async, home.id, None)
    valid = payload.model_copy(update={"acting_officer_id": None})
    draft = await leave_service.create_leave_request(
        session=db_async, current_user=actor, payload=valid
    )
    with pytest.raises(HRValidationError, match="Acting officer"):
        await leave_service.update_leave_request(
            session=db_async,
            current_user=actor,
            leave_request_id=draft.id,
            payload=payload,
        )
    assert draft.acting_officer_id is None
    # Persisted legacy references must also be rejected at submission/delivery.
    draft.acting_officer_id = outsider.id
    await db_async.commit()
    with pytest.raises(HRValidationError, match="Acting officer"):
        await leave_service.submit_leave_request(
            session=db_async,
            current_user=actor,
            leave_request_id=draft.id,
            payload=LeaveRequestSubmit(),
        )
    instances[0].entity_type = "leave_request"
    instances[0].entity_id = draft.id
    await db_async.commit()
    await notifications._acting_appointment(
        db_async, instances[0], "gaa", {"requester_name": "Synthetic employee"}
    )
    await db_async.flush()
    assert (
        await db_async.scalar(
            select(Notification.id).where(Notification.recipient_user_id == outsider.id)
        )
        is None
    )
    with pytest.raises(HRValidationError, match="Co-approver"):
        await service._create_step_instances_for_workflow(
            session=db_async,
            workflow_instance_id=instances[0].id,
            workflow_template_id=instances[0].workflow_template_id,
            co_approver_user_ids=[outsider.id],
        )


@pytest.mark.asyncio
async def test_requester_transfer_does_not_route_old_workflow_to_new_department(
    db_async,
):
    actor, _, home, _, role, _, _, instances, _ = await _setup(db_async)
    new_department = await make_department(db_async, "gaa-next")
    new_operator = await make_user(db_async)
    await make_employee(db_async, user=new_operator, department_id=new_department.id)
    await assign_role(
        db_async,
        user=new_operator,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=new_department.id,
    )
    requester = await db_async.get(User, instances[0].requested_by_user_id)
    assert requester is not None
    await assign_role(db_async, user=requester, role=role)
    employment = await db_async.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == requester.id)
    )
    assert employment is not None
    employment.department_id = new_department.id
    await db_async.commit()
    assert instances[0].department_id == home.id
    assert not await service.list_actionable_instances(
        session=db_async, current_user=new_operator
    )
    assert new_operator.id not in await notifications.pending_approvers(
        db_async, instances[0]
    )
    with pytest.raises(AppException):
        await service.read_workflow_instance_details(
            session=db_async,
            current_user=new_operator,
            workflow_instance_id=instances[0].id,
        )
    # Existing own history and explicitly organisation-wide authority are retained.
    own_instance, _ = await service.read_workflow_instance_details(
        session=db_async,
        current_user=requester,
        workflow_instance_id=instances[0].id,
    )
    assert own_instance.id == instances[0].id
    assert actor.id in await notifications.pending_approvers(db_async, instances[0])


@pytest.mark.parametrize("active", [True, False])
async def test_named_superuser_override_requires_active_identity_not_employment(
    db_async: AsyncSession, active: bool
):
    _, _, _, _, _, _, _, instances, _ = await _setup(db_async)
    admin = await make_user(db_async, superuser=True)
    admin.is_active = active
    step = await db_async.scalar(
        select(WorkflowStepInstance).where(
            WorkflowStepInstance.workflow_instance_id == instances[0].id
        )
    )
    assert step is not None
    step.required_role_id = None
    step.required_user_id = admin.id
    await db_async.commit()
    assert (
        await service._is_actor_allowed_for_step(
            session=db_async,
            current_user=admin,
            workflow_instance=instances[0],
            workflow_step=step,
        )
    ) is active
    assert (
        admin.id in await notifications.pending_approvers(db_async, instances[0])
    ) is active
    assert (
        await service._named_actor_in_organisation(db_async, admin.id, "gaa")
    ) is active
    assert not await service._named_actor_in_organisation(
        db_async, admin.id, "gaa", allow_superuser=False
    )


@pytest.mark.parametrize("named", [False, True])
async def test_notification_approvers_use_scoped_roles_without_legacy_links(
    db_async: AsyncSession, named: bool
):
    actor, _, _, _, _, grant, _, instances, _ = await _setup(db_async)
    await db_async.execute(delete(UserRoleLink).where(UserRoleLink.user_id == actor.id))
    step = await db_async.scalar(
        select(WorkflowStepInstance).where(
            WorkflowStepInstance.workflow_instance_id == instances[0].id
        )
    )
    assert step is not None
    if named:
        step.required_role_id = None
        step.required_user_id = actor.id
    await db_async.commit()
    await db_async.refresh(actor, attribute_names=["roles"])
    assert actor.roles == []
    assert actor.id in await notifications.pending_approvers(db_async, instances[0])
    # Hydrating effective roles must not create a persistent legacy role grant.
    await db_async.flush()
    assert (
        await db_async.scalar(
            select(UserRoleLink.role_id).where(UserRoleLink.user_id == actor.id)
        )
        is None
    )
    grant.effective_to = utc_now() - timedelta(seconds=1)
    await db_async.commit()
    assert actor.id not in await notifications.pending_approvers(db_async, instances[0])


@pytest.mark.parametrize("revocation", ["expired", "terminated", "revoked"])
async def test_admin_employment_response_projects_live_scoped_target_roles(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    revocation: str,
):
    department = await make_department(db_async, "profile-live-scope")
    target = await make_user(db_async)
    employment = await make_employee(db_async, user=target, department_id=department.id)
    role = await db_async.scalar(select(Role).where(Role.name == "department-manager"))
    if role is None:
        role, _ = await make_role_with_permission(
            db_async,
            "workflow.instance.action",
            "workflow.instance.view",
            role_name="department-manager",
        )
    grant = UserRoleAssignment(
        organisation_id="gaa",
        user_id=target.id,
        role_id=role.id,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=department.id,
    )
    db_async.add(grant)
    await db_async.commit()

    async def update():
        result = await async_client.patch(
            f"/api/v1/hr/employment/{target.id}",
            headers=superuser_token_headers_async,
            json={"employment": {"position": "Synthetic officer"}},
        )
        assert result.status_code == 200, result.text
        return result.json()

    active = await update()
    assert {"name": "department-manager", "scope": "DEPARTMENT"} in active["roles"]
    assert "workflow.instance.action" in active["permissions"]
    assert (
        await db_async.scalar(
            select(UserRoleLink.role_id).where(UserRoleLink.user_id == target.id)
        )
        is None
    )
    # Historical compatibility links must not restore a revoked appointment.
    db_async.add(UserRoleLink(user_id=target.id, role_id=role.id))
    if revocation == "expired":
        grant.effective_to = utc_now() - timedelta(seconds=1)
    elif revocation == "terminated":
        employment.status = EmploymentStatus.TERMINATED
    else:
        await db_async.delete(grant)
    await db_async.commit()
    revoked = await update()
    assert all(item["name"] != "department-manager" for item in revoked["roles"])
    assert "workflow.instance.action" not in revoked["permissions"]
