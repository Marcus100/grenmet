"""HR list pagination — count reflects the true total, page/size window the rows."""

from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession

from src.hr.leave.schemas import LeaveRequestCreate
from src.hr.leave.service import create_leave_request, list_leave_requests
from tests.factories import (
    assign_role,
    make_department,
    make_role_with_permission,
    make_user,
)


async def _seed_leave_requests(db: AsyncSession, n: int):
    user = await make_user(db)
    dept = await make_department(db, "dept_pagination")
    role, _ = await make_role_with_permission(db, "leave.request.create.self")
    await assign_role(db, user=user, role=role)
    for _ in range(n):
        await create_leave_request(
            session=db,
            current_user=user,
            payload=LeaveRequestCreate(
                department_id=dept.id,
                leave_type="VACATION",
                start_date="2026-07-01",
                end_date="2026-07-02",
                days_requested=Decimal("1.0"),
            ),
        )
    return user


async def test_count_is_true_total_not_page_length(db_async: AsyncSession) -> None:
    user = await _seed_leave_requests(db_async, 5)

    rows, total = await list_leave_requests(
        session=db_async, current_user=user, skip=0, limit=2
    )

    assert total == 5  # true total, independent of the page window
    assert len(rows) == 2  # limited to the requested page size


async def test_offset_windows_the_result(db_async: AsyncSession) -> None:
    user = await _seed_leave_requests(db_async, 5)

    page1, total1 = await list_leave_requests(
        session=db_async, current_user=user, skip=0, limit=2
    )
    page2, total2 = await list_leave_requests(
        session=db_async, current_user=user, skip=2, limit=2
    )
    tail, _ = await list_leave_requests(
        session=db_async, current_user=user, skip=4, limit=2
    )

    assert total1 == total2 == 5
    ids = {r.id for r in page1} | {r.id for r in page2} | {r.id for r in tail}
    assert len(ids) == 5  # non-overlapping pages cover the whole set
    assert len(tail) == 1  # last page has the remainder
