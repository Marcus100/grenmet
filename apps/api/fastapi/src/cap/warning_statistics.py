"""Warning statistics: counts of published warnings by hazard, colour, parish and month.

Read-only. The database does all the grouping (one query per table); Python only
fills in the buckets that have no warnings, so a quiet period still shows every
colour, parish and month with a zero.

What is counted: CAP alerts that were published (``published_at`` is set, so
expired and cancelled ones still count), with status ``Actual`` and message type
``Alert``. Updates, cancellations, exercises and tests are not new warnings and
are left out. The period filters on the publish time in Grenada time.
"""

import csv
import io
from datetime import date, datetime, timedelta
from typing import Any

import sqlalchemy as sa
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute

from src.auth.models import User
from src.auth.policy import require_permission
from src.cap import catalogue, levels
from src.cap.models import (
    CapAlert,
    CapArea,
    CapInfo,
    CapMessageType,
    CapStatus,
)
from src.cap.schemas import CapStatisticsBucket, CapStatisticsPublic
from src.exceptions import AppValidationError
from src.utils.timezones import GRENADA, local_to_utc, local_today

#: Longest period one request may cover, so the month table stays small.
MAX_PERIOD_DAYS = 3660
#: Months shown when the caller gives no start date (this month and 11 before).
DEFAULT_MONTHS = 12
UNASSIGNED_COLOUR = "unassigned"
NO_PARISH = "no-parish"
CSV_COLUMNS = ("table", "key", "label", "count")


def default_start(end: date) -> date:
    """The first day of the month eleven months before ``end``'s month."""
    months = end.year * 12 + (end.month - 1) - (DEFAULT_MONTHS - 1)
    return date(months // 12, months % 12 + 1, 1)


def resolve_period(start: date | None, end: date | None) -> tuple[date, date]:
    """Fill in a missing end (today in Grenada) and start (twelve months), then check."""
    resolved_end = end or local_today()
    resolved_start = start or default_start(resolved_end)
    if resolved_start > resolved_end:
        raise AppValidationError("The start date must not be after the end date.")
    if (resolved_end - resolved_start).days > MAX_PERIOD_DAYS:
        raise AppValidationError("Choose a period of ten years or less.")
    return resolved_start, resolved_end


def _month_key(moment: date) -> str:
    return f"{moment.year:04d}-{moment.month:02d}"


def _month_label(moment: date) -> str:
    return moment.strftime("%B %Y")


def _months_between(start: date, end: date) -> list[date]:
    months: list[date] = []
    cursor = date(start.year, start.month, 1)
    while cursor <= end:
        months.append(cursor)
        cursor = date(cursor.year + cursor.month // 12, cursor.month % 12 + 1, 1)
    return months


def _contains(
    column: InstrumentedAttribute[Any], item: dict[str, str]
) -> sa.ColumnElement[bool]:
    """JSON array ``column`` holds ``item`` (a ``@>`` test on the column as jsonb)."""
    return sa.cast(column, JSONB).contains([item])


def _colour_expression() -> sa.ColumnElement[str]:
    """The impact colour an info block declares in its ``awareness_level`` parameter."""
    whens = [
        (
            _contains(
                CapInfo.parameters,
                {
                    "value_name": levels.AWARENESS_PARAMETER,
                    "value": levels.awareness_value(colour),
                },
            ),
            colour.value,
        )
        for colour in levels.GmsColour
    ]
    return sa.case(*whens, else_=UNASSIGNED_COLOUR)


def _conditions(
    start: date, end: date, hazard: str | None
) -> list[sa.ColumnElement[bool]]:
    first = local_to_utc(start, datetime.min.time(), GRENADA)
    after_last = local_to_utc(end + timedelta(days=1), datetime.min.time(), GRENADA)
    conditions: list[sa.ColumnElement[bool]] = [
        CapAlert.published_at.is_not(None),
        CapAlert.published_at >= first,
        CapAlert.published_at < after_last,
        CapAlert.status == CapStatus.ACTUAL,
        CapAlert.msg_type == CapMessageType.ALERT,
    ]
    if hazard is not None:
        conditions.append(CapInfo.event == hazard)
    return conditions


def _alerts() -> sa.ColumnElement[int]:
    return sa.func.count(sa.distinct(CapAlert.id))


async def read_statistics(
    *,
    session: AsyncSession,
    current_user: User,
    start: date | None,
    end: date | None,
    hazard: str | None,
) -> CapStatisticsPublic:
    """Counts for the period; needs ``cap.alert.read`` like the warning board."""
    require_permission(current_user=current_user, permission_key="cap.alert.read")
    first_day, last_day = resolve_period(start, end)
    where = _conditions(first_day, last_day, hazard)
    joined = sa.join(CapAlert, CapInfo, CapInfo.alert_id == CapAlert.id)

    total = (
        await session.scalar(select(_alerts()).select_from(joined).where(*where)) or 0
    )

    hazard_rows = (
        await session.execute(
            select(CapInfo.event, _alerts())
            .select_from(joined)
            .where(*where)
            .group_by(CapInfo.event)
            .order_by(_alerts().desc(), CapInfo.event)
        )
    ).all()
    by_hazard = [
        CapStatisticsBucket(key=event, label=event, count=count)
        for event, count in hazard_rows
    ]

    colour = _colour_expression()
    colour_rows = await session.execute(
        select(colour, _alerts()).select_from(joined).where(*where).group_by(colour)
    )
    colour_counts = dict(colour_rows.tuples().all())
    by_colour = [
        CapStatisticsBucket(
            key=item.value,
            label=item.value.title(),
            count=colour_counts.get(item.value, 0),
        )
        for item in levels.GmsColour
    ]
    by_colour.append(
        CapStatisticsBucket(
            key=UNASSIGNED_COLOUR,
            label="No colour assigned",
            count=colour_counts.get(UNASSIGNED_COLOUR, 0),
        )
    )

    by_parish = await _parish_counts(session=session, joined=joined, where=where)

    local_published = sa.func.timezone(
        "America/Grenada", sa.func.timezone("UTC", CapAlert.published_at)
    )
    month = sa.func.date_trunc("month", local_published)
    month_counts = {
        moment.date(): count
        for moment, count in (
            await session.execute(
                select(month, _alerts())
                .select_from(joined)
                .where(*where)
                .group_by(month)
            )
        ).tuples()
    }
    by_month = [
        CapStatisticsBucket(
            key=_month_key(moment),
            label=_month_label(moment),
            count=month_counts.get(moment, 0),
        )
        for moment in _months_between(first_day, last_day)
    ]

    return CapStatisticsPublic(
        start=first_day,
        end=last_day,
        hazard=hazard,
        total=total,
        by_hazard=by_hazard,
        by_colour=by_colour,
        by_parish=by_parish,
        by_month=by_month,
    )


async def _parish_counts(
    *,
    session: AsyncSession,
    joined: sa.FromClause,
    where: list[sa.ColumnElement[bool]],
) -> list[CapStatisticsBucket]:
    """One row of ``count(...) FILTER`` per parish, over the areas of each warning."""
    with_areas = joined.outerjoin(CapArea, CapArea.info_id == CapInfo.id)
    parish_filters = {
        parish.id: _contains(
            CapArea.geocodes,
            {"value_name": catalogue.GEOCODE_NAME, "value": parish.iso_code},
        )
        for parish in catalogue.PARISHES
    }
    columns = [
        _alerts().filter(condition).label(parish_id.replace("-", "_"))
        for parish_id, condition in parish_filters.items()
    ]
    any_parish = _alerts().filter(sa.or_(*parish_filters.values())).label("any_parish")
    row = (
        await session.execute(
            select(*columns, any_parish, _alerts().label("all_alerts"))
            .select_from(with_areas)
            .where(*where)
        )
    ).one()
    counts = row._asdict()
    buckets = [
        CapStatisticsBucket(
            key=parish.id,
            label=parish.name,
            count=counts[parish.id.replace("-", "_")],
        )
        for parish in catalogue.PARISHES
    ]
    buckets.append(
        CapStatisticsBucket(
            key=NO_PARISH,
            label="No parish area (Grenada-wide or a drawn area)",
            count=counts["all_alerts"] - counts["any_parish"],
        )
    )
    return buckets


def _safe_cell(value: str) -> str:
    """Stop a spreadsheet reading text such as ``=1+1`` as a formula."""
    return f"'{value}" if value[:1] in {"=", "+", "-", "@", "\t", "\r"} else value


def statistics_csv(statistics: CapStatisticsPublic) -> str:
    """The same tables as ``read_statistics`` in one long CSV: table, key, label, count."""
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\r\n")
    writer.writerow(CSV_COLUMNS)
    writer.writerow(["total", "total", "All published warnings", statistics.total])
    tables = (
        ("hazard", statistics.by_hazard),
        ("colour", statistics.by_colour),
        ("parish", statistics.by_parish),
        ("month", statistics.by_month),
    )
    for name, buckets in tables:
        for bucket in buckets:
            writer.writerow(
                [name, _safe_cell(bucket.key), _safe_cell(bucket.label), bucket.count]
            )
    return out.getvalue()
