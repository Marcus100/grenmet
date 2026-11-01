"""Payroll slice 2: gross pay from dated basic pay and pay item rates.

Synthetic people and amounts only (minor units, XCD cents).
"""

import uuid
from collections.abc import Iterator
from datetime import date
from decimal import Decimal
from typing import Any

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.config import auth_settings
from src.auth.models import RoleAssignmentScope
from src.hr.payroll import overtime, pricing
from src.hr.payroll.models import PayItemMethod, RateKind
from src.hr.payroll.schemas import PayLinePublic
from tests.factories import make_user
from tests.hr.payroll_setup import (
    API,
    calendar_and_period,
    departments,
    employee_in,
    headers_for,
    lines,
    payroll_user,
    worked_shift,
)
from tests.hr.test_payroll_inputs import HoursOverEight

SEPTEMBER = date(2026, 9, 1)
MONEY_WORDS = ("amount", "rate", "multiplier", "gross", "salary", "basic")


@pytest.fixture
def totp_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )


@pytest.fixture
def band_engine() -> Iterator[None]:
    previous = overtime.install(HoursOverEight())
    yield
    overtime.install(previous)


async def _basic(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    user_id: uuid.UUID,
    *,
    basis: str,
    amount_minor: int,
    hours: str = "173.33",
) -> httpx.Response:
    return await client.post(
        f"{API}/basic-pay",
        headers=headers,
        json={
            "organisation_id": "gaa",
            "user_id": str(user_id),
            "pay_basis": basis,
            "amount_minor": amount_minor,
            "standard_monthly_hours": hours,
            "effective_from": "2026-01-01",
        },
    )


async def _amounts(
    client: httpx.AsyncClient, headers: dict[str, str], period_id: str
) -> dict[str, Any]:
    response = await client.get(f"{API}/periods/{period_id}/amounts", headers=headers)
    assert response.status_code == 200, response.text
    data: dict[str, Any] = response.json()
    return data


def _by_code(data: dict[str, Any]) -> dict[str, int | None]:
    totals: dict[str, int | None] = {}
    for line in data["lines"]:
        totals[line["pay_item_code"]] = line["amount_minor"]
    return totals


@pytest.mark.usefixtures("totp_keys", "band_engine")
async def test_hourly_worker_gross_from_rates(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    ops, _, accounts = await departments(db_async)
    employee = await employee_in(db_async, ops)
    admin_user = await make_user(db_async, superuser=True)
    admin = await headers_for(db_async, admin_user, mfa=True)
    # EC$20.25 an hour; a 12-hour weekday shift by a shift worker.
    created = await _basic(
        async_client, admin, employee.id, basis="HOURLY", amount_minor=2025
    )
    assert created.status_code == 201, created.text
    await async_client.put(
        f"{API}/profiles/{employee.id}",
        headers=admin,
        json={"organisation_id": "gaa", "shift_worker": True},
    )
    await worked_shift(
        db_async,
        employee,
        ops,
        day=date(2026, 9, 8),
        arrive="2026-09-08T07:00:00-04:00",
        depart="2026-09-08T19:00:00-04:00",
    )
    _, period_id = await calendar_and_period(
        async_client, admin, accounts.id, SEPTEMBER
    )
    await async_client.post(f"{API}/periods/{period_id}/computation", headers=admin)
    data = await _amounts(async_client, admin, period_id)
    amounts = _by_code(data)
    assert amounts["BASE"] == 8 * 2025  # 16200
    assert amounts["OT_TIME_AND_HALF"] == 12150  # 4 h x 2025 x 1.5
    assert amounts["MEAL"] == 4000
    assert data["gross_minor"] == 16200 + 12150 + 4000
    assert data["employees"][0]["unpriced_line_count"] == 0


@pytest.mark.usefixtures("totp_keys", "band_engine")
async def test_salaried_worker_gets_basic_and_priced_overtime(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    ops, _, accounts = await departments(db_async)
    employee = await employee_in(db_async, ops)
    admin = await headers_for(
        db_async, await make_user(db_async, superuser=True), mfa=True
    )
    created = await _basic(
        async_client,
        admin,
        employee.id,
        basis="SALARIED",
        amount_minor=500_000,
        hours="160",
    )
    assert created.status_code == 201, created.text
    await worked_shift(
        db_async,
        employee,
        ops,
        day=date(2026, 9, 9),
        arrive="2026-09-09T07:00:00-04:00",
        depart="2026-09-09T19:00:00-04:00",
    )
    _, period_id = await calendar_and_period(
        async_client, admin, accounts.id, SEPTEMBER
    )
    await async_client.post(f"{API}/periods/{period_id}/computation", headers=admin)
    amounts = _by_code(await _amounts(async_client, admin, period_id))
    assert amounts["BASIC"] == 500_000  # a full calendar month
    assert amounts["BASE"] is None  # covered by the basic salary, never zero
    # Hourly equivalent 500000 / 160 = 3125; 4 h x 3125 x 1.5.
    assert amounts["OT_TIME_AND_HALF"] == 18750
    # The quantity list shows the salary line; the quantity CSV leaves it out.
    quantity_lines = await lines(async_client, admin, period_id)
    assert "BASIC" in {row["pay_item_code"] for row in quantity_lines}


async def test_department_readers_never_receive_amounts(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    fields = set(PayLinePublic.model_fields)
    assert not {f for f in fields if any(word in f for word in MONEY_WORDS)}
    spec = (await async_client.get("/api/v1/openapi.json")).json()
    if spec.get("components"):
        properties = spec["components"]["schemas"]["PayLinePublic"]["properties"]
        assert not {p for p in properties if any(w in p for w in MONEY_WORDS)}

    ops, _, accounts = await departments(db_async)
    admin = await headers_for(db_async, await make_user(db_async, superuser=True))
    _, period_id = await calendar_and_period(
        async_client, admin, accounts.id, SEPTEMBER
    )
    scoped = await payroll_user(
        db_async,
        "hr.payroll.read.department",
        "hr.payroll.read.amounts",
        department_id=ops.id,
        scope=RoleAssignmentScope.DEPARTMENT,
        scoped_department=ops.id,
    )
    scoped_headers = await headers_for(db_async, scoped)
    refused = await async_client.get(
        f"{API}/periods/{period_id}/amounts", headers=scoped_headers
    )
    assert refused.status_code == 403
    listed = await async_client.get(
        f"{API}/periods/{period_id}/lines", headers=scoped_headers
    )
    assert listed.status_code == 200
    reader = await payroll_user(
        db_async, "hr.payroll.read.amounts", department_id=ops.id
    )
    allowed = await async_client.get(
        f"{API}/periods/{period_id}/amounts",
        headers=await headers_for(db_async, reader),
    )
    assert allowed.status_code == 200, allowed.text


@pytest.mark.usefixtures("totp_keys")
async def test_rates_and_basic_pay_need_the_key_and_mfa(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    ops, _, _ = await departments(db_async)
    employee = await employee_in(db_async, ops)
    manager = await payroll_user(
        db_async, "hr.payroll.rates.manage", department_id=ops.id
    )
    without_mfa = await _basic(
        async_client,
        await headers_for(db_async, manager),
        employee.id,
        basis="HOURLY",
        amount_minor=2000,
    )
    assert without_mfa.status_code == 403
    mfa = await headers_for(db_async, manager, mfa=True)
    assert (
        await _basic(async_client, mfa, employee.id, basis="HOURLY", amount_minor=2000)
    ).status_code == 201
    own = await _basic(async_client, mfa, manager.id, basis="HOURLY", amount_minor=9999)
    assert own.status_code == 403
    # A later rise ends the open-ended row the day before.
    rise = await async_client.post(
        f"{API}/basic-pay",
        headers=mfa,
        json={
            "organisation_id": "gaa",
            "user_id": str(employee.id),
            "pay_basis": "HOURLY",
            "amount_minor": 2100,
            "standard_monthly_hours": "173.33",
            "effective_from": "2026-07-01",
        },
    )
    assert rise.status_code == 201, rise.text
    history = (
        await async_client.get(
            f"{API}/basic-pay?organisation_id=gaa&user_id={employee.id}", headers=mfa
        )
    ).json()["data"]
    assert [(row["effective_from"], row["effective_to"]) for row in history] == [
        ("2026-01-01", "2026-06-30"),
        ("2026-07-01", None),
    ]
    nobody = await payroll_user(
        db_async, "hr.payroll.read.department", department_id=ops.id
    )
    hidden = await async_client.get(
        f"{API}/basic-pay?organisation_id=gaa",
        headers=await headers_for(db_async, nobody),
    )
    assert hidden.status_code == 403
    rates = (
        await async_client.get(f"{API}/rates?organisation_id=gaa", headers=mfa)
    ).json()["data"]
    assert {r["rule_state"] for r in rates} == {"PROVISIONAL"}
    assert all(r["source_reference"] for r in rates)


def test_pricing_rounds_half_up_per_line() -> None:
    basic = pricing.BasicPayFacts(
        id=1,
        pay_basis="SALARIED",
        amount_minor=100_001,
        standard_monthly_hours=Decimal(160),
        effective_from=date(2026, 1, 1),
        effective_to=None,
    )
    assert basic.hourly_rate() == Decimal("625.0063")
    multiplier = pricing.RateFacts(
        id=1,
        rate_kind=RateKind.HOURLY_MULTIPLIER,
        multiplier=Decimal("1.5"),
        amount_minor=None,
        guaranteed_hours=None,
        guaranteed_multiplier=None,
        effective_from=date(2026, 1, 1),
        effective_to=None,
    )
    price = pricing.price_line(
        quantity=Decimal("0.5"),
        method=PayItemMethod.OVERTIME_BAND,
        rate=multiplier,
        basic=basic,
    )
    assert price.amount_minor == 469  # 468.7547 rounds up
    call_out = pricing.RateFacts(
        id=2,
        rate_kind=RateKind.FIXED_AMOUNT,
        multiplier=None,
        amount_minor=4000,
        guaranteed_hours=Decimal(4),
        guaranteed_multiplier=Decimal("1.5"),
        effective_from=date(2026, 1, 1),
        effective_to=None,
    )
    hourly = pricing.BasicPayFacts(
        id=3,
        pay_basis="HOURLY",
        amount_minor=2000,
        standard_monthly_hours=Decimal(160),
        effective_from=date(2026, 1, 1),
        effective_to=None,
    )
    assert (
        pricing.price_line(
            quantity=Decimal(1),
            method=PayItemMethod.MANUAL,
            rate=call_out,
            basic=hourly,
        ).amount_minor
        == 4000 + 12000
    )
    assert (
        pricing.price_line(
            quantity=Decimal(1), method=PayItemMethod.MANUAL, rate=None, basic=hourly
        ).amount_minor
        is None
    )
    half = pricing.month_fraction(basic, date(2026, 9, 16), date(2026, 9, 30))
    assert pricing.basic_salary_minor(basic, half) == 50001  # 15/30 of 100001 = 50000.5


@pytest.mark.usefixtures("totp_keys")
async def test_hourly_staff_on_a_monthly_calendar_need_an_override(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    ops, _, accounts = await departments(db_async)
    employee = await employee_in(db_async, ops)
    admin = await headers_for(
        db_async, await make_user(db_async, superuser=True), mfa=True
    )
    await calendar_and_period(async_client, admin, accounts.id, SEPTEMBER)  # monthly
    refused = await _basic(
        async_client, admin, employee.id, basis="HOURLY", amount_minor=2000
    )
    assert refused.status_code == 409
    assert "fortnightly" in refused.json()["detail"]
    salaried = await _basic(
        async_client, admin, employee.id, basis="SALARIED", amount_minor=400_000
    )
    assert salaried.status_code == 201  # monthly-rated staff may be paid monthly
    other = await employee_in(db_async, ops)
    overridden = await async_client.post(
        f"{API}/basic-pay",
        headers=admin,
        json={
            "organisation_id": "gaa",
            "user_id": str(other.id),
            "pay_basis": "HOURLY",
            "amount_minor": 2000,
            "standard_monthly_hours": "173.33",
            "effective_from": "2026-01-01",
            "calendar_override_reason": "Agreed with the union for this contract",
        },
    )
    assert overridden.status_code == 201, overridden.text
    assert overridden.json()["reason"].startswith("Calendar override:")


def test_fortnightly_basic_is_twelve_twenty_sixths_of_a_month() -> None:
    basic = pricing.BasicPayFacts(
        id=1,
        pay_basis="SALARIED",
        amount_minor=520_000,
        standard_monthly_hours=Decimal(160),
        effective_from=date(2026, 1, 1),
        effective_to=None,
    )
    full = pricing.period_fraction(
        basic, date(2026, 9, 13), date(2026, 9, 26), "FORTNIGHTLY"
    )
    assert pricing.basic_salary_minor(basic, full) == 240_000  # 520000 x 12/26
    started = pricing.BasicPayFacts(
        **{**basic.__dict__, "effective_from": date(2026, 9, 20)}
    )
    half = pricing.period_fraction(
        started, date(2026, 9, 13), date(2026, 9, 26), "FORTNIGHTLY"
    )
    assert pricing.basic_salary_minor(started, half) == 120_000  # 7 of 14 days


def _json_values(node: object) -> list[object]:
    """Every scalar value anywhere in a decoded JSON document."""
    if isinstance(node, dict):
        return [v for child in node.values() for v in _json_values(child)]
    if isinstance(node, list):
        return [v for child in node for v in _json_values(child)]
    return [node]


@pytest.mark.usefixtures("totp_keys")
async def test_money_history_needs_organisation_wide_amounts_and_holds_no_money(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    ops, _, _ = await departments(db_async)
    employee = await employee_in(db_async, ops)
    admin_user = await make_user(db_async, superuser=True)
    admin = await headers_for(db_async, admin_user, mfa=True)
    created = await _basic(
        async_client, admin, employee.id, basis="HOURLY", amount_minor=2468
    )
    assert created.status_code == 201, created.text
    own = await _basic(
        async_client, admin, admin_user.id, basis="HOURLY", amount_minor=1
    )
    assert own.status_code == 403  # superusers do not set their own pay either
    items = (await async_client.get(f"{API}/items", headers=admin)).json()["data"]
    rate = await async_client.post(
        f"{API}/rates",
        headers=admin,
        json={
            "pay_item_id": items[0]["id"],
            "rate_kind": "HOURLY_MULTIPLIER",
            "multiplier": "1.25",
            "effective_from": "2030-01-01",
            "rule_state": "CONFIRMED",
        },
    )
    assert rate.status_code == 201, rate.text
    assert rate.json()["rule_state"] == "PROVISIONAL"

    scoped = await payroll_user(
        db_async,
        "hr.payroll.read.department",
        "hr.payroll.read.amounts",
        "audit.view_sensitive",
        department_id=ops.id,
        scope=RoleAssignmentScope.DEPARTMENT,
        scoped_department=ops.id,
    )
    refused = await async_client.get(
        "/api/v1/audit/payroll_money/gaa", headers=await headers_for(db_async, scoped)
    )
    assert refused.status_code == 403
    reader = await payroll_user(
        db_async, "hr.payroll.read.amounts", department_id=ops.id
    )
    history = await async_client.get(
        "/api/v1/audit/payroll_money/gaa", headers=await headers_for(db_async, reader)
    )
    assert history.status_code == 200, history.text
    # A bare substring check flaked when 2468 appeared inside a random id; look
    # for the amount only as a whole JSON value instead.
    values = _json_values(history.json())
    assert 2468 not in values
    assert "2468" not in values
    assert "amount_minor" not in history.text
