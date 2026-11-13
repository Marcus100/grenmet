"""Roster rule API (#380): rule sets, 409 warnings with override, coverage."""

from datetime import date, timedelta

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.config import settings
from src.hr.models import Department, EmploymentRecord
from src.hr.roster.models import RosterPeriod, ShiftCatalog, ShiftCategory
from src.hr.roster.schemas import (
    RosterAssignmentBulkCreate,
    RosterAssignmentInput,
    RosterPeriodCreate,
)
from src.hr.roster.service import bulk_upsert_roster_assignments, create_roster_period
from tests.factories import make_employee, make_user

API = f"{settings.API_V1_STR}/hr/rosters"
DEPT = "dept_rules_api"
START = date(2027, 3, 1)


async def _setup(db: AsyncSession) -> tuple[User, RosterPeriod]:
    if not await db.get(Department, DEPT):
        db.add(Department(organisation_id="gaa", code=DEPT, id=DEPT, name="Rules API"))
    if not await db.get(ShiftCatalog, "D"):
        db.add(
            ShiftCatalog(
                code="D",
                label="Day",
                category=ShiftCategory.WORK,
                start_time="08:00",
                end_time="16:00",
            )
        )
    await db.commit()
    manager = await make_user(db, superuser=True)
    staff = await make_user(db)
    await make_employee(db, user=staff, department_id=DEPT)
    period = await create_roster_period(
        session=db,
        current_user=manager,
        period_in=RosterPeriodCreate(
            department_id=DEPT, period_start=START, period_end=START + timedelta(27)
        ),
    )
    await bulk_upsert_roster_assignments(
        session=db,
        current_user=manager,
        payload=RosterAssignmentBulkCreate(
            roster_period_id=period.id,
            assignments=[
                RosterAssignmentInput(
                    user_id=staff.id,
                    assignment_date=START + timedelta(days=n),
                    shift_code="D",
                )
                for n in range(5)
            ],
        ),
    )
    return staff, period


async def test_publish_returns_warnings_then_accepts_a_reason(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    staff, period = await _setup(db_async)
    url = f"{API}/periods/{period.id}/publish"
    response = await async_client.patch(url, headers=superuser_token_headers_async)
    assert response.status_code == 409
    body = response.json()
    assert body["code"] == "ROSTER_RULE_WARNINGS"
    assert body["context"] == "PUBLISH"
    codes = {v["code"] for v in body["violations"]}
    assert "MAX_CONSECUTIVE_DAYS" in codes
    assert all(v["user_id"] == str(staff.id) for v in body["violations"])

    blank = await async_client.patch(
        url, headers=superuser_token_headers_async, json={"rule_override_reason": " "}
    )
    assert blank.status_code == 409
    response = await async_client.patch(
        url,
        headers=superuser_token_headers_async,
        json={"rule_override_reason": "Short-staffed during the audit"},
    )
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "PUBLISHED"

    overrides = await async_client.get(
        f"{API}/departments/{DEPT}/rule-overrides",
        headers=superuser_token_headers_async,
    )
    assert overrides.status_code == 200
    [override] = overrides.json()["data"]
    assert override["context"] == "PUBLISH"
    assert override["reason"] == "Short-staffed during the audit"
    assert "MAX_CONSECUTIVE_DAYS" in override["rule_codes"]
    assert override["overridden_by_name"]


async def test_rule_check_reports_the_effective_rule_set(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    _, period = await _setup(db_async)
    response = await async_client.get(
        f"{API}/periods/{period.id}/rule-check", headers=superuser_token_headers_async
    )
    assert response.status_code == 200
    body = response.json()
    assert body["count"] == len(body["violations"]) >= 1
    assert body["rule_set"]["max_consecutive_shifts"] == 3
    assert body["rules"]["max_consecutive_days"] == 3
    assert body["rules"]["min_rest_hours"] is None


async def test_rule_set_endpoints_round_trip(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    await _setup(db_async)
    headers = superuser_token_headers_async
    org = await async_client.get(f"{API}/organisations/gaa/rule-set", headers=headers)
    assert org.status_code == 200
    payload = org.json()
    assert (
        payload["shift_weekly_hours"] == "40.00"
        or float(payload["shift_weekly_hours"]) == 40
    )
    for key in (
        "organisation_id",
        "department_id",
        "source",
        "updated_at",
        "updated_by_user_id",
    ):
        payload.pop(key)
    payload["notice_days"] = 14
    saved = await async_client.put(
        f"{API}/organisations/gaa/rule-set", headers=headers, json=payload
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["source"] == "ORGANISATION"

    dept = await async_client.get(f"{API}/departments/{DEPT}/rule-set", headers=headers)
    assert dept.json()["source"] == "ORGANISATION"
    assert dept.json()["notice_days"] == 14

    payload["work_pattern"] = "WEEKDAYS"
    put = await async_client.put(
        f"{API}/departments/{DEPT}/rule-set", headers=headers, json=payload
    )
    assert put.status_code == 200
    assert put.json()["source"] == "DEPARTMENT"
    assert put.json()["work_pattern"] == "WEEKDAYS"

    bad = await async_client.put(
        f"{API}/departments/{DEPT}/rule-set",
        headers=headers,
        json={**payload, "saturday_window_start": "13:00"},
    )
    assert bad.status_code == 422

    deleted = await async_client.delete(
        f"{API}/departments/{DEPT}/rule-set", headers=headers
    )
    assert deleted.status_code == 204
    again = await async_client.get(
        f"{API}/departments/{DEPT}/rule-set", headers=headers
    )
    assert again.json()["source"] == "ORGANISATION"


async def test_staff_cannot_edit_rules_or_coverage(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    normal_user_token_headers_async: dict[str, str],
) -> None:
    staff, _ = await _setup(db_async)
    headers = normal_user_token_headers_async
    put = await async_client.put(
        f"{API}/organisations/gaa/rule-set", headers=headers, json={}
    )
    assert put.status_code == 403
    profile = await async_client.put(
        f"{API}/employees/{staff.id}/rule-profile",
        headers=headers,
        json={"union_covered": False},
    )
    assert profile.status_code == 403
    listing = await async_client.get(
        f"{API}/departments/{DEPT}/rule-overrides", headers=headers
    )
    assert listing.status_code == 403


async def test_coverage_profile_is_listed_and_updated(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    staff, _ = await _setup(db_async)
    headers = superuser_token_headers_async
    listing = await async_client.get(
        f"{API}/departments/{DEPT}/rule-profiles", headers=headers
    )
    assert listing.status_code == 200
    [row] = [r for r in listing.json()["data"] if r["user_id"] == str(staff.id)]
    assert row["union_covered"] is True
    assert row["worker_type"] is None
    assert row["effective_worker_type"] == "SHIFT"

    put = await async_client.put(
        f"{API}/employees/{staff.id}/rule-profile",
        headers=headers,
        json={"union_covered": False, "worker_type": "NON_SHIFT"},
    )
    assert put.status_code == 200
    assert put.json()["effective_worker_type"] == "NON_SHIFT"
    employment = await db_async.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == staff.id)
    )
    assert employment is not None
    await db_async.refresh(employment)
    assert employment.union_covered is False
    assert employment.rule_worker_type == "NON_SHIFT"
