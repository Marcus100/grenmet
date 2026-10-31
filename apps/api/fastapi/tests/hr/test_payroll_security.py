"""Payroll security review fixes (slice 1): history scope, separation of duty."""

from datetime import date
from types import SimpleNamespace
from typing import Any

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.config import auth_settings
from src.auth.models import RoleAssignmentScope
from src.hr.payroll import export, service
from src.hr.payroll.models import PayPeriod
from src.hr.workflow.models import WorkflowStatus, WorkflowType
from tests.factories import make_user
from tests.hr.payroll_setup import (
    API,
    approval_setup,
    calendar_and_period,
    departments,
    employee_in,
    headers_for,
    lines,
    payroll_user,
    worked_shift,
)

SEPTEMBER = date(2026, 9, 1)


@pytest.fixture
def totp_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )


async def test_department_readers_never_read_payroll_history(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    ops, _, accounts = await departments(db_async)
    admin = await headers_for(db_async, await make_user(db_async, superuser=True))
    _, period_id = await calendar_and_period(
        async_client, admin, accounts.id, SEPTEMBER
    )
    reader = await payroll_user(
        db_async,
        "hr.payroll.read.department",
        "audit.view_sensitive",
        department_id=ops.id,
        scope=RoleAssignmentScope.DEPARTMENT,
        scoped_department=ops.id,
    )
    reader_headers = await headers_for(db_async, reader)
    for path in (
        f"/api/v1/audit/pay_period/{period_id}",
        "/api/v1/audit/payroll_settings/gaa",
    ):
        response = await async_client.get(path, headers=reader_headers)
        assert response.status_code == 403, path
    preparer = await payroll_user(db_async, "hr.payroll.prepare", department_id=ops.id)
    allowed = await async_client.get(
        f"/api/v1/audit/pay_period/{period_id}",
        headers=await headers_for(db_async, preparer),
    )
    assert allowed.status_code == 200, allowed.text


@pytest.mark.usefixtures("totp_keys")
async def test_separation_of_duty_and_hidden_reasons(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    ops, _, accounts = await departments(db_async)
    await approval_setup(db_async, accounts.id)
    employee = await employee_in(db_async, ops)
    await worked_shift(
        db_async,
        employee,
        ops,
        day=date(2026, 9, 8),
        arrive="2026-09-08T08:00:00-04:00",
        depart="2026-09-08T16:00:00-04:00",
    )
    preparer_user = await make_user(db_async, superuser=True)
    preparer = await headers_for(db_async, preparer_user)
    _, period_id = await calendar_and_period(
        async_client, preparer, accounts.id, SEPTEMBER
    )
    response = await async_client.post(
        f"{API}/periods/{period_id}/computation", headers=preparer
    )
    assert response.headers["cache-control"] == "no-store"
    # A second person adds a call-out, then tries to approve the period.
    helper_user = await make_user(db_async, superuser=True)
    helper = await headers_for(db_async, helper_user, mfa=True)
    items = (await async_client.get(f"{API}/items", headers=helper)).json()["data"]
    call_out = next(i for i in items if i["code"] == "CALL_OUT")
    added = await async_client.post(
        f"{API}/periods/{period_id}/lines",
        headers=helper,
        json={
            "user_id": str(employee.id),
            "pay_item_id": call_out["id"],
            "quantity": "1",
            "reason": "Recalled after the shift",
        },
    )
    assert added.status_code == 201, added.text
    own = await async_client.post(
        f"{API}/periods/{period_id}/lines",
        headers=helper,
        json={
            "user_id": str(helper_user.id),
            "pay_item_id": call_out["id"],
            "quantity": "1",
            "reason": "My own call-out",
        },
    )
    assert own.status_code == 403
    own_profile = await async_client.put(
        f"{API}/profiles/{helper_user.id}",
        headers=helper,
        json={"organisation_id": "gaa", "shift_worker": True},
    )
    assert own_profile.status_code == 403
    submitted = await async_client.post(
        f"{API}/periods/{period_id}/submission", headers=preparer
    )
    assert submitted.status_code == 200, submitted.text
    refused = await async_client.post(
        f"{API}/periods/{period_id}/approval", headers=helper, json={}
    )
    assert refused.status_code == 403
    assert "added lines" in refused.json()["detail"]

    reader = await payroll_user(
        db_async,
        "hr.payroll.read.department",
        department_id=ops.id,
        scope=RoleAssignmentScope.DEPARTMENT,
        scoped_department=ops.id,
    )
    rows = await lines(async_client, await headers_for(db_async, reader), period_id)
    manual = [r for r in rows if r["line_kind"] == "MANUAL"]
    assert manual and manual[0]["reason"] is None
    full = await lines(async_client, preparer, period_id)
    assert any(r["reason"] == "Recalled after the shift" for r in full)


async def test_finalize_only_moves_a_period_in_review() -> None:
    period = PayPeriod(
        calendar_id=None,
        organisation_id="gaa",
        start_date=SEPTEMBER,
        end_date=SEPTEMBER,
        status="OPEN",
    )
    instance: Any = SimpleNamespace(
        entity_id=period.id,
        workflow_type=WorkflowType.PAYROLL_RUN,
        status=WorkflowStatus.APPROVED,
    )

    async def scalar(_statement: object) -> PayPeriod:
        return period

    fake: Any = SimpleNamespace(scalar=scalar)
    period.workflow_instance_id = None
    instance.id = None
    with pytest.raises(service.PayrollConflictError):
        await service.finalize_review(fake, instance, period.id)


def test_download_names_are_sanitised() -> None:
    assert export.safe_filename('pay"; evil\r\n.csv') == "pay---evil--.csv"
    assert export.safe_filename("../../x") == "x"
