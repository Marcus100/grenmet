"""Printix organiser dashboard: live analytics, the scan list and the CSV export.

Every number is a SQL aggregate over ``ticket`` and ``scan_log`` (one query per
group, never one per row). Nothing here returns a barcode: a scan shows the
printed number of the ticket it matched, and a scan that matched no ticket shows
none. Time buckets follow the Grenada clock; Grenada has no daylight saving, so
five- and fifteen-minute buckets line up with UTC as well.
"""

import csv
import io
import uuid
from collections import defaultdict
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

from sqlalchemy import ColumnElement, Select, func, literal_column, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.utils.datetime import utc_now
from src.utils.timezones import DEFAULT_TIMEZONE, GRENADA

from . import service
from .constants import PrintixScanOutcome, PrintixTicketStatus
from .models import PrintixPairing, PrintixScanLog, PrintixTicket
from .schemas import (
    PrintixArrivalBucket,
    PrintixBusyPeriod,
    PrintixEventAnalytics,
    PrintixGateAnalytics,
    PrintixGatePhone,
    PrintixOfflineAnalytics,
    PrintixRefusalCount,
    PrintixScanItem,
    PrintixScanPage,
)

BUCKET = timedelta(minutes=5)
#: The chart shows at most this many five-minute periods (24 hours), the latest ones.
MAX_ARRIVAL_BUCKETS = 288
RATE_WINDOW = timedelta(minutes=10)
#: Gates (pairings) read for one event. An event holds at most 20 active codes.
MAX_PAIRINGS = 200
#: Rows per database round trip while the CSV streams.
EXPORT_BATCH = 500

REFUSAL_REASONS: tuple[
    Literal["already_admitted", "void", "unknown", "event_closed"], ...
] = ("already_admitted", "void", "unknown", "event_closed")
EXPORT_COLUMNS = ("time", "gate", "printed_number", "outcome", "entry", "offline")
_FORMULA_LEADERS = ("=", "+", "-", "@", "\t", "\r")

_ADMITTED = PrintixScanOutcome.ADMITTED.value
#: When a scan happened at the gate: the phone's time for an offline scan.
_HAPPENED_AT = func.coalesce(
    PrintixScanLog.offline_scanned_at, PrintixScanLog.scanned_at
)


@dataclass
class _GateTotals:
    scans: int = 0
    admitted: int = 0
    typed: int = 0
    last: datetime | None = None
    phones: list[PrintixGatePhone] = field(default_factory=list)


def _share(part: int, whole: int) -> float | None:
    return round(part / whole, 4) if whole else None


def _local_bucket_start() -> ColumnElement[datetime]:
    """The five-minute period of ``ticket.admitted_at`` on the Grenada clock (naive)."""
    utc = func.timezone(literal_column("'UTC'"), PrintixTicket.admitted_at)
    local = func.timezone(literal_column(f"'{DEFAULT_TIMEZONE}'"), utc)
    return func.date_bin(
        literal_column("INTERVAL '5 minutes'"),
        local,
        literal_column("TIMESTAMP '2000-01-01 00:00:00'"),
    )


def _bucket_to_utc(local_naive: datetime) -> datetime:
    return local_naive.replace(tzinfo=GRENADA).astimezone(UTC).replace(tzinfo=None)


def _arrival_series(counts: dict[datetime, int]) -> list[PrintixArrivalBucket]:
    if not counts:
        return []
    first, last = min(counts), max(counts)
    steps = int((last - first) / BUCKET) + 1
    first = max(first, last - BUCKET * (MAX_ARRIVAL_BUCKETS - 1))
    steps = min(steps, MAX_ARRIVAL_BUCKETS)
    return [
        PrintixArrivalBucket(
            starts_at=first + BUCKET * step,
            admitted=counts.get(first + BUCKET * step, 0),
        )
        for step in range(steps)
    ]


def _busiest(counts: dict[datetime, int], buckets: int) -> PrintixBusyPeriod | None:
    """The busiest run of ``buckets`` five-minute periods, the earliest on a tie.

    A run that starts on an empty period is never busier than the one starting at
    the next busy period, so only busy starts are tried."""
    best: tuple[int, datetime] | None = None
    for start in sorted(counts):
        total = sum(counts.get(start + BUCKET * step, 0) for step in range(buckets))
        if best is None or total > best[0]:
            best = (total, start)
    if best is None:
        return None
    return PrintixBusyPeriod(starts_at=best[1], minutes=buckets * 5, admitted=best[0])


async def _gates(
    session: AsyncSession, event_id: uuid.UUID, now: datetime, admitted_total: int
) -> list[PrintixGateAnalytics]:
    rows = (
        await session.execute(
            select(
                PrintixPairing.id,
                PrintixPairing.gate,
                PrintixPairing.revoked_at,
                PrintixPairing.expires_at,
                func.count(PrintixScanLog.id),
                func.count(PrintixScanLog.id).filter(
                    PrintixScanLog.outcome == _ADMITTED
                ),
                func.count(PrintixScanLog.id).filter(PrintixScanLog.typed.is_(True)),
                func.max(_HAPPENED_AT),
            )
            .select_from(PrintixPairing)
            .outerjoin(PrintixScanLog, PrintixScanLog.pairing_id == PrintixPairing.id)
            .where(PrintixPairing.event_id == event_id)
            .group_by(PrintixPairing.id)
            .order_by(PrintixPairing.gate, PrintixPairing.created_at, PrintixPairing.id)
            .limit(MAX_PAIRINGS)
        )
    ).all()
    by_gate: dict[str, _GateTotals] = defaultdict(_GateTotals)
    for pairing_id, gate, revoked_at, expires_at, scans, admitted, typed, last in rows:
        totals = by_gate[gate]
        totals.scans += int(scans)
        totals.admitted += int(admitted)
        totals.typed += int(typed)
        if last is not None and (totals.last is None or last > totals.last):
            totals.last = last
        totals.phones.append(
            PrintixGatePhone(
                id=pairing_id,
                last_scan_at=last,
                active=revoked_at is None and expires_at > now,
            )
        )
    return [
        PrintixGateAnalytics(
            gate=gate,
            admitted=totals.admitted,
            refused=totals.scans - totals.admitted,
            scans=totals.scans,
            typed_scans=totals.typed,
            typed_share=_share(totals.typed, totals.scans),
            admitted_share=_share(totals.admitted, admitted_total),
            last_scan_at=totals.last,
            phones=totals.phones,
        )
        for gate, totals in sorted(by_gate.items())
    ]


async def event_analytics(
    session: AsyncSession,
    event_id: uuid.UUID,
    *,
    organisation_id: str | None = None,
) -> PrintixEventAnalytics:
    """Everything the organiser dashboard shows for one event, in four queries.

    ``organisation_id`` as for ``service.get_event``: another organisation's event
    is "not found"."""
    event = await service.get_event(session, event_id, organisation_id=organisation_id)
    now = utc_now()
    tickets = (
        await session.execute(
            select(
                func.count(PrintixTicket.id).filter(
                    PrintixTicket.status == PrintixTicketStatus.VOID.value
                ),
                func.count(PrintixTicket.id).filter(
                    PrintixTicket.status == PrintixTicketStatus.VALID.value
                ),
                func.count(PrintixTicket.id).filter(
                    PrintixTicket.admitted_at.is_not(None)
                ),
                func.min(PrintixTicket.admitted_at),
                func.max(PrintixTicket.admitted_at),
                func.count(PrintixTicket.id).filter(
                    PrintixTicket.admitted_at > now - RATE_WINDOW,
                    PrintixTicket.admitted_at <= now,
                ),
            ).where(PrintixTicket.event_id == event.id)
        )
    ).one()
    void, valid, admitted = int(tickets[0]), int(tickets[1]), int(tickets[2])
    first_at, last_at, recent = tickets[3], tickets[4], int(tickets[5])

    bucket = _local_bucket_start().label("bucket")
    bucket_rows = (
        await session.execute(
            select(bucket, func.count(PrintixTicket.id))
            .where(
                PrintixTicket.event_id == event.id,
                PrintixTicket.admitted_at.is_not(None),
            )
            .group_by(bucket)
            .order_by(bucket)
        )
    ).all()
    counts = {_bucket_to_utc(start): int(count) for start, count in bucket_rows}

    log = (
        await session.execute(
            select(
                *[
                    func.count(PrintixScanLog.id).filter(
                        PrintixScanLog.outcome == reason
                    )
                    for reason in REFUSAL_REASONS
                ],
                func.count(PrintixScanLog.id).filter(
                    PrintixScanLog.offline_scanned_at.is_not(None),
                    PrintixScanLog.outcome == _ADMITTED,
                ),
                func.count(PrintixScanLog.id).filter(
                    PrintixScanLog.offline_scanned_at.is_not(None),
                    PrintixScanLog.outcome != _ADMITTED,
                ),
                func.max(
                    func.extract(
                        "epoch",
                        PrintixScanLog.scanned_at - PrintixScanLog.offline_scanned_at,
                    )
                ).filter(
                    PrintixScanLog.offline_scanned_at.is_not(None),
                    PrintixScanLog.outcome == _ADMITTED,
                ),
            )
            .select_from(PrintixScanLog)
            .join(PrintixPairing, PrintixPairing.id == PrintixScanLog.pairing_id)
            .where(PrintixPairing.event_id == event.id)
        )
    ).one()
    refusal_counts = [int(value) for value in log[: len(REFUSAL_REASONS)]]
    synced_late, conflicts, delay = (
        int(log[len(REFUSAL_REASONS)]),
        int(log[len(REFUSAL_REASONS) + 1]),
        log[len(REFUSAL_REASONS) + 2],
    )

    return PrintixEventAnalytics(
        event=service.event_public(event),
        generated_at=now,
        timezone=DEFAULT_TIMEZONE,
        issued=valid + void,
        void=void,
        admitted=admitted,
        not_yet_in=valid - admitted,
        no_show_rate=_share(valid - admitted, valid),
        first_admission_at=first_at,
        last_admission_at=last_at,
        admitted_last_10_minutes=recent,
        entry_rate_per_minute=round(recent / (RATE_WINDOW.total_seconds() / 60), 2),
        arrivals=_arrival_series(counts),
        busiest_5_minutes=_busiest(counts, 1),
        busiest_15_minutes=_busiest(counts, 3),
        gates=await _gates(session, event.id, now, admitted),
        refusals=[
            PrintixRefusalCount(reason=reason, count=count)
            for reason, count in zip(REFUSAL_REASONS, refusal_counts, strict=True)
        ],
        offline=PrintixOfflineAnalytics(
            synced_late=synced_late,
            conflicts=conflicts,
            longest_delay_seconds=int(delay) if delay is not None else None,
        ),
    )


def _scans_select(event_id: uuid.UUID) -> Select[Any]:
    return (
        select(
            PrintixScanLog.id,
            _HAPPENED_AT.label("happened_at"),
            PrintixPairing.gate,
            PrintixTicket.printed_number,
            PrintixScanLog.outcome,
            PrintixScanLog.typed,
            PrintixScanLog.offline_scanned_at.is_not(None).label("offline"),
        )
        .select_from(PrintixScanLog)
        .join(PrintixPairing, PrintixPairing.id == PrintixScanLog.pairing_id)
        .outerjoin(PrintixTicket, PrintixTicket.id == PrintixScanLog.ticket_id)
        .where(PrintixPairing.event_id == event_id)
        .order_by(_HAPPENED_AT.desc(), PrintixScanLog.id)
    )


async def list_scans(
    session: AsyncSession,
    event_id: uuid.UUID,
    *,
    page: int,
    size: int,
    organisation_id: str | None = None,
) -> PrintixScanPage:
    """Scans of one event, newest first, one page. No barcode is read or returned."""
    event = await service.get_event(session, event_id, organisation_id=organisation_id)
    total = int(
        await session.scalar(
            select(func.count(PrintixScanLog.id))
            .join(PrintixPairing, PrintixPairing.id == PrintixScanLog.pairing_id)
            .where(PrintixPairing.event_id == event.id)
        )
        or 0
    )
    rows = (
        await session.execute(
            _scans_select(event.id).offset((page - 1) * size).limit(size)
        )
    ).all()
    return PrintixScanPage(
        items=[
            PrintixScanItem(
                id=scan_id,
                scanned_at=happened,
                gate=gate,
                printed_number=printed,
                outcome=PrintixScanOutcome(outcome),
                typed=bool(typed),
                offline=bool(offline),
            )
            for scan_id, happened, gate, printed, outcome, typed, offline in rows
        ],
        total=total,
        page=page,
        size=size,
    )


def csv_cell(value: object) -> str:
    """Text for one CSV cell. A cell a spreadsheet could read as a formula gets a
    leading apostrophe, so a ticket number or a gate name cannot run anything."""
    text = "" if value is None else str(value)
    return f"'{text}" if text.startswith(_FORMULA_LEADERS) else text


def _csv_chunk(rows: list[tuple[object, ...]]) -> str:
    buffer = io.StringIO()
    writer = csv.writer(buffer, lineterminator="\r\n")
    for row in rows:
        writer.writerow([csv_cell(cell) for cell in row])
    return buffer.getvalue()


def export_filename(event_id: uuid.UUID, event_date: object) -> str:
    return f"printix-scans-{event_date}-{str(event_id)[:8]}.csv"


async def stream_scans_csv(
    session: AsyncSession, event_id: uuid.UUID
) -> AsyncIterator[str]:
    """The scan log as CSV text in batches, oldest first, from a database cursor.

    Columns: time (Grenada clock, with its offset), gate, printed number, outcome,
    entry (scanned or typed) and offline (yes when synced late). The caller checks
    the event first, so a missing or foreign event is refused before any byte."""
    yield _csv_chunk([EXPORT_COLUMNS])
    statement = (
        _scans_select(event_id)
        .order_by(None)
        .order_by(_HAPPENED_AT, PrintixScanLog.id)
        .execution_options(yield_per=EXPORT_BATCH)
    )
    result = await session.stream(statement)
    async for partition in result.partitions(EXPORT_BATCH):
        yield _csv_chunk(
            [
                (
                    happened.replace(tzinfo=UTC)
                    .astimezone(GRENADA)
                    .isoformat(timespec="seconds"),
                    gate,
                    printed,
                    outcome,
                    "typed" if typed else "scanned",
                    "yes" if offline else "no",
                )
                for _, happened, gate, printed, outcome, typed, offline in partition
            ]
        )
