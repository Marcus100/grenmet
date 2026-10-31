"""Payroll slice 3: deductions, the provisional-figures rule, issue approval.

Synthetic people and amounts only (XCD cents).
"""

from datetime import date
from decimal import Decimal

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.config import auth_settings
from src.auth.models import RoleAssignmentScope
from src.hr.models import Organisation
from src.hr.payroll import statutory
from tests.factories import make_user
from tests.hr.payroll_setup import (
    API,
    approval_setup,
    departments,
    employee_in,
    headers_for,
    payroll_user,
)

FORTNIGHT = date(2026, 9, 13)


@pytest.fixture
def totp_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )


def test_nis_fortnight_ceiling_is_weekly_times_two() -> None:
    ceiling = statutory.insurable_ceiling(
        "FORTNIGHTLY",
        monthly_minor=520_000,
        weekly_minor=120_000,
        fortnightly_minor=None,
    )
    assert ceiling == 240_000
    assert (
        statutory.insurable_ceiling(
            "MONTHLY",
            monthly_minor=520_000,
            weekly_minor=120_000,
            fortnightly_minor=None,
        )
        == 520_000
    )
    split = statutory.social_insurance(
        300_000, ceiling, Decimal("0.0625"), Decimal("0.0725")
    )
    assert (split.base_minor, split.employee_minor, split.employer_minor) == (
        240_000,
        15_000,
        17_400,
    )


def test_paye_is_annualised_over_twenty_six_fortnights() -> None:
    bands = [
        statutory.Band(width_minor=2_400_000, rate=Decimal("0.10")),
        statutory.Band(width_minor=None, rate=Decimal("0.28")),
    ]
    # EC$2,400 a fortnight: 62,400 a year, 26,400 chargeable after EC$36,000;
    # 2,400 + 672 = 3,072 a year, 118.15 a fortnight.
    tax = statutory.income_tax_annualised(
        240_000, periods=26, allowance_minor=3_600_000, bands=bands
    )
    assert tax.employee_minor == 11_815
    below = statutory.income_tax_annualised(
        130_000, periods=26, allowance_minor=3_600_000, bands=bands
    )
    assert below.employee_minor == 0


def test_other_deductions_never_default_to_zero() -> None:
    common = {
        "basic_minor": 240_000,
        "gross_minor": 260_000,
        "employee_rate": None,
        "employer_rate": None,
        "employee_amount_minor": None,
        "employer_amount_minor": None,
        "premium_minor": None,
        "employee_share": Decimal("0.40"),
    }
    assert statutory.other_deduction("SPLIT_PREMIUM", **common) is None
    split = statutory.other_deduction(
        "SPLIT_PREMIUM", **{**common, "premium_minor": 10_001}
    )
    assert split is not None
    assert (split.employee_minor, split.employer_minor) == (4_000, 6_001)


async def _fortnight_with_pay(
    client: httpx.AsyncClient, db: AsyncSession
) -> tuple[dict[str, str], str, str, object, str]:
    ops, _, accounts = await departments(db)
    await approval_setup(db, accounts.id)
    employee = await employee_in(db, ops)
    preparer = await make_user(db, superuser=True)
    headers = await headers_for(db, preparer, mfa=True)
    calendar = await client.post(
        f"{API}/calendars",
        headers=headers,
        json={
            "organisation_id": "gaa",
            "name": "Fortnightly",
            "approval_department_id": accounts.id,
            "anchor_date": "2026-08-30",
        },
    )
    assert calendar.status_code == 201, calendar.text
    basic = await client.post(
        f"{API}/basic-pay",
        headers=headers,
        json={
            "organisation_id": "gaa",
            "user_id": str(employee.id),
            "pay_basis": "SALARIED",
            "amount_minor": 520_000,
            "standard_monthly_hours": "160",
            "effective_from": "2026-01-01",
        },
    )
    assert basic.status_code == 201, basic.text
    tables = (
        await client.get(f"{API}/statutory-tables?organisation_id=gaa", headers=headers)
    ).json()
    pension = next(t for t in tables["deduction_types"] if t["code"] == "PENSION")
    enrol = await client.post(
        f"{API}/employee-deductions",
        headers=headers,
        json={
            "organisation_id": "gaa",
            "user_id": str(employee.id),
            "deduction_type_id": pension["id"],
            "effective_from": "2026-01-01",
        },
    )
    assert enrol.status_code == 201, enrol.text
    period = await client.post(
        f"{API}/periods",
        headers=headers,
        json={
            "calendar_id": calendar.json()["id"],
            "start_date": FORTNIGHT.isoformat(),
        },
    )
    assert period.status_code == 201, period.text
    nis_2026 = next(
        s for s in tables["social_insurance"] if s["effective_from"] == "2026-01-01"
    )
    return headers, period.json()["id"], pension["id"], employee, nis_2026["id"]


@pytest.mark.usefixtures("totp_keys")
async def test_fortnightly_deductions_net_and_provisional_figures(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    headers, period_id, pension_id, employee, nis_id = await _fortnight_with_pay(
        async_client, db_async
    )
    await async_client.post(f"{API}/periods/{period_id}/computation", headers=headers)
    summary = (
        await async_client.get(
            f"{API}/periods/{period_id}/pay-summary", headers=headers
        )
    ).json()
    row = summary["employees"][0]
    by_code = {d["code"]: d for d in row["deductions"]}
    assert row["gross_minor"] == 240_000  # 520,000 x 12/26
    assert by_code["NIS"]["employee_minor"] == 15_000
    assert by_code["NIS"]["employer_minor"] == 17_400
    assert by_code["PAYE"]["employee_minor"] == 11_815
    assert by_code["PAYE"]["rule_state"] == "OWNER_CONFIRMED"
    assert "PENSION" not in by_code  # no authorisation recorded yet
    assert row["net_minor"] == 240_000 - 15_000 - 11_815
    assert summary["provisional_figures"] is True
    assert summary["label"] == "Provisional figures"
    assert summary["blocking_tables"] == ["NIS"]

    # Record the employee's pension authorisation, recompute: 5% of basic each.
    await async_client.post(
        f"{API}/employee-deductions",
        headers=headers,
        json={
            "organisation_id": "gaa",
            "user_id": str(employee.id),  # type: ignore[attr-defined]
            "deduction_type_id": pension_id,
            "effective_from": "2026-09-01",
            "authorisation_reference": "Signed pension form, synthetic",
        },
    )
    await async_client.post(f"{API}/periods/{period_id}/computation", headers=headers)
    summary = (
        await async_client.get(
            f"{API}/periods/{period_id}/pay-summary", headers=headers
        )
    ).json()
    pension = next(
        d for d in summary["employees"][0]["deductions"] if d["code"] == "PENSION"
    )
    assert (pension["employee_minor"], pension["employer_minor"]) == (12_000, 12_000)

    # HARD RULE: approved quantities, but NIS is provisional, so no issue.
    submitted = await async_client.post(
        f"{API}/periods/{period_id}/submission", headers=headers
    )
    assert submitted.status_code == 200, submitted.text
    approver = await headers_for(
        db_async, await make_user(db_async, superuser=True), mfa=True
    )
    approved = await async_client.post(
        f"{API}/periods/{period_id}/approval", headers=approver, json={}
    )
    assert approved.status_code == 200, approved.text
    preparer_issue = await async_client.post(
        f"{API}/periods/{period_id}/issue-approval", headers=headers
    )
    assert preparer_issue.status_code == 403
    blocked = await async_client.post(
        f"{API}/periods/{period_id}/issue-approval", headers=approver
    )
    assert blocked.status_code == 409
    assert "Provisional figures" in blocked.json()["detail"]

    confirmed = await async_client.put(
        f"{API}/statutory-tables/social-insurance/{nis_id}/state",
        headers=headers,
        json={"rule_state": "CONFIRMED", "note": "Checked against the NIS schedule"},
    )
    assert confirmed.status_code == 200, confirmed.text
    issued = await async_client.post(
        f"{API}/periods/{period_id}/issue-approval", headers=approver
    )
    assert issued.status_code == 200, issued.text
    summary = (
        await async_client.get(
            f"{API}/periods/{period_id}/pay-summary", headers=headers
        )
    ).json()
    assert summary["provisional_figures"] is False
    assert summary["issue_approved_at"] is not None


@pytest.mark.usefixtures("totp_keys")
async def test_deduction_access_and_empty_new_organisation(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    ops, _, accounts = await departments(db_async)
    db_async.add(Organisation(id="new_tax", code="NEWTAX", name="Synthetic New Org"))
    await db_async.commit()
    admin = await headers_for(db_async, await make_user(db_async, superuser=True))
    empty = (
        await async_client.get(
            f"{API}/statutory-tables?organisation_id=new_tax", headers=admin
        )
    ).json()
    assert empty == {"tax_tables": [], "social_insurance": [], "deduction_types": []}
    gaa = (
        await async_client.get(
            f"{API}/statutory-tables?organisation_id=gaa", headers=admin
        )
    ).json()
    assert {s["rule_state"] for s in gaa["social_insurance"]} == {"PROVISIONAL"}
    assert gaa["tax_tables"][0]["bands"][0]["rate"] == "0.1000"
    assert "15%/30%" in gaa["tax_tables"][0]["source_note"]
    assert {d["code"] for d in gaa["deduction_types"]} == {
        "PENSION",
        "HEALTH",
        "UNION_DUES",
    }
    assert all(d["requires_authorisation"] for d in gaa["deduction_types"])

    reader = await payroll_user(
        db_async,
        "hr.payroll.read.department",
        "hr.payroll.read.amounts",
        department_id=ops.id,
        scope=RoleAssignmentScope.DEPARTMENT,
        scoped_department=ops.id,
    )
    calendar = await async_client.post(
        f"{API}/calendars",
        headers=admin,
        json={
            "organisation_id": "gaa",
            "name": "Monthly",
            "approval_department_id": accounts.id,
            "frequency": "MONTHLY",
        },
    )
    period = await async_client.post(
        f"{API}/periods",
        headers=admin,
        json={"calendar_id": calendar.json()["id"], "start_date": "2026-09-01"},
    )
    refused = await async_client.get(
        f"{API}/periods/{period.json()['id']}/pay-summary",
        headers=await headers_for(db_async, reader),
    )
    assert refused.status_code == 403
    manager = await payroll_user(
        db_async, "hr.payroll.rates.manage", department_id=ops.id
    )
    no_mfa = await async_client.post(
        f"{API}/tax-tables",
        headers=await headers_for(db_async, manager),
        json={
            "organisation_id": "gaa",
            "code": "TEST",
            "name": "Test",
            "annual_allowance_minor": 0,
            "effective_from": "2026-01-01",
            "bands": [{"rate": "0.1"}],
        },
    )
    assert no_mfa.status_code == 403
    open_band_missing = await async_client.post(
        f"{API}/tax-tables",
        headers=await headers_for(db_async, manager, mfa=True),
        json={
            "organisation_id": "gaa",
            "code": "TEST",
            "name": "Test",
            "annual_allowance_minor": 0,
            "effective_from": "2026-01-01",
            "bands": [{"width_minor": 100, "rate": "0.1"}],
        },
    )
    assert open_band_missing.status_code == 400
