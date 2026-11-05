"""Statutory table provenance carries display names, not just user ids.

Synthetic people only. A name is first and last name; nothing else about the
person (no email, no ids beyond the existing ones) is added to the response.
"""

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from tests.factories import make_user
from tests.hr.payroll_setup import API, headers_for
from tests.hr.test_payroll_deductions import _confirm


@pytest.fixture(autouse=True)
def totp_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    from cryptography.fernet import Fernet

    from src.auth.config import auth_settings

    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )


def _display(user: User) -> str:
    return f"{user.first_name} {user.last_name}".strip()


async def test_tables_list_names_creator_and_confirmer(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    creator = await make_user(db_async, superuser=True)
    confirmer_user = await make_user(db_async, superuser=True)
    creator_headers = await headers_for(db_async, creator, mfa=True)
    confirmer_headers = await headers_for(db_async, confirmer_user, mfa=True)
    created = await async_client.post(
        f"{API}/tax-tables",
        headers=creator_headers,
        json={
            "organisation_id": "gaa",
            "code": "NAMED_TAX",
            "name": "Named tax table",
            "annual_allowance_minor": 3600000,
            "effective_from": "2031-01-01",
            "bands": [{"width_minor": 2400000, "rate": "0.10"}, {"rate": "0.28"}],
        },
    )
    assert created.status_code == 201, created.text
    assert created.json()["created_by_name"] == _display(creator)
    assert created.json()["confirmed_by_name"] is None
    await _confirm(
        async_client,
        confirmer_headers,
        "tax",
        created.json()["id"],
    )
    tables = await async_client.get(
        f"{API}/statutory-tables?organisation_id=gaa", headers=confirmer_headers
    )
    assert tables.status_code == 200, tables.text
    row = next(t for t in tables.json()["tax_tables"] if t["code"] == "NAMED_TAX")
    assert row["created_by_name"] == _display(creator)
    assert row["confirmed_by_name"] == _display(confirmer_user)
    assert "@" not in row["created_by_name"]
    assert set(row) >= {"created_by_name", "confirmed_by_name"}


async def test_seeded_rows_without_a_user_have_null_names(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    reader = await headers_for(
        db_async, await make_user(db_async, superuser=True), mfa=True
    )
    tables = await async_client.get(
        f"{API}/statutory-tables?organisation_id=gaa", headers=reader
    )
    assert tables.status_code == 200, tables.text
    body = tables.json()
    rows = [
        *body["tax_tables"],
        *body["social_insurance"],
        *body["deduction_types"],
    ]
    assert rows
    for row in rows:
        if row["created_by_user_id"] is None:
            assert row["created_by_name"] is None
        else:
            assert isinstance(row["created_by_name"], str)
        if row["confirmed_by_user_id"] is None:
            assert row["confirmed_by_name"] is None


async def test_scheme_and_deduction_create_responses_name_the_creator(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    creator = await make_user(db_async, superuser=True)
    headers = await headers_for(db_async, creator, mfa=True)
    scheme = await async_client.post(
        f"{API}/social-insurance-schemes",
        headers=headers,
        json={
            "organisation_id": "gaa",
            "code": "NAMED_NIS",
            "name": "Named scheme",
            "employee_rate": "0.0625",
            "employer_rate": "0.0625",
            "monthly_ceiling_minor": 520000,
            "weekly_ceiling_minor": 120000,
            "effective_from": "2031-01-01",
        },
    )
    assert scheme.status_code == 201, scheme.text
    assert scheme.json()["created_by_name"] == _display(creator)
    kind = await async_client.post(
        f"{API}/deduction-types",
        headers=headers,
        json={
            "organisation_id": "gaa",
            "code": "NAMED_FIXED",
            "name": "Named fixed deduction",
            "kind": "FIXED",
            "employee_amount_minor": 1000,
            "effective_from": "2031-01-01",
        },
    )
    assert kind.status_code == 201, kind.text
    assert kind.json()["created_by_name"] == _display(creator)
    assert kind.json()["confirmed_by_name"] is None


async def test_names_stay_behind_the_tables_permission(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    outsider = await headers_for(db_async, await make_user(db_async), mfa=False)
    denied = await async_client.get(
        f"{API}/statutory-tables?organisation_id=gaa", headers=outsider
    )
    assert denied.status_code in {403, 404}
    assert "created_by_name" not in denied.text
