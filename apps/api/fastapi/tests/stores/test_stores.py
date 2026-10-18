"""Stores domain: lifecycle, permissions, department scope and stock invariants."""

import uuid
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth.models import RoleAssignmentScope, User
from src.auth.permissions import DEFAULT_ROLES
from src.auth.utils import create_access_token
from src.stores.models import StockLevel, StockMovement
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_user,
)

API = "/api/v1/stores"


def auth(user: User) -> dict[str, str]:
    token = create_access_token(user.id, timedelta(minutes=15))
    return {"Authorization": f"Bearer {token}"}


async def staff(
    db: AsyncSession,
    department_id: str,
    *keys: str,
    scope: RoleAssignmentScope = RoleAssignmentScope.DEPARTMENT,
) -> User:
    await make_department(db, department_id)
    user = await make_user(db)
    await make_employee(db, user=user, department_id=department_id)
    if keys:
        role, _ = await make_role_with_permission(db, *keys)
        await assign_role(
            db,
            user=user,
            role=role,
            scope=scope,
            department_id=department_id
            if scope == RoleAssignmentScope.DEPARTMENT
            else None,
        )
    return user


async def keeper(db: AsyncSession, department_id: str = "dept_ops") -> User:
    return await staff(
        db,
        department_id,
        "stores.view",
        "stores.manage",
        scope=RoleAssignmentScope.ALL,
    )


async def stocked_item(
    client: httpx.AsyncClient,
    storekeeper: User,
    *,
    sku: str = "PEN-1",
    quantity: int = 50,
    location_id: str | None = None,
) -> tuple[str, str]:
    headers = auth(storekeeper)
    if location_id is None:
        location = await client.post(
            f"{API}/locations",
            headers=headers,
            json={"code": f"MAIN-{uuid.uuid4().hex[:6]}", "name": "Main store"},
        )
        assert location.status_code == 201, location.text
        location_id = location.json()["id"]
    item = await client.post(
        f"{API}/items",
        headers=headers,
        json={
            "sku": sku,
            "name": f"Item {sku}",
            "category": "Stationery",
            "unit": "box",
        },
    )
    assert item.status_code == 201, item.text
    item_id = item.json()["id"]
    if quantity:
        receipt = await client.post(
            f"{API}/stock-movements",
            headers=headers,
            json={
                "item_id": item_id,
                "location_id": location_id,
                "kind": "RECEIPT",
                "quantity": quantity,
            },
        )
        assert receipt.status_code == 201, receipt.text
    return item_id, location_id


async def submitted(
    client: httpx.AsyncClient, requester: User, item_id: str, quantity: int = 10
) -> dict:
    response = await client.post(
        f"{API}/requisitions",
        headers=auth(requester),
        json={
            "purpose": "Office use",
            "lines": [{"item_id": item_id, "quantity": quantity}],
            "submit": True,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


async def level(db: AsyncSession, item_id: str, location_id: str) -> int:
    quantity = await db.scalar(
        select(StockLevel.quantity).where(
            StockLevel.item_id == uuid.UUID(item_id),
            StockLevel.location_id == uuid.UUID(location_id),
        )
    )
    return quantity or 0


async def test_full_lifecycle_decrements_stock(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    store = await keeper(db_async)
    item_id, location_id = await stocked_item(async_client, store)
    requester = await staff(db_async, "dept_a", "stores.view", "stores.request")
    approver = await staff(db_async, "dept_a", "stores.view", "stores.approve")

    created = await submitted(async_client, requester, item_id, 10)
    assert created["status"] == "SUBMITTED"
    assert created["reference"].startswith("REQ-")
    assert created["department_id"] == "dept_a"
    assert created["can_cancel"] is True

    approved = await async_client.post(
        f"{API}/requisitions/{created['id']}/approve",
        headers=auth(approver),
        json={"note": "ok"},
    )
    assert approved.status_code == 200, approved.text
    assert approved.json()["status"] == "APPROVED"
    line = approved.json()["lines"][0]
    assert line["approved_quantity"] == 10

    delivered = await async_client.post(
        f"{API}/requisitions/{created['id']}/deliver",
        headers=auth(store),
        json={
            "location_id": location_id,
            "lines": [{"line_id": line["id"], "quantity": 10}],
        },
    )
    assert delivered.status_code == 200, delivered.text
    assert delivered.json()["status"] == "DELIVERED"
    assert delivered.json()["lines"][0]["delivered_quantity"] == 10
    assert await level(db_async, item_id, location_id) == 40

    movements = await async_client.get(
        f"{API}/stock-movements",
        headers=auth(store),
        params={"requisition_id": created["id"]},
    )
    assert movements.json()["count"] == 1
    assert movements.json()["data"][0]["quantity_delta"] == -10
    assert movements.json()["data"][0]["balance_after"] == 40

    items = await async_client.get(f"{API}/items", headers=auth(requester))
    assert items.json()["data"][0]["on_hand"] == 40

    mine = await async_client.get(
        f"{API}/requisitions", headers=auth(requester), params={"status": "DELIVERED"}
    )
    assert mine.json()["count"] == 1


async def test_partial_delivery_and_reduced_approval(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    store = await keeper(db_async)
    item_id, location_id = await stocked_item(async_client, store, quantity=100)
    requester = await staff(db_async, "dept_a", "stores.view", "stores.request")
    approver = await staff(db_async, "dept_a", "stores.view", "stores.approve")
    created = await submitted(async_client, requester, item_id, 20)
    line_id = created["lines"][0]["id"]

    too_many = await async_client.post(
        f"{API}/requisitions/{created['id']}/approve",
        headers=auth(approver),
        json={"lines": [{"line_id": line_id, "approved_quantity": 21}]},
    )
    assert too_many.status_code == 422

    approved = await async_client.post(
        f"{API}/requisitions/{created['id']}/approve",
        headers=auth(approver),
        json={"lines": [{"line_id": line_id, "approved_quantity": 10}]},
    )
    assert approved.json()["lines"][0]["approved_quantity"] == 10

    def deliver(quantity: int):
        return async_client.post(
            f"{API}/requisitions/{created['id']}/deliver",
            headers=auth(store),
            json={
                "location_id": location_id,
                "lines": [{"line_id": line_id, "quantity": quantity}],
            },
        )

    first = await deliver(4)
    assert first.json()["status"] == "PARTIALLY_DELIVERED"
    assert first.json()["can_deliver"] is True
    assert await level(db_async, item_id, location_id) == 96

    over = await deliver(7)
    assert over.status_code == 422
    assert await level(db_async, item_id, location_id) == 96

    last = await deliver(6)
    assert last.json()["status"] == "DELIVERED"
    assert last.json()["can_deliver"] is False
    assert await level(db_async, item_id, location_id) == 90

    again = await deliver(1)
    assert again.status_code == 409


async def test_requester_cannot_decide_own_requisition(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    store = await keeper(db_async)
    item_id, _ = await stocked_item(async_client, store)
    both = await staff(
        db_async, "dept_a", "stores.view", "stores.request", "stores.approve"
    )
    created = await submitted(async_client, both, item_id)
    assert created["can_approve"] is False

    approve = await async_client.post(
        f"{API}/requisitions/{created['id']}/approve", headers=auth(both), json={}
    )
    assert approve.status_code == 403
    reject = await async_client.post(
        f"{API}/requisitions/{created['id']}/reject",
        headers=auth(both),
        json={"note": "no"},
    )
    assert reject.status_code == 403


async def test_cross_department_isolation(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    store = await keeper(db_async)
    item_id, location_id = await stocked_item(async_client, store)
    requester_a = await staff(db_async, "dept_a", "stores.view", "stores.request")
    approver_b = await staff(db_async, "dept_b", "stores.view", "stores.approve")
    other_b = await staff(db_async, "dept_b", "stores.view", "stores.request")
    created = await submitted(async_client, requester_a, item_id)
    url = f"{API}/requisitions/{created['id']}"

    for outsider in (approver_b, other_b):
        assert (await async_client.get(url, headers=auth(outsider))).status_code == 404
    assert (
        await async_client.post(f"{url}/approve", headers=auth(approver_b), json={})
    ).status_code == 404
    listed = await async_client.get(f"{API}/requisitions", headers=auth(approver_b))
    assert listed.json()["count"] == 0

    # Right permission, wrong department scope: approval authority is per department.
    approver_a = await staff(db_async, "dept_a", "stores.view", "stores.approve")
    seen = await async_client.get(url, headers=auth(approver_a))
    assert seen.status_code == 200 and seen.json()["can_approve"] is True
    await async_client.post(f"{url}/approve", headers=auth(approver_a), json={})

    # A storekeeper scoped to dept_b cannot deliver dept_a's requisition.
    keeper_b = await staff(db_async, "dept_b", "stores.view", "stores.manage")
    deliver = await async_client.post(
        f"{url}/deliver",
        headers=auth(keeper_b),
        json={
            "location_id": location_id,
            "lines": [{"line_id": created["lines"][0]["id"], "quantity": 1}],
        },
    )
    assert deliver.status_code == 404


async def test_requester_cannot_deliver_or_manage(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    store = await keeper(db_async)
    item_id, location_id = await stocked_item(async_client, store)
    requester = await staff(db_async, "dept_a", "stores.view", "stores.request")
    approver = await staff(db_async, "dept_a", "stores.view", "stores.approve")
    created = await submitted(async_client, requester, item_id)
    await async_client.post(
        f"{API}/requisitions/{created['id']}/approve", headers=auth(approver), json={}
    )
    line_id = created["lines"][0]["id"]
    deliver = await async_client.post(
        f"{API}/requisitions/{created['id']}/deliver",
        headers=auth(requester),
        json={
            "location_id": location_id,
            "lines": [{"line_id": line_id, "quantity": 1}],
        },
    )
    assert deliver.status_code == 403
    for path, body in (
        ("items", {"sku": "X", "name": "X", "category": "C", "unit": "ea"}),
        ("locations", {"code": "L", "name": "L"}),
        (
            "stock-movements",
            {
                "item_id": item_id,
                "location_id": location_id,
                "kind": "RECEIPT",
                "quantity": 5,
            },
        ),
    ):
        response = await async_client.post(
            f"{API}/{path}", headers=auth(requester), json=body
        )
        assert response.status_code == 403, path


async def test_department_scoped_manager_cannot_change_org_stock(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    store = await keeper(db_async)
    item_id, location_id = await stocked_item(async_client, store)
    await make_department(db_async, "dept_other")
    dept_manager = await staff(db_async, "dept_a", "stores.view", "stores.manage")
    response = await async_client.post(
        f"{API}/stock-movements",
        headers=auth(dept_manager),
        json={
            "item_id": item_id,
            "location_id": location_id,
            "kind": "RECEIPT",
            "quantity": 5,
        },
    )
    assert response.status_code == 403
    access = await async_client.get(f"{API}/access", headers=auth(dept_manager))
    assert access.json()["can_manage"] is False


async def test_permissions_and_employment_are_required(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    store = await keeper(db_async)
    item_id, _ = await stocked_item(async_client, store)
    viewer = await staff(db_async, "dept_a", "stores.view")
    body = {"lines": [{"item_id": item_id, "quantity": 1}]}
    denied = await async_client.post(
        f"{API}/requisitions", headers=auth(viewer), json=body
    )
    assert denied.status_code == 403

    no_permission = await staff(db_async, "dept_a")
    assert (
        await async_client.get(f"{API}/items", headers=auth(no_permission))
    ).status_code == 403

    drifter = await make_user(db_async)
    assert (
        await async_client.get(f"{API}/access", headers=auth(drifter))
    ).status_code == 403
    assert (await async_client.get(f"{API}/items")).status_code == 401


async def test_stock_never_negative_and_failed_delivery_changes_nothing(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    store = await keeper(db_async)
    item_id, location_id = await stocked_item(async_client, store, quantity=5)
    headers = auth(store)

    issue = await async_client.post(
        f"{API}/stock-movements",
        headers=headers,
        json={
            "item_id": item_id,
            "location_id": location_id,
            "kind": "ISSUE",
            "quantity": 6,
            "reason": "Lost",
        },
    )
    assert issue.status_code == 409

    requester = await staff(db_async, "dept_a", "stores.view", "stores.request")
    approver = await staff(db_async, "dept_a", "stores.view", "stores.approve")
    created = await submitted(async_client, requester, item_id, 8)
    await async_client.post(
        f"{API}/requisitions/{created['id']}/approve", headers=auth(approver), json={}
    )
    short = await async_client.post(
        f"{API}/requisitions/{created['id']}/deliver",
        headers=headers,
        json={
            "location_id": location_id,
            "lines": [{"line_id": created["lines"][0]["id"], "quantity": 8}],
        },
    )
    assert short.status_code == 409
    assert await level(db_async, item_id, location_id) == 5
    again = await async_client.get(
        f"{API}/requisitions/{created['id']}", headers=headers
    )
    assert again.json()["status"] == "APPROVED"
    assert again.json()["lines"][0]["delivered_quantity"] == 0
    count = await db_async.scalar(
        select(func.count())
        .select_from(StockMovement)
        .where(StockMovement.requisition_id == uuid.UUID(created["id"]))
    )
    assert count == 0


async def test_adjustment_needs_reason_sets_level_and_is_audited(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    store = await keeper(db_async)
    item_id, location_id = await stocked_item(async_client, store, quantity=20)
    headers = auth(store)
    payload = {
        "item_id": item_id,
        "location_id": location_id,
        "kind": "ADJUSTMENT",
        "quantity": 17,
    }
    assert (
        await async_client.post(f"{API}/stock-movements", headers=headers, json=payload)
    ).status_code == 422
    adjusted = await async_client.post(
        f"{API}/stock-movements",
        headers=headers,
        json={**payload, "reason": "Stock count"},
    )
    assert adjusted.status_code == 201, adjusted.text
    assert adjusted.json()["quantity_delta"] == -3
    assert adjusted.json()["balance_after"] == 17
    assert await level(db_async, item_id, location_id) == 17

    same = await async_client.post(
        f"{API}/stock-movements",
        headers=headers,
        json={**payload, "quantity": 17, "reason": "x"},
    )
    assert same.status_code == 422

    audited = await db_async.scalars(
        select(AuditEntry).where(
            AuditEntry.record_type.in_(["stock_movement", "stock_level"]),
            AuditEntry.entity_id == item_id,
            AuditEntry.actor_user_id == store.id,
        )
    )
    kinds = {entry.record_type for entry in audited.all()}
    assert kinds == {"stock_movement", "stock_level"}
    history = await async_client.get(
        f"/api/v1/audit/stores_item/{item_id}", headers=headers
    )
    assert history.status_code == 200 and history.json()["count"] >= 3


async def test_draft_edit_submit_cancel_and_reject(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    store = await keeper(db_async)
    item_id, _ = await stocked_item(async_client, store)
    item2, _ = await stocked_item(async_client, store, sku="PEN-2", quantity=0)
    requester = await staff(db_async, "dept_a", "stores.view", "stores.request")
    approver = await staff(db_async, "dept_a", "stores.view", "stores.approve")
    headers = auth(requester)

    draft = await async_client.post(
        f"{API}/requisitions",
        headers=headers,
        json={"lines": [{"item_id": item_id, "quantity": 2}]},
    )
    assert draft.status_code == 201 and draft.json()["status"] == "DRAFT"
    rid = draft.json()["id"]
    # Drafts are private to the requester until submitted.
    assert (
        await async_client.get(f"{API}/requisitions/{rid}", headers=auth(approver))
    ).status_code == 404

    dup = await async_client.patch(
        f"{API}/requisitions/{rid}",
        headers=headers,
        json={"lines": [{"item_id": item_id, "quantity": 1}] * 2},
    )
    assert dup.status_code == 422
    edited = await async_client.patch(
        f"{API}/requisitions/{rid}",
        headers=headers,
        json={
            "purpose": "Revised",
            "lines": [
                {"item_id": item_id, "quantity": 3},
                {"item_id": item2, "quantity": 1},
            ],
        },
    )
    assert edited.status_code == 200, edited.text
    assert [line["requested_quantity"] for line in edited.json()["lines"]] == [3, 1]

    sub = await async_client.post(f"{API}/requisitions/{rid}/submit", headers=headers)
    assert sub.json()["status"] == "SUBMITTED"
    assert (
        await async_client.patch(
            f"{API}/requisitions/{rid}",
            headers=headers,
            json={"lines": [{"item_id": item_id, "quantity": 1}]},
        )
    ).status_code == 409

    blank = await async_client.post(
        f"{API}/requisitions/{rid}/reject", headers=auth(approver), json={"note": " "}
    )
    assert blank.status_code == 422
    rejected = await async_client.post(
        f"{API}/requisitions/{rid}/reject",
        headers=auth(approver),
        json={"note": "Over budget"},
    )
    assert rejected.json()["status"] == "REJECTED"
    assert rejected.json()["decision_note"] == "Over budget"
    assert (
        await async_client.post(f"{API}/requisitions/{rid}/cancel", headers=headers)
    ).status_code == 409

    second = await submitted(async_client, requester, item_id, 1)
    cancelled = await async_client.post(
        f"{API}/requisitions/{second['id']}/cancel", headers=headers
    )
    assert cancelled.json()["status"] == "CANCELLED"


async def test_catalogue_rules(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    store = await keeper(db_async)
    item_id, _ = await stocked_item(async_client, store)
    headers = auth(store)
    duplicate = await async_client.post(
        f"{API}/items",
        headers=headers,
        json={"sku": "pen-1", "name": "Again", "category": "C", "unit": "ea"},
    )
    assert duplicate.status_code == 409

    retired = await async_client.patch(
        f"{API}/items/{item_id}", headers=headers, json={"is_active": False}
    )
    assert retired.json()["is_active"] is False
    requester = await staff(db_async, "dept_a", "stores.view", "stores.request")
    blocked = await async_client.post(
        f"{API}/requisitions",
        headers=auth(requester),
        json={"lines": [{"item_id": item_id, "quantity": 1}]},
    )
    assert blocked.status_code == 422

    foreign = await async_client.patch(
        f"{API}/items/{uuid.uuid4()}", headers=headers, json={"name": "Ghost"}
    )
    assert foreign.status_code == 404


def test_stores_roles_are_seeded_with_least_privilege() -> None:
    assert DEFAULT_ROLES["stores-requester"][1] == ("stores.view", "stores.request")
    assert "stores.approve" in DEFAULT_ROLES["stores-approver"][1]
    assert "stores.manage" not in DEFAULT_ROLES["stores-approver"][1]
    assert "stores.approve" not in DEFAULT_ROLES["stores-keeper"][1]
    assert "stores.manage" not in DEFAULT_ROLES["stores-requester"][1]


@pytest.mark.parametrize("path", ["items", "locations", "stock", "requisitions"])
async def test_list_endpoints_require_authentication(
    async_client: httpx.AsyncClient, path: str
) -> None:
    assert (await async_client.get(f"{API}/{path}")).status_code == 401
