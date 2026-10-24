"""GMS notifications raised by the CAP lifecycle: review requested, warning changed."""

import copy

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import RoleAssignmentScope, User
from src.baseline.models import ApprovalPolicy
from src.cap.schemas import CapAlertAction, CapAlertCreate
from src.cap.service import (
    approve_alert,
    cancel_alert,
    create_alert,
    publish_alert,
    submit_alert,
)
from src.notifications import gms
from src.notifications.models import Notification
from tests.cap.test_cap_state_machine import _VALID_PAYLOAD_DICT
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_user,
)


async def _gms_staff(db: AsyncSession) -> User:
    user = await make_user(db)
    await make_department(db, "gms")
    await make_employee(db, user=user, department_id="gms")
    return user


async def _alert(db: AsyncSession, author: User, *, status: str = "Actual"):
    if await db.get(ApprovalPolicy, "cap") is None:
        db.add(ApprovalPolicy(key="cap", allow_self_approval=True))
        await db.commit()
    payload = copy.deepcopy(_VALID_PAYLOAD_DICT)
    payload["status"] = status
    return await create_alert(
        session=db, current_user=author, payload=CapAlertCreate(**payload)
    )


async def _inbox(db: AsyncSession, user: User, key: str) -> list[Notification]:
    return list(
        (
            await db.execute(
                select(Notification).where(
                    Notification.recipient_user_id == user.id,
                    Notification.event_key == key,
                )
            )
        ).scalars()
    )


async def _publish(db: AsyncSession, author: User, alert_id) -> None:
    await submit_alert(
        session=db, current_user=author, alert_id=alert_id, payload=CapAlertAction()
    )
    await approve_alert(
        session=db, current_user=author, alert_id=alert_id, payload=CapAlertAction()
    )
    await publish_alert(
        session=db, current_user=author, alert_id=alert_id, payload=CapAlertAction()
    )


async def test_publishing_tells_all_gms_staff_but_not_the_publisher(
    db_async: AsyncSession,
) -> None:
    author = await make_user(db_async, superuser=True)
    staff = await _gms_staff(db_async)
    alert = await _alert(db_async, author)

    await _publish(db_async, author, alert.id)

    (told,) = await _inbox(db_async, staff, gms.WARNING_CHANGED)
    assert told.title == "Warning issued: Heavy rain warning"
    assert told.link_path == f"/cap/alerts/{alert.identifier}"
    assert told.in_bell
    assert await _inbox(db_async, author, gms.WARNING_CHANGED) == []


async def test_cancelling_tells_gms_staff_with_the_original_headline(
    db_async: AsyncSession,
) -> None:
    author = await make_user(db_async, superuser=True)
    staff = await _gms_staff(db_async)
    alert = await _alert(db_async, author)
    await _publish(db_async, author, alert.id)

    await cancel_alert(
        session=db_async,
        current_user=author,
        alert_id=alert.id,
        payload=CapAlertAction(note="Threat passed"),
    )

    titles = {n.title for n in await _inbox(db_async, staff, gms.WARNING_CHANGED)}
    assert "Warning cancelled: Heavy rain warning" in titles


async def test_a_test_warning_does_not_notify(db_async: AsyncSession) -> None:
    author = await make_user(db_async, superuser=True)
    staff = await _gms_staff(db_async)
    alert = await _alert(db_async, author, status="Test")

    await _publish(db_async, author, alert.id)

    assert await _inbox(db_async, staff, gms.WARNING_CHANGED) == []


async def test_submitting_asks_approvers_other_than_the_author_to_review(
    db_async: AsyncSession,
) -> None:
    author = await make_user(db_async, superuser=True)
    role, _ = await make_role_with_permission(db_async, "cap.alert.approve")
    approver = await make_user(db_async)
    await assign_role(db_async, user=approver, role=role, scope=RoleAssignmentScope.ALL)
    alert = await _alert(db_async, author)

    await submit_alert(
        session=db_async,
        current_user=author,
        alert_id=alert.id,
        payload=CapAlertAction(),
    )

    (asked,) = await _inbox(db_async, approver, gms.REVIEW_REQUESTED)
    assert "Heavy rain warning" in asked.title
    assert await _inbox(db_async, author, gms.REVIEW_REQUESTED) == []
