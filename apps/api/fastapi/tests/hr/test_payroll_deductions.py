"""Payroll slice 3: deductions, the provisional-figures rule, issue approval.

Synthetic people and amounts only (XCD cents).
"""

import uuid
from datetime import date
from decimal import Decimal
from typing import Any

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.config import auth_settings
from src.auth.models import RoleAssignmentScope, User
from src.database import async_session_factory
from src.hr.models import Organisation
from src.hr.payroll import statutory
from tests.factories import assign_role, make_role_with_permission, make_user
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
    common: dict[str, Any] = {
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
) -> tuple[dict[str, str], str, str, User, str]:
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


async def _confirm(
    client: httpx.AsyncClient, headers: dict[str, str], kind: str, table_id: str
) -> None:
    response = await client.put(
        f"{API}/statutory-tables/{kind}/{table_id}/state",
        headers=headers,
        json={"rule_state": "CONFIRMED", "note": "Checked, synthetic"},
    )
    assert response.status_code == 200, response.text


async def _self_service(db: AsyncSession, user: User) -> dict[str, str]:
    role, _ = await make_role_with_permission(db, "hr.payroll.read.self")
    await assign_role(db, user=user, role=role)
    return await headers_for(db, user)


async def _summary(
    client: httpx.AsyncClient, headers: dict[str, str], period_id: str
) -> dict[str, Any]:
    response = await client.get(
        f"{API}/periods/{period_id}/pay-summary", headers=headers
    )
    assert response.status_code == 200, response.text
    data: dict[str, Any] = response.json()
    return data


@pytest.mark.usefixtures("totp_keys")
async def test_fortnightly_deductions_net_and_provisional_figures(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    headers, period_id, pension_id, employee, nis_id = await _fortnight_with_pay(
        async_client, db_async
    )
    await async_client.post(f"{API}/periods/{period_id}/computation", headers=headers)
    summary = await _summary(async_client, headers, period_id)
    row = summary["employees"][0]
    by_code = {d["code"]: d for d in row["deductions"]}
    assert row["gross_minor"] == 240_000  # 520,000 x 12/26
    assert by_code["NIS"]["employee_minor"] == 15_000
    assert by_code["NIS"]["employer_minor"] == 17_400
    assert by_code["PAYE"]["employee_minor"] == 11_815
    assert "PENSION" not in by_code  # no authorisation recorded yet
    assert row["net_minor"] == 240_000 - 15_000 - 11_815
    assert summary["label"] == "Provisional figures"
    assert summary["blocking_tables"] == ["NIS", "PAYE"]  # PAYE is provisional too

    # The signed form is recorded, but nothing is taken until the employee confirms.
    created = await async_client.post(
        f"{API}/employee-deductions",
        headers=headers,
        json={
            "organisation_id": "gaa",
            "user_id": str(employee.id),
            "deduction_type_id": pension_id,
            "effective_from": "2026-09-01",
            "authorisation_reference": "Signed pension form, synthetic",
        },
    )
    assert created.status_code == 201, created.text
    await async_client.post(f"{API}/periods/{period_id}/computation", headers=headers)
    codes = {
        d["code"]
        for d in (await _summary(async_client, headers, period_id))["employees"][0][
            "deductions"
        ]
    }
    assert "PENSION" not in codes
    own = await _self_service(db_async, employee)
    confirmed = await async_client.post(
        f"{API}/me/deductions/{created.json()['id']}/confirmation", headers=own
    )
    assert confirmed.status_code == 200, confirmed.text
    await async_client.post(f"{API}/periods/{period_id}/computation", headers=headers)
    pension = next(
        d
        for d in (await _summary(async_client, headers, period_id))["employees"][0][
            "deductions"
        ]
        if d["code"] == "PENSION"
    )
    assert (pension["employee_minor"], pension["employer_minor"]) == (12_000, 12_000)

    # A separate person confirms the tables; the snapshot needs a recompute.
    confirmer = await headers_for(
        db_async, await make_user(db_async, superuser=True), mfa=True
    )
    tables = (
        await async_client.get(
            f"{API}/statutory-tables?organisation_id=gaa", headers=headers
        )
    ).json()
    await _confirm(async_client, confirmer, "social-insurance", nis_id)
    await _confirm(async_client, confirmer, "tax", tables["tax_tables"][0]["id"])
    # An unconfirmed deduction type blocks issue just like a tax table does.
    blocked = await _summary(async_client, headers, period_id)
    assert blocked["provisional_figures"] is True
    assert "PENSION" in blocked["blocking_tables"]
    await _confirm(async_client, confirmer, "deduction", pension_id)
    await async_client.post(f"{API}/periods/{period_id}/computation", headers=headers)
    assert (await _summary(async_client, headers, period_id))[
        "provisional_figures"
    ] is False

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
    for who in (headers, approver, confirmer):  # preparer, approver, confirmer
        refused = await async_client.post(
            f"{API}/periods/{period_id}/issue-approval", headers=who
        )
        assert refused.status_code == 403, refused.text
    issuer = await headers_for(
        db_async, await make_user(db_async, superuser=True), mfa=True
    )
    issued = await async_client.post(
        f"{API}/periods/{period_id}/issue-approval", headers=issuer
    )
    assert issued.status_code == 200, issued.text
    # Reopening a table later does not rewrite the computed period.
    await _confirm(async_client, confirmer, "social-insurance", nis_id)
    reopened = await async_client.put(
        f"{API}/statutory-tables/social-insurance/{nis_id}/state",
        headers=confirmer,
        json={"rule_state": "PROVISIONAL", "note": "Reopened for review"},
    )
    assert reopened.status_code == 200
    assert (await _summary(async_client, headers, period_id))[
        "provisional_figures"
    ] is False


@pytest.mark.usefixtures("totp_keys")
async def test_one_person_cannot_create_confirm_and_issue(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    ops, _, _ = await departments(db_async)
    actor = await headers_for(
        db_async, await make_user(db_async, superuser=True), mfa=True
    )
    created = await async_client.post(
        f"{API}/tax-tables",
        headers=actor,
        json={
            "organisation_id": "gaa",
            "code": "TEST_TAX",
            "name": "Test tax",
            "annual_allowance_minor": 0,
            "effective_from": "2030-01-01",
            "rule_state": "CONFIRMED",
            "bands": [{"rate": "0.1"}],
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["rule_state"] == "PROVISIONAL"  # never client-settable
    own = await async_client.put(
        f"{API}/statutory-tables/tax/{created.json()['id']}/state",
        headers=actor,
        json={"rule_state": "CONFIRMED", "note": "Self-confirmed"},
    )
    assert own.status_code == 403
    holder = await payroll_user(
        db_async, "hr.payroll.rates.manage", department_id=ops.id
    )
    no_key = await async_client.put(
        f"{API}/statutory-tables/tax/{created.json()['id']}/state",
        headers=await headers_for(db_async, holder, mfa=True),
        json={"rule_state": "CONFIRMED", "note": "Not allowed"},
    )
    assert no_key.status_code == 403
    overlap = await async_client.post(
        f"{API}/social-insurance-schemes",
        headers=actor,
        json={
            "organisation_id": "gaa",
            "code": "NIS",
            "name": "Overlapping NIS",
            "employee_rate": "0.05",
            "employer_rate": "0.05",
            "monthly_ceiling_minor": 1,
            "weekly_ceiling_minor": 1,
            "effective_from": "2026-06-01",
        },
    )
    assert overlap.status_code == 409


@pytest.mark.usefixtures("totp_keys")
async def test_net_pay_never_goes_below_zero(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    headers, period_id, _, employee, _ = await _fortnight_with_pay(
        async_client, db_async
    )
    tables = (
        await async_client.get(
            f"{API}/statutory-tables?organisation_id=gaa", headers=headers
        )
    ).json()
    dues = next(t for t in tables["deduction_types"] if t["code"] == "UNION_DUES")
    created = await async_client.post(
        f"{API}/employee-deductions",
        headers=headers,
        json={
            "organisation_id": "gaa",
            "user_id": str(employee.id),
            "deduction_type_id": dues["id"],
            "employee_amount_minor": 999_999,
            "effective_from": "2026-09-01",
            "authorisation_reference": "Signed dues form, synthetic",
        },
    )
    assert created.status_code == 201, created.text
    own = await _self_service(db_async, employee)
    await async_client.post(
        f"{API}/me/deductions/{created.json()['id']}/confirmation", headers=own
    )
    mine = (await async_client.get(f"{API}/me/deductions", headers=own)).json()["data"]
    assert mine and all("amount" not in key for key in mine[0])
    await async_client.post(f"{API}/periods/{period_id}/computation", headers=headers)
    row = (await _summary(async_client, headers, period_id))["employees"][0]
    assert row["net_minor"] == 0
    assert row["shortfall_minor"] > 0
    stranger = await _self_service(db_async, await make_user(db_async))
    other = await async_client.post(
        f"{API}/me/deductions/{created.json()['id']}/confirmation", headers=stranger
    )
    assert other.status_code == 404


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


async def _approved_period(
    client: httpx.AsyncClient, db: AsyncSession
) -> tuple[dict[str, str], dict[str, str], str, str, dict[str, Any]]:
    """An approved-quantities period computed while NIS and PAYE are provisional."""
    headers, period_id, _, _, nis_id = await _fortnight_with_pay(client, db)
    await client.post(f"{API}/periods/{period_id}/computation", headers=headers)
    submitted = await client.post(
        f"{API}/periods/{period_id}/submission", headers=headers
    )
    assert submitted.status_code == 200, submitted.text
    approver = await headers_for(db, await make_user(db, superuser=True), mfa=True)
    approved = await client.post(
        f"{API}/periods/{period_id}/approval", headers=approver, json={}
    )
    assert approved.status_code == 200, approved.text
    tables = (
        await client.get(f"{API}/statutory-tables?organisation_id=gaa", headers=headers)
    ).json()
    return headers, approver, period_id, nis_id, tables


@pytest.mark.usefixtures("totp_keys")
async def test_confirming_after_approval_needs_the_audited_refresh(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    headers, approver, period_id, nis_id, tables = await _approved_period(
        async_client, db_async
    )
    confirmer = await headers_for(
        db_async, await make_user(db_async, superuser=True), mfa=True
    )
    await _confirm(async_client, confirmer, "social-insurance", nis_id)
    await _confirm(async_client, confirmer, "tax", tables["tax_tables"][0]["id"])
    issuer = await headers_for(
        db_async, await make_user(db_async, superuser=True), mfa=True
    )
    # The frozen snapshot still says provisional, so issue is refused.
    stuck = await async_client.post(
        f"{API}/periods/{period_id}/issue-approval", headers=issuer
    )
    assert stuck.status_code == 409
    # The preparer and the quantities approver cannot refresh; an unrelated approver can.
    for who in (headers, approver):
        denied = await async_client.post(
            f"{API}/periods/{period_id}/table-state-refresh", headers=who
        )
        assert denied.status_code == 403, denied.text
    no_mfa = await async_client.post(
        f"{API}/periods/{period_id}/table-state-refresh",
        headers=await headers_for(db_async, await make_user(db_async, superuser=True)),
    )
    assert no_mfa.status_code == 403
    refreshed = await async_client.post(
        f"{API}/periods/{period_id}/table-state-refresh", headers=issuer
    )
    assert refreshed.status_code == 200, refreshed.text
    # Figures did not change; only the states did, and the refresh is audited.
    summary = await _summary(async_client, headers, period_id)
    assert summary["provisional_figures"] is False
    assert summary["employees"][0]["net_minor"] == 240_000 - 15_000 - 11_815
    history = await async_client.get(
        f"/api/v1/audit/pay_period/{period_id}", headers=headers
    )
    assert "pay_period_table_refresh" in history.text
    # The confirmer of the tables is still excluded from issuing.
    by_confirmer = await async_client.post(
        f"{API}/periods/{period_id}/issue-approval", headers=confirmer
    )
    assert by_confirmer.status_code == 403
    done = await async_client.post(
        f"{API}/periods/{period_id}/issue-approval", headers=issuer
    )
    assert done.status_code == 200, done.text
    after = await async_client.post(
        f"{API}/periods/{period_id}/table-state-refresh", headers=issuer
    )
    assert after.status_code == 409  # never once issued


@pytest.mark.usefixtures("totp_keys")
async def test_deduction_types_follow_the_same_gate_and_confirmers_can_read(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    ops, _, _ = await departments(db_async)
    typist = await headers_for(
        db_async, await make_user(db_async, superuser=True), mfa=True
    )
    created = await async_client.post(
        f"{API}/deduction-types",
        headers=typist,
        json={
            "organisation_id": "gaa",
            "code": "CUSTOM",
            "name": "Custom deduction",
            "kind": "FIXED",
            "employee_amount_minor": 1000,
            "effective_from": "2030-01-01",
            "requires_authorisation": False,
            "rule_state": "CONFIRMED",
        },
    )
    assert created.status_code == 201, created.text
    body = created.json()
    assert body["requires_authorisation"] is True  # not settable by the creator
    assert body["rule_state"] == "PROVISIONAL"
    confirm_only = await payroll_user(
        db_async, "hr.payroll.tables.confirm", department_id=ops.id
    )
    confirmer = await headers_for(db_async, confirm_only, mfa=True)
    tables = await async_client.get(
        f"{API}/statutory-tables?organisation_id=gaa", headers=confirmer
    )
    assert tables.status_code == 200, tables.text  # nobody confirms blind
    assert "CUSTOM" in tables.text
    own = await async_client.put(
        f"{API}/statutory-tables/deduction/{body['id']}/state",
        headers=typist,
        json={"rule_state": "CONFIRMED", "note": "Self-confirm"},
    )
    assert own.status_code == 403
    done = await async_client.put(
        f"{API}/statutory-tables/deduction/{body['id']}/state",
        headers=confirmer,
        json={"rule_state": "CONFIRMED", "note": "Checked, synthetic"},
    )
    assert done.status_code == 200, done.text
    assert done.json()["rule_state"] == "CONFIRMED"


async def test_approvers_are_counted_across_every_workflow_instance(
    db_async: AsyncSession,
) -> None:
    from src.hr.payroll import access
    from src.hr.payroll.models import PayPeriod
    from src.hr.workflow.models import (
        WorkflowAction,
        WorkflowInstance,
        WorkflowStatus,
        WorkflowStepInstance,
        WorkflowTemplate,
        WorkflowType,
    )

    _, _, accounts = await departments(db_async)
    await approval_setup(db_async, accounts.id)
    template = await db_async.scalar(
        select(WorkflowTemplate).where(
            WorkflowTemplate.department_id == accounts.id,
            WorkflowTemplate.workflow_type == WorkflowType.PAYROLL_RUN,
        )
    )
    assert template is not None
    requester = await make_user(db_async)
    first, second = await make_user(db_async), await make_user(db_async)
    period = PayPeriod(
        id=uuid.uuid4(),
        calendar_id=None,
        organisation_id="gaa",
        start_date=date(2026, 9, 1),
        end_date=date(2026, 9, 30),
        status="IN_REVIEW",
    )
    for approver in (first, second):
        instance = WorkflowInstance(
            workflow_template_id=template.id,
            department_id=accounts.id,
            workflow_type=WorkflowType.PAYROLL_RUN,
            entity_type="pay_period",
            entity_id=period.id,
            requested_by_user_id=requester.id,
            status=WorkflowStatus.RETURNED,
        )
        db_async.add(instance)
        await db_async.flush()
        db_async.add(
            WorkflowStepInstance(
                workflow_instance_id=instance.id,
                step_order=1,
                approver_user_id=approver.id,
                action=WorkflowAction.APPROVE,
            )
        )
    await db_async.flush()
    assert await access.period_approvers(db_async, period) == {first.id, second.id}


@pytest.mark.usefixtures("totp_keys")
async def test_refresh_needs_read_amounts_and_shows_no_money(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    headers, approver, period_id, nis_id, tables = await _approved_period(
        async_client, db_async
    )
    ops, _, _ = await departments(db_async)
    approve_only = await payroll_user(
        db_async, "hr.payroll.approve", department_id=ops.id
    )
    refused = await async_client.post(
        f"{API}/periods/{period_id}/table-state-refresh",
        headers=await headers_for(db_async, approve_only, mfa=True),
    )
    assert refused.status_code == 403  # approving is not enough: amounts are involved
    issuer = await headers_for(
        db_async, await make_user(db_async, superuser=True), mfa=True
    )
    done = await async_client.post(
        f"{API}/periods/{period_id}/table-state-refresh", headers=issuer
    )
    assert done.status_code == 200, done.text
    assert "amount" not in done.text and "minor" not in done.text  # quantities only
    # A closed period is refused cleanly, and the database agrees (defence in depth).
    await db_async.execute(
        text("UPDATE hr.pay_period SET status = 'CLOSED' WHERE id = :id"),
        {"id": period_id},
    )
    await db_async.commit()
    closed = await async_client.post(
        f"{API}/periods/{period_id}/table-state-refresh", headers=issuer
    )
    assert closed.status_code == 409
    async with async_session_factory() as fresh:
        await fresh.execute(
            text("SELECT set_config('payroll.refresh_table_state','on',true)")
        )
        with pytest.raises(DBAPIError, match="locked"):
            await fresh.execute(
                text("UPDATE hr.pay_deduction_line SET source_rule_state = 'CONFIRMED'")
            )
