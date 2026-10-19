"""Stores notifications: recipients, dedupe, opt-outs and transactional behaviour."""

import uuid

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import Role, RoleAssignmentScope, User
from src.notifications.models import Notification, NotificationDelivery
from src.stores import notifications
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_user,
)
from tests.stores.test_stores import (
    API,
    auth,
    keeper,
    staff,
    stocked_item,
    submitted,
)


async def approver_with_role(db: AsyncSession, department_id: str) -> User:
    """A department approver who holds the seeded ``stores-approver`` role by name."""
    await make_department(db, department_id)
    user = await make_user(db)
    await make_employee(db, user=user, department_id=department_id)
    role = await db.scalar(select(Role).where(Role.name == "stores-approver"))
    if role is None:
        role, _ = await make_role_with_permission(
            db,
            "stores.view",
            "stores.request",
            "stores.approve",
            role_name="stores-approver",
        )
    await assign_role(
        db,
        user=user,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=department_id,
    )
    return user


async def told(db: AsyncSession, user: User, event_key: str) -> list[Notification]:
    return list(
        (
            await db.scalars(
                select(Notification).where(
                    Notification.recipient_user_id == user.id,
                    Notification.event_key == event_key,
                )
            )
        ).all()
    )


async def test_events_are_registered() -> None:
    from src.notifications import events

    for key in (
        notifications.SUBMITTED,
        notifications.APPROVED,
        notifications.REJECTED,
        notifications.PARTIALLY_DELIVERED,
        notifications.DELIVERED,
    ):
        assert events.get(key).key == key
    assert events.get(notifications.SUBMITTED).default_roles == ("stores-approver",)


async def test_lifecycle_notifies_the_right_people_once(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    store = await keeper(db_async)
    item_id, location_id = await stocked_item(async_client, store)
    requester = await staff(db_async, "dept_n", "stores.view", "stores.request")
    approver = await approver_with_role(db_async, "dept_n")
    other_dept_approver = await approver_with_role(db_async, "dept_other")

    # A draft tells nobody.
    draft = await async_client.post(
        f"{API}/requisitions",
        headers=auth(requester),
        json={"lines": [{"item_id": item_id, "quantity": 5}]},
    )
    rid = draft.json()["id"]
    assert await told(db_async, approver, notifications.SUBMITTED) == []

    sub = await async_client.post(
        f"{API}/requisitions/{rid}/submit", headers=auth(requester)
    )
    assert sub.status_code == 200, sub.text
    waiting = await told(db_async, approver, notifications.SUBMITTED)
    assert len(waiting) == 1
    assert waiting[0].entity_id == rid
    assert "REQ-" in waiting[0].title
    assert await told(db_async, requester, notifications.SUBMITTED) == []
    assert await told(db_async, other_dept_approver, notifications.SUBMITTED) == []

    # Submitting again is refused and does not notify twice.
    again = await async_client.post(
        f"{API}/requisitions/{rid}/submit", headers=auth(requester)
    )
    assert again.status_code == 409
    assert len(await told(db_async, approver, notifications.SUBMITTED)) == 1

    approved = await async_client.post(
        f"{API}/requisitions/{rid}/approve",
        headers=auth(approver),
        json={"note": "private reason"},
    )
    assert approved.status_code == 200, approved.text
    approvals = await told(db_async, requester, notifications.APPROVED)
    assert len(approvals) == 1
    assert "private reason" not in approvals[0].title + approvals[0].body
    assert await told(db_async, approver, notifications.APPROVED) == []

    line = approved.json()["lines"][0]

    async def deliver(quantity: int) -> httpx.Response:
        return await async_client.post(
            f"{API}/requisitions/{rid}/deliver",
            headers=auth(store),
            json={
                "location_id": location_id,
                "lines": [{"line_id": line["id"], "quantity": quantity}],
            },
        )

    assert (await deliver(2)).status_code == 200
    assert len(await told(db_async, requester, notifications.PARTIALLY_DELIVERED)) == 1
    assert (await deliver(3)).status_code == 200
    assert len(await told(db_async, requester, notifications.DELIVERED)) == 1
    assert len(await told(db_async, requester, notifications.PARTIALLY_DELIVERED)) == 1


async def test_direct_submit_and_rejection_notify(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    store = await keeper(db_async)
    item_id, _ = await stocked_item(async_client, store)
    requester = await staff(db_async, "dept_r", "stores.view", "stores.request")
    approver = await approver_with_role(db_async, "dept_r")

    created = await submitted(async_client, requester, item_id, 1)
    assert len(await told(db_async, approver, notifications.SUBMITTED)) == 1

    rejected = await async_client.post(
        f"{API}/requisitions/{created['id']}/reject",
        headers=auth(approver),
        json={"note": "Over budget"},
    )
    assert rejected.status_code == 200, rejected.text
    notices = await told(db_async, requester, notifications.REJECTED)
    assert len(notices) == 1
    assert "Over budget" not in notices[0].title + notices[0].body


async def test_delivered_email_respects_opt_out_but_approval_waiting_does_not(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    from src.notifications.models import NotificationPreference

    store = await keeper(db_async)
    item_id, location_id = await stocked_item(async_client, store)
    requester = await staff(db_async, "dept_o", "stores.view", "stores.request")
    approver = await approver_with_role(db_async, "dept_o")
    db_async.add_all(
        [
            NotificationPreference(
                user_id=requester.id,
                event_key=notifications.DELIVERED,
                email_enabled=False,
            ),
            NotificationPreference(
                user_id=approver.id,
                event_key=notifications.SUBMITTED,
                email_enabled=False,
            ),
        ]
    )
    await db_async.commit()

    created = await submitted(async_client, requester, item_id, 1)
    approved = await async_client.post(
        f"{API}/requisitions/{created['id']}/approve",
        headers=auth(approver),
        json={},
    )
    line = approved.json()["lines"][0]
    done = await async_client.post(
        f"{API}/requisitions/{created['id']}/deliver",
        headers=auth(store),
        json={
            "location_id": location_id,
            "lines": [{"line_id": line["id"], "quantity": 1}],
        },
    )
    assert done.status_code == 200, done.text

    async def deliveries(user: User, event_key: str) -> int:
        return (
            await db_async.scalar(
                select(func.count())
                .select_from(NotificationDelivery)
                .join(
                    Notification,
                    Notification.id == NotificationDelivery.notification_id,
                )
                .where(
                    Notification.recipient_user_id == user.id,
                    Notification.event_key == event_key,
                )
            )
            or 0
        )

    # The in-app notification still arrives; only the email is muted.
    assert len(await told(db_async, requester, notifications.DELIVERED)) == 1
    assert await deliveries(requester, notifications.DELIVERED) == 0
    # Approval-waiting emails cannot be muted.
    assert await deliveries(approver, notifications.SUBMITTED) == 1


async def test_unknown_requisition_does_not_notify(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    requester = await staff(db_async, "dept_u", "stores.view", "stores.request")
    missing = await async_client.post(
        f"{API}/requisitions/{uuid.uuid4()}/submit", headers=auth(requester)
    )
    assert missing.status_code == 404
