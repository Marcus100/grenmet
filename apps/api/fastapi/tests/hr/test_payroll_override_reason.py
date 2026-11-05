"""Calendar override reason: who sees it, who may change it, and what it satisfies.

Synthetic people, departments and reasons only. The reason is free text, so it
is withheld from anyone without organisation-wide hr.payroll.read.amounts, and
masked in change history unless the reader holds audit.view_sensitive.
"""

from datetime import date

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth.config import auth_settings
from src.auth.models import RoleAssignmentScope
from src.hr.models import Organisation
from src.utils.datetime import utc_now
from tests.factories import (
    assign_role,
    make_department,
    make_role_with_permission,
    make_user,
)
from tests.hr.payroll_setup import (
    API,
    calendar_and_period,
    departments,
    employee_in,
    headers_for,
    payroll_user,
)

SEPTEMBER = date(2026, 9, 1)
REASON = "Agreed in writing"
AUDIT_PAYROLL_SETTINGS = "/api/v1/audit/payroll_settings/gaa"


@pytest.fixture
def totp_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )


async def _make_hourly(
    client: httpx.AsyncClient, admin: dict[str, str], employee_id: str
) -> None:
    """Hourly basic pay on a monthly calendar; needs its own override reason."""
    response = await client.post(
        f"{API}/basic-pay",
        headers=admin,
        json={
            "organisation_id": "gaa",
            "user_id": employee_id,
            "pay_basis": "HOURLY",
            "amount_minor": 2000,
            "standard_monthly_hours": "173.33",
            "effective_from": "2026-01-01",
            "calendar_override_reason": REASON,
        },
    )
    assert response.status_code == 201, response.text


def _row(body: dict[str, object], user_id: str) -> dict[str, object]:
    data = body["data"]
    assert isinstance(data, list)
    return next(r for r in data if r["user_id"] == user_id)


@pytest.mark.usefixtures("totp_keys")
async def test_change_history_masks_the_reason_for_prepare_only_staff(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    ops, _, accounts = await departments(db_async)
    employee = await employee_in(db_async, ops)
    admin = await headers_for(
        db_async, await make_user(db_async, superuser=True), mfa=True
    )
    calendar_id, _ = await calendar_and_period(
        async_client, admin, accounts.id, SEPTEMBER
    )
    saved = await async_client.put(
        f"{API}/profiles/{employee.id}",
        headers=admin,
        json={
            "organisation_id": "gaa",
            "calendar_id": calendar_id,
            "calendar_override_reason": REASON,
        },
    )
    assert saved.status_code == 200, saved.text

    preparer = await payroll_user(db_async, "hr.payroll.prepare", department_id=ops.id)
    masked = await async_client.get(
        AUDIT_PAYROLL_SETTINGS, headers=await headers_for(db_async, preparer)
    )
    assert masked.status_code == 200, masked.text
    assert "employee_pay_profile" in masked.text
    assert REASON not in masked.text
    changes = [
        change
        for entry in masked.json()["data"]
        if entry["record_type"] == "employee_pay_profile"
        for change in entry["changes"]
        if change["field"] == "calendar_override_reason"
    ]
    assert changes, "the reason change should be in history"
    assert all(change["masked"] is True for change in changes)

    sensitive = await payroll_user(
        db_async,
        "hr.payroll.prepare",
        "audit.view_sensitive",
        department_id=ops.id,
    )
    shown = await async_client.get(
        AUDIT_PAYROLL_SETTINGS, headers=await headers_for(db_async, sensitive)
    )
    assert shown.status_code == 200, shown.text
    assert REASON in shown.text


@pytest.mark.usefixtures("totp_keys")
async def test_hourly_rule_counts_only_the_reason_in_the_request(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """N1: a stored reason never satisfies the Employment Act rule for a change."""
    ops, _, accounts = await departments(db_async)
    employee = await employee_in(db_async, ops)
    admin = await headers_for(
        db_async, await make_user(db_async, superuser=True), mfa=True
    )
    calendar_id, _ = await calendar_and_period(
        async_client, admin, accounts.id, SEPTEMBER
    )
    await _make_hourly(async_client, admin, str(employee.id))
    preparer = await headers_for(
        db_async,
        await payroll_user(db_async, "hr.payroll.prepare", department_id=ops.id),
    )
    # No reason stored: refused.
    refused = await async_client.put(
        f"{API}/profiles/{employee.id}",
        headers=preparer,
        json={"organisation_id": "gaa", "calendar_id": calendar_id},
    )
    assert refused.status_code == 409, refused.text
    assert "fortnightly" in refused.json()["detail"]

    # A reason stored by someone who can see it: still refused for the preparer,
    # who supplies none of their own, and the stored reason is untouched.
    stored = await async_client.put(
        f"{API}/profiles/{employee.id}",
        headers=admin,
        json={
            "organisation_id": "gaa",
            "calendar_id": calendar_id,
            "calendar_override_reason": REASON,
        },
    )
    assert stored.status_code == 200, stored.text
    refused_again = await async_client.put(
        f"{API}/profiles/{employee.id}",
        headers=preparer,
        json={"organisation_id": "gaa", "calendar_id": calendar_id},
    )
    assert refused_again.status_code == 409, refused_again.text
    listed = await async_client.get(
        f"{API}/profiles?organisation_id=gaa", headers=admin
    )
    assert _row(listed.json(), str(employee.id))["calendar_override_reason"] == REASON


@pytest.mark.usefixtures("totp_keys")
async def test_saving_without_a_reason_keeps_the_stored_one(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    ops, _, accounts = await departments(db_async)
    employee = await employee_in(db_async, ops)
    admin = await headers_for(
        db_async, await make_user(db_async, superuser=True), mfa=True
    )
    calendar_id, _ = await calendar_and_period(
        async_client, admin, accounts.id, SEPTEMBER
    )
    await async_client.put(
        f"{API}/profiles/{employee.id}",
        headers=admin,
        json={
            "organisation_id": "gaa",
            "calendar_id": calendar_id,
            "calendar_override_reason": REASON,
        },
    )
    preparer = await headers_for(
        db_async,
        await payroll_user(db_async, "hr.payroll.prepare", department_id=ops.id),
    )
    # Not hourly-paid, so no rule applies; the saved reason survives the save.
    saved = await async_client.put(
        f"{API}/profiles/{employee.id}",
        headers=preparer,
        json={"organisation_id": "gaa", "calendar_id": None},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["calendar_override_reason"] is None  # withheld from them
    listed = await async_client.get(
        f"{API}/profiles?organisation_id=gaa", headers=admin
    )
    assert _row(listed.json(), str(employee.id))["calendar_override_reason"] == REASON


@pytest.mark.usefixtures("totp_keys")
async def test_preparer_without_amounts_may_overwrite_a_stored_reason(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """N2: a new reason from a caller without amounts replaces the stored one.

    It is audited and masked in history; the gate is unchanged (N3).
    """
    ops, _, accounts = await departments(db_async)
    employee = await employee_in(db_async, ops)
    admin = await headers_for(
        db_async, await make_user(db_async, superuser=True), mfa=True
    )
    calendar_id, _ = await calendar_and_period(
        async_client, admin, accounts.id, SEPTEMBER
    )
    await async_client.put(
        f"{API}/profiles/{employee.id}",
        headers=admin,
        json={
            "organisation_id": "gaa",
            "calendar_id": calendar_id,
            "calendar_override_reason": REASON,
        },
    )
    preparer_user = await payroll_user(
        db_async, "hr.payroll.prepare", department_id=ops.id
    )
    preparer = await headers_for(db_async, preparer_user)
    overwritten = await async_client.put(
        f"{API}/profiles/{employee.id}",
        headers=preparer,
        json={
            "organisation_id": "gaa",
            "calendar_id": calendar_id,
            "calendar_override_reason": "Revised with HR",
        },
    )
    assert overwritten.status_code == 200, overwritten.text
    listed = await async_client.get(
        f"{API}/profiles?organisation_id=gaa", headers=admin
    )
    assert (
        _row(listed.json(), str(employee.id))["calendar_override_reason"]
        == "Revised with HR"
    )
    # Both the old and the new text are in history, and neither reaches a
    # reader without audit.view_sensitive.
    history = await async_client.get(
        AUDIT_PAYROLL_SETTINGS, headers=await headers_for(db_async, preparer_user)
    )
    assert history.status_code == 200, history.text
    assert "employee_pay_profile" in history.text
    assert REASON not in history.text
    assert "Revised with HR" not in history.text


@pytest.mark.usefixtures("totp_keys")
async def test_rows_written_before_the_field_was_sensitive_stay_masked(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """A row stored with sensitive false (written before the mark) is masked on read."""
    ops, _, _ = await departments(db_async)
    employee = await employee_in(db_async, ops)
    db_async.add(
        AuditEntry(
            entity_type="payroll_settings",
            entity_id="gaa",
            record_type="employee_pay_profile",
            record_id=str(employee.id),
            organisation_id="gaa",
            action="updated",
            changes=[
                {
                    "field": "calendar_override_reason",
                    "old": "Legacy old text",
                    "new": "Legacy new text",
                    "sensitive": False,
                }
            ],
            created_at=utc_now(),
        )
    )
    await db_async.commit()
    preparer = await payroll_user(db_async, "hr.payroll.prepare", department_id=ops.id)
    masked = await async_client.get(
        AUDIT_PAYROLL_SETTINGS, headers=await headers_for(db_async, preparer)
    )
    assert masked.status_code == 200, masked.text
    assert "Legacy old text" not in masked.text
    assert "Legacy new text" not in masked.text
    sensitive = await payroll_user(
        db_async,
        "hr.payroll.prepare",
        "audit.view_sensitive",
        department_id=ops.id,
    )
    shown = await async_client.get(
        AUDIT_PAYROLL_SETTINGS, headers=await headers_for(db_async, sensitive)
    )
    assert "Legacy new text" in shown.text


@pytest.mark.usefixtures("totp_keys")
async def test_reason_in_request_satisfies_the_hourly_rule_for_a_preparer(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """N1 positive: a preparer who supplies a reason may move an hourly person."""
    ops, _, accounts = await departments(db_async)
    employee = await employee_in(db_async, ops)
    admin = await headers_for(
        db_async, await make_user(db_async, superuser=True), mfa=True
    )
    calendar_id, _ = await calendar_and_period(
        async_client, admin, accounts.id, SEPTEMBER
    )
    await _make_hourly(async_client, admin, str(employee.id))
    preparer = await headers_for(
        db_async,
        await payroll_user(db_async, "hr.payroll.prepare", department_id=ops.id),
    )
    moved = await async_client.put(
        f"{API}/profiles/{employee.id}",
        headers=preparer,
        json={
            "organisation_id": "gaa",
            "calendar_id": calendar_id,
            "calendar_override_reason": "Agreed with HR",
        },
    )
    assert moved.status_code == 200, moved.text
    listed = await async_client.get(
        f"{API}/profiles?organisation_id=gaa", headers=admin
    )
    assert (
        _row(listed.json(), str(employee.id))["calendar_override_reason"]
        == "Agreed with HR"
    )


@pytest.mark.usefixtures("totp_keys")
async def test_visibility_flag_follows_scope_and_organisation(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    ops, _, accounts = await departments(db_async)
    employee = await employee_in(db_async, ops)
    admin = await headers_for(
        db_async, await make_user(db_async, superuser=True), mfa=True
    )
    calendar_id, _ = await calendar_and_period(
        async_client, admin, accounts.id, SEPTEMBER
    )
    await async_client.put(
        f"{API}/profiles/{employee.id}",
        headers=admin,
        json={
            "organisation_id": "gaa",
            "calendar_id": calendar_id,
            "calendar_override_reason": REASON,
        },
    )

    # N4: amounts held only within one department is not organisation-wide.
    scoped_amounts = await payroll_user(
        db_async,
        "hr.payroll.read.department",
        "hr.payroll.read.amounts",
        department_id=ops.id,
        scope=RoleAssignmentScope.DEPARTMENT,
        scoped_department=ops.id,
    )
    scoped = await async_client.get(
        f"{API}/profiles?organisation_id=gaa",
        headers=await headers_for(db_async, scoped_amounts),
    )
    assert scoped.status_code == 200, scoped.text
    assert scoped.json()["calendar_override_reason_visible"] is False
    assert _row(scoped.json(), str(employee.id))["calendar_override_reason"] is None

    # N4: amounts held in organisation gaa; read access in acme_pay does not carry it.
    db_async.add(Organisation(id="acme_pay", code="ACMEPAY", name="Synthetic Org"))
    await db_async.commit()
    await make_department(db_async, "acme_ops", organisation_id="acme_pay")
    both = await payroll_user(
        db_async,
        "hr.payroll.read.department",
        "hr.payroll.read.amounts",
        department_id=ops.id,
    )
    other_role, _ = await make_role_with_permission(
        db_async, "hr.payroll.read.department"
    )
    await assign_role(
        db_async,
        user=both,
        role=other_role,
        scope=RoleAssignmentScope.ALL,
        organisation_id="acme_pay",
    )
    both_headers = await headers_for(db_async, both)
    home = await async_client.get(
        f"{API}/profiles?organisation_id=gaa", headers=both_headers
    )
    assert home.status_code == 200, home.text
    assert home.json()["calendar_override_reason_visible"] is True
    away = await async_client.get(
        f"{API}/profiles?organisation_id=acme_pay", headers=both_headers
    )
    assert away.status_code == 200, away.text
    assert away.json()["calendar_override_reason_visible"] is False


@pytest.mark.usefixtures("totp_keys")
async def test_amounts_holder_sees_the_reason_in_the_save_response(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """N4: an amounts holder who is not a superuser gets the reason back on PUT."""
    ops, _, accounts = await departments(db_async)
    employee = await employee_in(db_async, ops)
    admin = await headers_for(
        db_async, await make_user(db_async, superuser=True), mfa=True
    )
    calendar_id, _ = await calendar_and_period(
        async_client, admin, accounts.id, SEPTEMBER
    )
    holder = await payroll_user(
        db_async,
        "hr.payroll.prepare",
        "hr.payroll.read.amounts",
        department_id=ops.id,
    )
    saved = await async_client.put(
        f"{API}/profiles/{employee.id}",
        headers=await headers_for(db_async, holder),
        json={
            "organisation_id": "gaa",
            "calendar_id": calendar_id,
            "calendar_override_reason": REASON,
        },
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["calendar_override_reason"] == REASON
