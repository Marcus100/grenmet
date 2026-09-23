"""Notifications: workflow events, preferences, settings, email outbox, sweeps."""

from datetime import date, timedelta
from decimal import Decimal

import httpx
import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import Role, RoleAssignmentScope, User
from src.config import settings
from src.email_config import email_settings
from src.exceptions import AppException
from src.hr import notifications as hr_notifications
from src.hr.leave.schemas import LeaveRequestCreate
from src.hr.leave.service import create_leave_request
from src.hr.models import EmploymentRecord
from src.hr.training.models import TrainingRecord
from src.hr.workflow.models import (
    ApprovalActionLog,
    WorkflowAction,
    WorkflowStepTemplate,
    WorkflowTemplate,
    WorkflowType,
)
from src.hr.workflow.schemas import WorkflowActionRequest
from src.hr.workflow.service import apply_workflow_action
from src.notifications import dispatch
from src.notifications import service as notification_service
from src.notifications.config import notification_settings
from src.notifications.models import (
    DeliveryStatus,
    Notification,
    NotificationDelivery,
    NotificationSetting,
)
from src.notifications.schemas import (
    NotificationParams,
    NotificationPreferenceUpdate,
    NotificationSettingUpdate,
)
from src.utils.datetime import utc_now
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_ready_staff,
    make_role_with_permission,
    make_user,
)


async def _hr_admin_role(db: AsyncSession) -> Role:
    role = await db.scalar(select(Role).where(Role.name == "hr-admin"))
    if role is None:
        role, _ = await make_role_with_permission(
            db, "workflow.instance.view", role_name="hr-admin"
        )
    return role


async def _leave_setup(db: AsyncSession, department_id: str):
    """Requester, a department approver, and an organisation-wide HR admin."""
    dept = await make_department(db, department_id)
    approver_role, _ = await make_role_with_permission(
        db, "workflow.instance.action", "workflow.instance.view"
    )
    template = WorkflowTemplate(
        department_id=dept.id,
        workflow_type=WorkflowType.LEAVE_REQUEST,
        name="Leave approval",
    )
    db.add(template)
    await db.flush()
    db.add(
        WorkflowStepTemplate(
            workflow_template_id=template.id,
            step_order=1,
            required_role_id=approver_role.id,
            label="Supervisor",
        )
    )
    await db.commit()

    requester = await make_user(db)
    create_role, _ = await make_role_with_permission(db, "leave.request.create.self")
    await assign_role(db, user=requester, role=create_role)
    await make_ready_staff(db, requester, dept.id)

    approver = await make_user(db)
    await make_employee(db, user=approver, department_id=dept.id)
    await assign_role(
        db,
        user=approver,
        role=approver_role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=dept.id,
    )
    hr_admin = await make_user(db)
    await assign_role(
        db, user=hr_admin, role=await _hr_admin_role(db), scope=RoleAssignmentScope.ALL
    )
    return dept, requester, approver, hr_admin


async def _submit_leave(db: AsyncSession, requester: User, department_id: str):
    return await create_leave_request(
        session=db,
        current_user=requester,
        payload=LeaveRequestCreate(
            department_id=department_id,
            leave_type="VACATION",
            start_date="2026-10-12",
            end_date="2026-10-16",
            days_requested=Decimal("5.0"),
            reason="Family matter that must not be emailed",
        ),
    )


async def _inbox(db: AsyncSession, user: User) -> list[Notification]:
    rows = await db.execute(
        select(Notification).where(Notification.recipient_user_id == user.id)
    )
    return list(rows.scalars().all())


async def _deliveries(
    db: AsyncSession, notification: Notification
) -> list[NotificationDelivery]:
    rows = await db.execute(
        select(NotificationDelivery).where(
            NotificationDelivery.notification_id == notification.id
        )
    )
    return list(rows.scalars().all())


async def test_submit_notifies_approver_not_requester(db_async: AsyncSession) -> None:
    dept, requester, approver, _ = await _leave_setup(db_async, "dept_ntf_submit")
    await _submit_leave(db_async, requester, dept.id)

    [waiting] = await _inbox(db_async, approver)
    assert waiting.event_key == "workflow.step_awaiting"
    assert waiting.title == "Leave request waiting for your approval"
    assert "12 Oct 2026 to 16 Oct 2026" in waiting.body
    assert "Family matter" not in waiting.body  # reasons never leave the portal
    assert waiting.link_path == "/hr/approvals"
    assert len(await _deliveries(db_async, waiting)) == 1
    assert await _inbox(db_async, requester) == []


async def test_final_approval_notifies_requester_and_hr(db_async: AsyncSession) -> None:
    dept, requester, approver, hr_admin = await _leave_setup(db_async, "dept_ntf_ok")
    leave = await _submit_leave(db_async, requester, dept.id)

    await apply_workflow_action(
        session=db_async,
        current_user=approver,
        workflow_instance_id=leave.workflow_instance_id,
        action_in=WorkflowActionRequest(action=WorkflowAction.APPROVE),
    )

    [approved] = await _inbox(db_async, requester)
    assert approved.event_key == "workflow.approved"
    assert approved.title == "Your leave request was approved"
    assert approved.link_path == "/hr/leave"
    hr_events = {n.event_key for n in await _inbox(db_async, hr_admin)}
    assert "workflow.final_approved_hr" in hr_events
    # The approver caused the event and is not told about their own action.
    assert {n.event_key for n in await _inbox(db_async, approver)} == {
        "workflow.step_awaiting"
    }


async def test_rejection_and_return_notify_requester(db_async: AsyncSession) -> None:
    dept, requester, approver, _ = await _leave_setup(db_async, "dept_ntf_reject")
    leave = await _submit_leave(db_async, requester, dept.id)
    await apply_workflow_action(
        session=db_async,
        current_user=approver,
        workflow_instance_id=leave.workflow_instance_id,
        action_in=WorkflowActionRequest(action=WorkflowAction.RETURN),
    )
    assert [n.event_key for n in await _inbox(db_async, requester)] == [
        "workflow.returned"
    ]


async def test_muted_email_keeps_in_app(db_async: AsyncSession) -> None:
    dept, requester, approver, _ = await _leave_setup(db_async, "dept_ntf_mute")
    await notification_service.update_preferences(
        session=db_async,
        user=requester,
        payload=[
            NotificationPreferenceUpdate(
                event_key="workflow.approved", email_enabled=False
            )
        ],
    )
    leave = await _submit_leave(db_async, requester, dept.id)
    await apply_workflow_action(
        session=db_async,
        current_user=approver,
        workflow_instance_id=leave.workflow_instance_id,
        action_in=WorkflowActionRequest(action=WorkflowAction.APPROVE),
    )
    [approved] = await _inbox(db_async, requester)
    assert await _deliveries(db_async, approved) == []


async def test_approval_emails_cannot_be_muted(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    with pytest.raises(AppException):
        await notification_service.update_preferences(
            session=db_async,
            user=user,
            payload=[
                NotificationPreferenceUpdate(
                    event_key="workflow.step_awaiting", email_enabled=False
                )
            ],
        )


async def test_disabled_event_creates_nothing(db_async: AsyncSession) -> None:
    dept, requester, approver, _ = await _leave_setup(db_async, "dept_ntf_off")
    db_async.add(
        NotificationSetting(
            organisation_id="gaa",
            event_key="workflow.step_awaiting",
            enabled=False,
            recipient_roles=[],
            params={},
        )
    )
    await db_async.commit()
    await _submit_leave(db_async, requester, dept.id)
    assert await _inbox(db_async, approver) == []


async def test_settings_validate_and_apply_custom_wording(
    db_async: AsyncSession,
) -> None:
    dept, requester, approver, _ = await _leave_setup(db_async, "dept_ntf_words")
    admin = await make_user(db_async, superuser=True)
    with pytest.raises(AppException):
        await notification_service.update_setting(
            session=db_async,
            actor=admin,
            organisation_id="gaa",
            event_key="workflow.step_awaiting",
            payload=NotificationSettingUpdate(
                enabled=True, email_enabled=True, title_template="{{ broken "
            ),
        )
    saved = await notification_service.update_setting(
        session=db_async,
        actor=admin,
        organisation_id="gaa",
        event_key="workflow.step_awaiting",
        payload=NotificationSettingUpdate(
            enabled=True,
            email_enabled=True,
            title_template="Please approve: {{ requester_name }}",
        ),
    )
    assert saved.customised is True
    await _submit_leave(db_async, requester, dept.id)
    [waiting] = await _inbox(db_async, approver)
    assert waiting.title == f"Please approve: {requester.full_name}"


async def test_settings_require_manage_permission(db_async: AsyncSession) -> None:
    await make_department(db_async, "dept_ntf_perm")
    user = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "workflow.instance.view")
    await assign_role(db_async, user=user, role=role, scope=RoleAssignmentScope.ALL)
    with pytest.raises(AppException):
        await notification_service.read_settings(
            session=db_async, actor=user, organisation_id="gaa"
        )


# ── Email outbox ──────────────────────────────────────────────────────────────


@pytest.fixture
def email_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", "noreply@barrels.gd")
    monkeypatch.setattr(email_settings, "SMTP_HOST", "mailpit")
    monkeypatch.setattr(email_settings, "EMAIL_RENDER_URL", None)
    monkeypatch.setattr(
        notification_settings, "NOTIFICATIONS_EMAIL_ALLOWED_DOMAINS", ""
    )


async def _queued(db: AsyncSession, user: User) -> NotificationDelivery:
    await notification_service.notify(
        db,
        event_key="workflow.approved",
        organisation_id="gaa",
        recipients=(user.id,),
        context={"request_type": "Leave request", "summary": "12 Oct <b>x</b>"},
        link_path="/hr/leave",
    )
    await db.commit()
    [notification] = await _inbox(db, user)
    [delivery] = await _deliveries(db, notification)
    return delivery


@pytest.mark.usefixtures("email_on")
async def test_dispatch_sends_escaped_email_with_link(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    delivery = await _queued(db_async, user)
    sent: list[dict[str, str]] = []

    handled = await dispatch.process_due_deliveries(
        session=db_async, sender=lambda **kwargs: sent.append(kwargs)
    )

    assert handled == 1
    assert sent[0]["email_to"] == user.email
    assert sent[0]["subject"] == "Your leave request was approved"
    assert "/hr/leave" in sent[0]["html_content"]
    assert "&lt;b&gt;x&lt;/b&gt;" in sent[0]["html_content"]
    await db_async.refresh(delivery)
    assert delivery.status == DeliveryStatus.SENT.value
    assert (
        await dispatch.process_due_deliveries(session=db_async, sender=sent.append) == 0
    )


@pytest.mark.usefixtures("email_on")
async def test_dispatch_skips_disallowed_domain(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(
        notification_settings, "NOTIFICATIONS_EMAIL_ALLOWED_DOMAINS", "barrels.gd"
    )
    user = await make_user(db_async, email="someone@example.com")
    delivery = await _queued(db_async, user)
    sent: list[object] = []
    await dispatch.process_due_deliveries(session=db_async, sender=sent.append)
    await db_async.refresh(delivery)
    assert sent == []
    assert delivery.status == DeliveryStatus.SKIPPED.value
    assert "domain" in (delivery.last_error or "")


@pytest.mark.usefixtures("email_on")
async def test_dispatch_failure_backs_off(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    delivery = await _queued(db_async, user)

    def boom(**_kwargs: object) -> None:
        raise RuntimeError("provider down")

    await dispatch.process_due_deliveries(session=db_async, sender=boom)
    await db_async.refresh(delivery)
    assert delivery.status == DeliveryStatus.FAILED.value
    assert delivery.attempts == 1
    assert delivery.next_retry_at is not None and delivery.next_retry_at > utc_now()
    # Not due yet: the next run leaves it alone.
    assert await dispatch.process_due_deliveries(session=db_async, sender=boom) == 0


# ── Sweeps ────────────────────────────────────────────────────────────────────


def test_reminder_lead_picks_tightest_window() -> None:
    assert hr_notifications.reminder_lead(40, [30, 7]) is None
    assert hr_notifications.reminder_lead(30, [30, 7]) == 30
    assert hr_notifications.reminder_lead(12, [30, 7]) == 30
    assert hr_notifications.reminder_lead(5, [30, 7]) == 7
    assert hr_notifications.reminder_lead(-1, [30, 7]) is None


async def test_training_expiry_reminds_once(db_async: AsyncSession) -> None:
    dept = await make_department(db_async, "dept_ntf_expiry")
    employee = await make_user(db_async)
    await make_employee(db_async, user=employee, department_id=dept.id)
    db_async.add(
        TrainingRecord(
            organisation_id="gaa",
            department_id=dept.id,
            user_id=employee.id,
            course_name="Fire warden",
            provider="GFD",
            completed_on=date(2024, 1, 1),
            result="completed",
            expires_on=hr_notifications.today() + timedelta(days=5),
            created_by=employee.id,
        )
    )
    await db_async.commit()

    assert await hr_notifications.sweep_training_expiry(db_async) >= 1
    await db_async.commit()
    assert await hr_notifications.sweep_training_expiry(db_async) == 0
    [reminder] = await _inbox(db_async, employee)
    assert reminder.title.startswith("Fire warden expires on")


async def test_overdue_approval_reminds_then_escalates(db_async: AsyncSession) -> None:
    dept, requester, approver, hr_admin = await _leave_setup(db_async, "dept_ntf_late")
    supervisor = await make_user(db_async)
    await db_async.execute(
        update(EmploymentRecord)
        .where(EmploymentRecord.user_id == approver.id)
        .values(supervisor_id=supervisor.id)
    )
    leave = await _submit_leave(db_async, requester, dept.id)
    await db_async.execute(
        update(ApprovalActionLog)
        .where(ApprovalActionLog.workflow_instance_id == leave.workflow_instance_id)
        .values(created_at=utc_now() - timedelta(days=6))
    )
    await db_async.commit()

    await hr_notifications.sweep_overdue_approvals(db_async)
    await db_async.commit()
    assert "workflow.step_overdue" in {
        n.event_key for n in await _inbox(db_async, approver)
    }
    assert [n.event_key for n in await _inbox(db_async, supervisor)] == [
        "workflow.step_escalated"
    ]
    assert "workflow.step_escalated" in {
        n.event_key for n in await _inbox(db_async, hr_admin)
    }
    # Idempotent: a second run the same day adds nothing.
    assert await hr_notifications.sweep_overdue_approvals(db_async) == 0


# ── API ───────────────────────────────────────────────────────────────────────


async def test_inbox_endpoints(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    superuser = await db_async.scalar(
        select(User).where(User.email == str(settings.FIRST_SUPERUSER))
    )
    assert superuser is not None
    await notification_service.notify(
        db_async,
        event_key="roster.published",
        organisation_id="gaa",
        recipients=(superuser.id,),
        context={"department": "Met", "period": "October"},
        link_path="/roster",
    )
    await db_async.commit()

    count = await async_client.get(
        "/api/v1/notifications/unread-count", headers=superuser_token_headers_async
    )
    assert count.json() == {"count": 1}
    inbox = await async_client.get(
        "/api/v1/notifications", headers=superuser_token_headers_async
    )
    [item] = inbox.json()["data"]
    assert item["title"] == "Met roster published"
    read = await async_client.post(
        f"/api/v1/notifications/{item['id']}/read",
        headers=superuser_token_headers_async,
    )
    assert read.status_code == 200 and read.json()["read_at"] is not None
    count = await async_client.get(
        "/api/v1/notifications/unread-count", headers=superuser_token_headers_async
    )
    assert count.json() == {"count": 0}

    prefs = await async_client.get(
        "/api/v1/notifications/preferences", headers=superuser_token_headers_async
    )
    assert any(
        p["event_key"] == "workflow.step_awaiting" and not p["email_mutable"]
        for p in prefs.json()
    )

    settings_response = await async_client.get(
        "/api/v1/notifications/settings?organisation_id=gaa",
        headers=superuser_token_headers_async,
    )
    assert settings_response.status_code == 200
    overdue = next(
        e
        for e in settings_response.json()["events"]
        if e["event_key"] == "workflow.step_overdue"
    )
    assert overdue["params"]["remind_after_days"] == 2


async def test_other_users_notification_is_not_found(db_async: AsyncSession) -> None:
    owner = await make_user(db_async)
    other = await make_user(db_async)
    await notification_service.notify(
        db_async,
        event_key="roster.published",
        organisation_id="gaa",
        recipients=(owner.id,),
        context={"department": "Met", "period": "October"},
    )
    await db_async.commit()
    [notification] = await _inbox(db_async, owner)
    with pytest.raises(AppException):
        await notification_service.mark_read(
            session=db_async, user=other, notification_id=notification.id
        )


def test_params_model_rejects_out_of_range() -> None:
    with pytest.raises(ValueError):
        NotificationParams(remind_after_days=0)
