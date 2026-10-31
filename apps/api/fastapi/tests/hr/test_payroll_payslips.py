"""Payroll slice 4: payslips, staff self-view, bank and GL files.

Synthetic people and amounts only (XCD cents).
"""

import csv
import io
from decimal import Decimal

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.config import auth_settings
from src.auth.models import User
from src.database import async_session_factory
from src.hr.payroll import payslips
from tests.factories import assign_role, make_role_with_permission, make_user
from tests.hr.payroll_setup import API, headers_for
from tests.hr.test_payroll_deductions import _confirm, _fortnight_with_pay


@pytest.fixture
def totp_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )


async def _issued_period(
    client: httpx.AsyncClient, db: AsyncSession
) -> tuple[dict[str, str], str, User]:
    headers, period_id, _, employee, nis_id = await _fortnight_with_pay(client, db)
    confirmer = await headers_for(db, await make_user(db, superuser=True), mfa=True)
    tables = (
        await client.get(f"{API}/statutory-tables?organisation_id=gaa", headers=headers)
    ).json()
    await _confirm(client, confirmer, "social-insurance", nis_id)
    await _confirm(client, confirmer, "tax", tables["tax_tables"][0]["id"])
    await client.post(f"{API}/periods/{period_id}/computation", headers=headers)
    await client.post(f"{API}/periods/{period_id}/submission", headers=headers)
    approver = await headers_for(db, await make_user(db, superuser=True), mfa=True)
    approved = await client.post(
        f"{API}/periods/{period_id}/approval", headers=approver, json={}
    )
    assert approved.status_code == 200, approved.text
    issuer = await headers_for(db, await make_user(db, superuser=True), mfa=True)
    issued = await client.post(
        f"{API}/periods/{period_id}/issue-approval", headers=issuer
    )
    assert issued.status_code == 200, issued.text
    return headers, period_id, employee


@pytest.mark.usefixtures("totp_keys")
async def test_issue_creates_hashed_immutable_payslips(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    headers, period_id, employee = await _issued_period(async_client, db_async)
    listed = await async_client.get(
        f"{API}/periods/{period_id}/payslips", headers=headers
    )
    assert listed.status_code == 200, listed.text
    [slip] = listed.json()["data"]
    assert slip["user_id"] == str(employee.id)
    assert slip["net_minor"] == 240_000 - 15_000 - 11_815
    from src.hr.payroll.models import Payslip

    stored = await db_async.get(Payslip, slip["id"])
    assert stored is not None
    assert payslips.digest(stored.snapshot) == stored.sha256 == slip["sha256"]
    snapshot = stored.snapshot
    assert snapshot["gross_minor"] == 240_000
    assert {d["code"] for d in snapshot["deductions"]} == {"NIS", "PAYE"}
    assert snapshot["earnings"][0]["code"] == "BASIC"
    for statement in (
        "UPDATE hr.payslip SET net_minor = 1 WHERE id = :id",
        "DELETE FROM hr.payslip WHERE id = :id",
    ):
        async with async_session_factory() as fresh:
            with pytest.raises(DBAPIError, match="append-only"):
                await fresh.execute(text(statement), {"id": slip["id"]})
    history = await async_client.get(
        f"/api/v1/audit/pay_period/{period_id}", headers=headers
    )
    assert history.status_code == 200, history.text
    assert "snapshot" not in history.text and "213185" not in history.text
    html = payslips.render_html(snapshot, stored.sha256)
    for words in ("Gross pay", "Total deductions", "Net pay", "2,131.85"):
        assert words in html


@pytest.mark.usefixtures("totp_keys")
async def test_staff_read_only_their_own_payslips(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    headers, period_id, employee = await _issued_period(async_client, db_async)
    own = await headers_for(db_async, employee, mfa=True)
    denied = await async_client.get(f"{API}/me/payslips", headers=own)
    assert denied.status_code == 403  # read.self is granted to no role
    role, _ = await make_role_with_permission(db_async, "hr.payroll.read.self")
    await assign_role(db_async, user=employee, role=role)
    no_mfa = await async_client.get(
        f"{API}/me/payslips", headers=await headers_for(db_async, employee)
    )
    assert no_mfa.status_code == 403  # payslips need two-step verification
    mine = await async_client.get(f"{API}/me/payslips", headers=own)
    assert mine.status_code == 200, mine.text
    [slip] = mine.json()["data"]
    pdf = await async_client.get(f"{API}/payslips/{slip['id']}/pdf", headers=own)
    assert pdf.status_code == 200, pdf.text
    assert pdf.content.startswith(b"%PDF")
    assert pdf.headers["x-payslip-sha256"] == slip["sha256"]
    other = await make_user(db_async)
    await assign_role(db_async, user=other, role=role)
    stranger = await async_client.get(
        f"{API}/payslips/{slip['id']}/pdf",
        headers=await headers_for(db_async, other, mfa=True),
    )
    assert stranger.status_code == 404


@pytest.mark.usefixtures("totp_keys")
async def test_bank_and_gl_files(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    headers, period_id, employee = await _issued_period(async_client, db_async)
    no_mfa = await async_client.post(
        f"{API}/periods/{period_id}/bank-transfer.csv",
        headers=await headers_for(db_async, await make_user(db_async, superuser=True)),
    )
    assert no_mfa.status_code == 403
    bank = await async_client.post(
        f"{API}/periods/{period_id}/bank-transfer.csv", headers=headers
    )
    assert bank.status_code == 200, bank.text
    rows = list(csv.DictReader(io.StringIO(bank.text)))
    assert rows[0]["Bank account"] == payslips.BANK_ACCOUNT_PLACEHOLDER
    assert rows[0]["Net amount"] == "2131.85"
    configured = await async_client.put(
        f"{API}/export-settings",
        headers=headers,
        json={
            "organisation_id": "gaa",
            "bank_columns": ["payroll_reference", "net_minor"],
            "gl_accounts": {"GROSS_PAY_EXPENSE": "6000", "NET_PAY_PAYABLE": "2100"},
        },
    )
    assert configured.status_code == 200, configured.text
    bank = await async_client.post(
        f"{API}/periods/{period_id}/bank-transfer.csv", headers=headers
    )
    assert bank.text.splitlines()[0] == "Payroll reference,Net (cents)"
    gl = await async_client.post(
        f"{API}/periods/{period_id}/gl-journal.csv", headers=headers
    )
    assert gl.status_code == 200, gl.text
    lines = list(csv.DictReader(io.StringIO(gl.text)))
    debits = sum(Decimal(r["debit"] or 0) for r in lines)
    credits = sum(Decimal(r["credit"] or 0) for r in lines)
    assert debits == credits == Decimal("2400.00") + Decimal("174.00")
    accounts = {r["account_key"]: r["account"] for r in lines}
    assert accounts["GROSS_PAY_EXPENSE"] == "6000"
    assert accounts["INCOME_TAX_PAYABLE"] == "UNMAPPED:INCOME_TAX_PAYABLE"
