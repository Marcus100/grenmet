"""Terminal punch import over HTTP (ADR-0040): journey, scope and upload limits."""

import uuid
from datetime import date, timedelta

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import RoleAssignmentScope
from src.auth.utils import create_access_token
from src.hr.attendance import terminal_service
from src.hr.models import Department
from src.hr.roster.models import ShiftCatalog, ShiftCategory
from src.hr.roster.schemas import (
    RosterAssignmentBulkCreate,
    RosterAssignmentInput,
    RosterPeriodCreate,
)
from src.hr.roster.service import (
    bulk_upsert_roster_assignments,
    create_roster_period,
    publish_roster_period,
)
from tests.factories import (
    assign_role,
    make_employee,
    make_role_with_permission,
    make_user,
)

FIXTURE_REASON = "Fixture roster; roster rules are not under test"
DEPT = "dept_terminal_api"
OTHER = "dept_terminal_api_other"
DAY = date(2026, 7, 6)
API = "/api/v1/hr/attendance"


async def _world(db: AsyncSession) -> tuple[str, str]:
    """A roster with one employee on a day shift; returns (employee id, manager id)."""
    for dept in (DEPT, OTHER):
        if not await db.get(Department, dept):
            db.add(Department(organisation_id="gaa", code=dept, id=dept, name=dept))
    if not await db.get(ShiftCatalog, "TAD"):
        db.add(
            ShiftCatalog(
                code="TAD",
                label="Terminal API day",
                category=ShiftCategory.WORK,
                start_time="05:30",
                end_time="14:00",
                ends_next_day=False,
            )
        )
    await db.commit()
    manager = await make_user(db, superuser=True)
    employee = await make_user(db)
    employee.first_name = "Ada"
    employee.last_name = "Officer"
    await db.commit()
    await make_employee(db, user=employee, department_id=DEPT)
    role, _ = await make_role_with_permission(db, "timesheet.submit.self")
    await assign_role(db, user=employee, role=role, scope=RoleAssignmentScope.SELF)
    period = await create_roster_period(
        session=db,
        current_user=manager,
        period_in=RosterPeriodCreate(
            department_id=DEPT,
            period_start=date(2026, 7, 1),
            period_end=date(2026, 7, 31),
        ),
    )
    await bulk_upsert_roster_assignments(
        session=db,
        current_user=manager,
        payload=RosterAssignmentBulkCreate(
            roster_period_id=period.id,
            assignments=[
                RosterAssignmentInput(
                    user_id=employee.id, assignment_date=DAY, shift_code="TAD"
                )
            ],
        ),
    )
    await publish_roster_period(
        session=db,
        current_user=manager,
        period_id=period.id,
        rule_override_reason=FIXTURE_REASON,
    )
    return str(employee.id), str(manager.id)


async def _upload(
    client: httpx.AsyncClient,
    headers: dict[str, str],
    body: bytes,
    *,
    department_id: str = DEPT,
) -> httpx.Response:
    return await client.post(
        f"{API}/terminal-imports",
        headers=headers,
        data={"department_id": department_id, "terminal": "Main gate"},
        files={"file": ("export.txt", body, "text/plain")},
    )


async def test_map_import_review_reprocess_over_the_api(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    employee_id, _ = await _world(db_async)
    headers = superuser_token_headers_async

    mapped = await async_client.post(
        f"{API}/terminal-users",
        headers=headers,
        json={"department_id": DEPT, "device_user_id": "7", "user_id": employee_id},
    )
    assert mapped.status_code == 201
    assert mapped.json()["employee_name"] == "Ada Officer"
    mapping_id = mapped.json()["id"]

    listed = await async_client.get(
        f"{API}/terminal-users", headers=headers, params={"department_id": DEPT}
    )
    assert listed.json()["count"] == 1

    first = await _upload(
        async_client,
        headers,
        b"7\t2026-07-06 05:31:02\t1\t0\t0\t0\n9\t2026-07-06 14:02:00\t1\n",
    )
    assert first.status_code == 201
    body = first.json()
    assert body["new_punches"] == 2
    assert body["duplicates"] == 0
    assert body["outcomes"]["recorded"] == 1
    assert body["outcomes"]["unmapped"] == 1
    assert {row["outcome"] for row in body["rows"]} == {"RECORDED", "UNMAPPED"}

    again = await _upload(
        async_client,
        headers,
        b"7\t2026-07-06 05:31:02\t1\t0\t0\t0\n9\t2026-07-06 14:02:00\t1\n",
    )
    assert again.json()["new_punches"] == 0
    assert again.json()["duplicates"] == 2
    assert again.json()["rows"] == []

    attention = await async_client.get(
        f"{API}/terminal-punches",
        headers=headers,
        params={"department_id": DEPT, "outcome": "UNMAPPED"},
    )
    assert attention.status_code == 200
    assert attention.json()["count"] == 1
    assert attention.json()["data"][0]["device_user_id"] == "9"

    removed = await async_client.delete(
        f"{API}/terminal-users/{mapping_id}", headers=headers
    )
    assert removed.status_code == 204
    assert (
        await async_client.get(
            f"{API}/terminal-users", headers=headers, params={"department_id": DEPT}
        )
    ).json()["count"] == 0

    remapped = await async_client.post(
        f"{API}/terminal-users",
        headers=headers,
        json={"department_id": DEPT, "device_user_id": "9", "user_id": employee_id},
    )
    assert remapped.status_code == 201

    reprocessed = await async_client.post(
        f"{API}/terminal-punches/reprocess",
        headers=headers,
        json={"department_id": DEPT},
    )
    assert reprocessed.status_code == 200
    assert reprocessed.json()["processed"] == 1
    assert reprocessed.json()["outcomes"]["recorded"] == 1


async def test_department_scoped_manager_cannot_reach_another_department(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    await _world(db_async)
    manager = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "roster.manage")
    await assign_role(
        db_async,
        user=manager,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=OTHER,
    )
    token = create_access_token(manager.id, expires_delta=timedelta(minutes=30))
    headers = {"Authorization": f"Bearer {token}"}

    listed = await async_client.get(
        f"{API}/terminal-users", headers=headers, params={"department_id": DEPT}
    )
    assert listed.status_code == 403

    imported = await _upload(async_client, headers, b"7 2026-07-06 05:31:00\n")
    assert imported.status_code == 403

    own = await async_client.get(
        f"{API}/terminal-users", headers=headers, params={"department_id": OTHER}
    )
    assert own.status_code == 200


async def test_employee_without_roster_authority_is_refused(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    normal_user_token_headers_async: dict[str, str],
) -> None:
    await _world(db_async)

    response = await async_client.get(
        f"{API}/terminal-punches",
        headers=normal_user_token_headers_async,
        params={"department_id": DEPT},
    )

    assert response.status_code == 403


async def test_upload_limits_and_bad_files_are_refused(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    await _world(db_async)
    headers = superuser_token_headers_async

    empty = await _upload(async_client, headers, b"\n")
    assert empty.status_code == 400

    too_big = await _upload(
        async_client,
        headers,
        b"7 2026-07-06 05:31:00\n" + b"#" * (terminal_service.MAX_IMPORT_BYTES),
    )
    assert too_big.status_code == 413


async def test_unknown_mapping_is_not_found_and_bad_device_id_is_invalid(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    employee_id, _ = await _world(db_async)
    headers = superuser_token_headers_async

    missing = await async_client.delete(
        f"{API}/terminal-users/{uuid.uuid4()}", headers=headers
    )
    assert missing.status_code == 404

    spaced = await async_client.post(
        f"{API}/terminal-users",
        headers=headers,
        json={"department_id": DEPT, "device_user_id": "a b", "user_id": employee_id},
    )
    assert spaced.status_code == 422


async def test_attention_filter_rejects_recorded_outcome_and_bad_dates(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    await _world(db_async)
    headers = superuser_token_headers_async

    not_attention = await async_client.get(
        f"{API}/terminal-punches",
        headers=headers,
        params={"department_id": DEPT, "outcome": "RECORDED"},
    )
    assert not_attention.status_code == 422

    reversed_dates = await async_client.get(
        f"{API}/terminal-punches",
        headers=headers,
        params={
            "department_id": DEPT,
            "from_date": "2026-07-10",
            "to_date": "2026-07-01",
        },
    )
    assert reversed_dates.status_code == 400
