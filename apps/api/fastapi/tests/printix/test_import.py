"""Ticket import: dry run first, all-or-nothing apply, clear error report."""

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.printix import service
from src.printix.models import PrintixTicket

from .support import make_event, make_ticket

pytestmark = pytest.mark.usefixtures("db_async")


async def count_tickets(db: AsyncSession, event_id: object) -> int:
    return int(
        await db.scalar(
            select(func.count())
            .select_from(PrintixTicket)
            .where(PrintixTicket.event_id == event_id)
        )
        or 0
    )


async def test_dry_run_reports_what_would_be_added_and_writes_nothing(
    db_async: AsyncSession,
) -> None:
    event = await make_event(db_async)

    report = await service.import_tickets(
        db_async, event.id, b"number,barcode\n001,PX1\n002,PX2\n", dry_run=True
    )

    assert report.dry_run is True
    assert report.applied is False
    assert report.rows == 2
    assert report.to_add == 2
    assert report.errors == []
    assert await count_tickets(db_async, event.id) == 0


async def test_apply_inserts_every_row_and_defaults_barcode_to_number(
    db_async: AsyncSession,
) -> None:
    event = await make_event(db_async)

    report = await service.import_tickets(
        db_async, event.id, b"number\n001\n002\n", dry_run=False
    )

    assert report.applied is True
    assert await count_tickets(db_async, event.id) == 2
    rows = (
        await db_async.execute(
            select(PrintixTicket.printed_number, PrintixTicket.barcode_value).where(
                PrintixTicket.event_id == event.id
            )
        )
    ).all()
    assert sorted(rows) == [("001", "001"), ("002", "002")]


async def test_any_error_refuses_the_whole_file(db_async: AsyncSession) -> None:
    event = await make_event(db_async)

    report = await service.import_tickets(
        db_async, event.id, b"number\n001\n001\n002\n", dry_run=False
    )

    assert report.applied is False
    assert [issue.line for issue in report.errors] == [3]
    assert await count_tickets(db_async, event.id) == 0


async def test_number_already_on_the_event_is_refused(db_async: AsyncSession) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001")

    report = await service.import_tickets(
        db_async, event.id, b"number\n001\n002\n", dry_run=True
    )

    assert report.applied is False
    assert len(report.errors) == 1
    assert report.errors[0].line == 2
    assert "already" in report.errors[0].message


async def test_barcode_already_on_the_event_is_refused(db_async: AsyncSession) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001", barcode="SHARED")

    report = await service.import_tickets(
        db_async, event.id, b"number,barcode\n009,SHARED\n", dry_run=True
    )

    assert report.applied is False
    assert report.errors[0].line == 2


async def test_same_number_on_another_event_is_fine(db_async: AsyncSession) -> None:
    first = await make_event(db_async, name="First")
    second = await make_event(db_async, name="Second")
    await make_ticket(db_async, first, "001")

    report = await service.import_tickets(
        db_async, second.id, b"number\n001\n", dry_run=False
    )

    assert report.applied is True
    assert await count_tickets(db_async, second.id) == 1


async def test_a_closed_event_takes_no_tickets(db_async: AsyncSession) -> None:
    from src.exceptions import AppException

    event = await make_event(db_async, status="closed")

    with pytest.raises(AppException) as raised:
        await service.import_tickets(db_async, event.id, b"number\n1\n", dry_run=True)

    assert raised.value.status_code == 409


async def test_oversize_file_is_refused(db_async: AsyncSession) -> None:
    from src.exceptions import AppException
    from src.printix import constants

    event = await make_event(db_async)
    big = b"number\n" + b"1\n" * (constants.MAX_IMPORT_BYTES // 2 + 1)

    with pytest.raises(AppException) as raised:
        await service.import_tickets(db_async, event.id, big, dry_run=True)

    assert raised.value.status_code == 413


async def test_too_many_errors_are_capped_and_flagged(db_async: AsyncSession) -> None:
    from src.printix import constants

    event = await make_event(db_async)
    body = b"".join(b",X\n" for _ in range(constants.MAX_REPORTED_ERRORS + 5))

    report = await service.import_tickets(
        db_async, event.id, b"number\n" + body, dry_run=True
    )

    assert len(report.errors) == constants.MAX_REPORTED_ERRORS
    assert report.errors_truncated is True
    assert report.applied is False


async def test_a_new_barcode_equal_to_an_existing_printed_number_is_refused(
    db_async: AsyncSession,
) -> None:
    """A barcode lookup wins, so this would shadow the existing ticket's number."""
    event = await make_event(db_async)
    await make_ticket(db_async, event, "123", barcode="PX-OLD")

    report = await service.import_tickets(
        db_async, event.id, b"number,barcode\n555,123\n", dry_run=True
    )

    assert report.applied is False
    assert report.errors[0].line == 2


async def test_a_new_number_equal_to_an_existing_barcode_is_refused(
    db_async: AsyncSession,
) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001", barcode="777")

    report = await service.import_tickets(
        db_async, event.id, b"number\n777\n", dry_run=True
    )

    assert report.applied is False
    assert report.errors[0].line == 2


async def test_a_dry_run_without_a_barcode_column_warns(db_async: AsyncSession) -> None:
    event = await make_event(db_async)

    report = await service.import_tickets(
        db_async, event.id, b"number\n001\n", dry_run=True
    )

    assert report.applied is False
    assert report.warnings
    assert "barcode" in report.warnings[0]


async def test_a_file_with_a_barcode_column_has_no_warning(
    db_async: AsyncSession,
) -> None:
    event = await make_event(db_async)

    report = await service.import_tickets(
        db_async, event.id, b"number,barcode\n001,PX-001\n", dry_run=True
    )

    assert report.warnings == []
