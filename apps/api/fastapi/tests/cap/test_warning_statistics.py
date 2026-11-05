"""Warning statistics: counts by hazard, colour, parish and month, and the CSV export."""

import csv
import io
from datetime import UTC, date, datetime, timedelta
from typing import Any

import httpx
import pytest
import sqlalchemy as sa
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.asyncio import AsyncSession

from src.cap import levels, warning_statistics
from src.cap.models import (
    CapAlert,
    CapArea,
    CapAreaKind,
    CapCertainty,
    CapInfo,
    CapLifecycleState,
    CapMessageType,
    CapSeverity,
    CapStatus,
    CapUrgency,
)
from src.cap.schemas import CapNameValue
from src.utils.timezones import GRENADA
from tests.factories import make_user

pytestmark = pytest.mark.asyncio

STATISTICS = "/api/v1/cap/statistics"
EXPORT = "/api/v1/cap/statistics/export.csv"
PERIOD = {"start": "2026-01-01", "end": "2026-12-31"}


def _parish(iso_code: str) -> dict[str, str]:
    return {"value_name": "ISO3166-2:GD", "value": iso_code}


Block = tuple[str, list[dict[str, str]]]


def _awareness_parameters(colour: levels.GmsColour | None) -> list[dict[str, str]]:
    if colour is None:
        return []
    return [
        {
            "value_name": levels.AWARENESS_PARAMETER,
            "value": levels.awareness_value(colour),
        }
    ]


async def _add_alert(
    db: AsyncSession,
    *,
    creator_id: Any,
    identifier: str,
    published_at: datetime | None,
    event: str = "Heavy Rainfall Warning",
    colour: levels.GmsColour | None = levels.GmsColour.ORANGE,
    blocks: list[Block] | None = None,
    parishes: tuple[str, ...] = (),
    status: CapStatus = CapStatus.ACTUAL,
    msg_type: CapMessageType = CapMessageType.ALERT,
    lifecycle_state: CapLifecycleState = CapLifecycleState.PUBLISHED,
    info_blocks: int = 1,
) -> None:
    """An alert with one information block per ``blocks`` entry (event, parameters).

    Without ``blocks`` every block is ``event`` with the ``colour`` parameter.
    """
    if blocks is None:
        blocks = [(event, _awareness_parameters(colour))] * info_blocks
    alert = CapAlert(
        identifier=identifier,
        sender="cap@example.com",
        status=status,
        msg_type=msg_type,
        lifecycle_state=lifecycle_state,
        published_at=published_at,
        created_by_user_id=creator_id,
    )
    db.add(alert)
    await db.flush()
    for sequence, (block_event, parameters) in enumerate(blocks):
        info = CapInfo(
            alert_id=alert.id,
            sequence=sequence,
            event=block_event,
            urgency=CapUrgency.EXPECTED,
            severity=CapSeverity.SEVERE,
            certainty=CapCertainty.LIKELY,
            headline="Headline",
            description="Description",
            parameters=parameters,
        )
        db.add(info)
        await db.flush()
        if parishes:
            db.add(
                CapArea(
                    info_id=info.id,
                    kind=CapAreaKind.GEOCODE,
                    area_desc=", ".join(parishes),
                    geocodes=[_parish(code) for code in parishes],
                )
            )
        else:
            db.add(
                CapArea(
                    info_id=info.id,
                    kind=CapAreaKind.AREA,
                    area_desc="Grenada",
                )
            )
    await db.commit()


def _counts(buckets: list[dict[str, Any]]) -> dict[str, int]:
    return {bucket["key"]: bucket["count"] for bucket in buckets}


async def _seed(db: AsyncSession) -> None:
    creator = await make_user(db, superuser=True)
    # 23:30 on 31 January in Grenada (UTC-4) is already 1 February in UTC: the
    # month must follow Grenada time.
    await _add_alert(
        db,
        creator_id=creator.id,
        identifier="jan-rain",
        published_at=datetime(2026, 2, 1, 3, 30, tzinfo=UTC).replace(tzinfo=None),
        parishes=("GD-03", "GD-06"),
        info_blocks=2,
    )
    await _add_alert(
        db,
        creator_id=creator.id,
        identifier="mar-wind",
        published_at=datetime(2026, 3, 10, 15, 0, tzinfo=UTC).replace(tzinfo=None),
        event="High Wind Warning",
        colour=levels.GmsColour.YELLOW,
        parishes=("GD-03",),
    )
    await _add_alert(
        db,
        creator_id=creator.id,
        identifier="mar-outlook",
        published_at=datetime(2026, 3, 11, 15, 0, tzinfo=UTC).replace(tzinfo=None),
        event="High Wind Warning",
        colour=None,
        lifecycle_state=CapLifecycleState.EXPIRED,
    )
    # Not counted: never published, an exercise, an update and a different year.
    await _add_alert(
        db,
        creator_id=creator.id,
        identifier="draft",
        published_at=None,
        lifecycle_state=CapLifecycleState.DRAFT,
    )
    await _add_alert(
        db,
        creator_id=creator.id,
        identifier="exercise",
        published_at=datetime(2026, 3, 12, 15, 0, tzinfo=UTC).replace(tzinfo=None),
        status=CapStatus.EXERCISE,
    )
    await _add_alert(
        db,
        creator_id=creator.id,
        identifier="update",
        published_at=datetime(2026, 3, 12, 16, 0, tzinfo=UTC).replace(tzinfo=None),
        msg_type=CapMessageType.UPDATE,
    )
    await _add_alert(
        db,
        creator_id=creator.id,
        identifier="last-year",
        published_at=datetime(2025, 12, 31, 12, 0, tzinfo=UTC).replace(tzinfo=None),
    )


async def test_counts_by_hazard_colour_parish_and_month(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    await _seed(db_async)
    response = await async_client.get(
        STATISTICS, params=PERIOD, headers=superuser_token_headers_async
    )
    assert response.status_code == 200, response.text
    body = response.json()

    assert body["total"] == 3
    assert (body["start"], body["end"], body["hazard"]) == (
        "2026-01-01",
        "2026-12-31",
        None,
    )
    # Two information blocks still count the warning once.
    assert _counts(body["by_hazard"]) == {
        "Heavy Rainfall Warning": 1,
        "High Wind Warning": 2,
    }
    assert _counts(body["by_colour"]) == {
        "green": 0,
        "yellow": 1,
        "orange": 1,
        "red": 0,
        "unassigned": 1,
    }
    parishes = _counts(body["by_parish"])
    assert parishes["george"] == 2
    assert parishes["patrick"] == 1
    assert parishes["andrew"] == 0
    assert parishes["carriacou-pm"] == 0
    # The outlook covers Grenada as a whole and has no parish code.
    assert parishes["no-parish"] == 1
    months = _counts(body["by_month"])
    assert len(months) == 12
    # The first warning was published on 31 January at 23:30 in Grenada.
    assert months["2026-01"] == 1
    assert months["2026-02"] == 0
    assert months["2026-03"] == 2
    assert months["2026-12"] == 0


async def test_hazard_filter_narrows_every_table(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    await _seed(db_async)
    response = await async_client.get(
        STATISTICS,
        params={**PERIOD, "hazard": "High Wind Warning"},
        headers=superuser_token_headers_async,
    )
    body = response.json()
    assert body["total"] == 2
    assert body["hazard"] == "High Wind Warning"
    assert _counts(body["by_hazard"]) == {"High Wind Warning": 2}
    assert _counts(body["by_colour"])["orange"] == 0
    assert _counts(body["by_colour"])["yellow"] == 1


async def test_empty_period_lists_every_row_with_zero(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    _ = db_async
    response = await async_client.get(
        STATISTICS,
        params={"start": "2020-01-15", "end": "2020-03-02"},
        headers=superuser_token_headers_async,
    )
    body = response.json()
    assert body["total"] == 0
    assert body["by_hazard"] == []
    assert set(_counts(body["by_colour"])) == {
        "green",
        "yellow",
        "orange",
        "red",
        "unassigned",
    }
    assert set(_counts(body["by_parish"])) == {
        "andrew",
        "david",
        "george",
        "john",
        "mark",
        "patrick",
        "carriacou-pm",
        "no-parish",
    }
    assert {bucket["count"] for bucket in body["by_parish"]} == {0}
    assert [bucket["key"] for bucket in body["by_month"]] == [
        "2020-01",
        "2020-02",
        "2020-03",
    ]
    assert body["by_month"][0]["label"] == "January 2020"


async def test_default_period_is_the_last_twelve_months(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    _ = db_async
    response = await async_client.get(STATISTICS, headers=superuser_token_headers_async)
    assert response.status_code == 200
    assert len(response.json()["by_month"]) == 12


@pytest.mark.parametrize(
    "params",
    [
        {"start": "2026-06-02", "end": "2026-06-01"},
        {"start": "2010-01-01", "end": "2026-06-01"},
    ],
)
async def test_invalid_period_is_refused(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
    params: dict[str, str],
) -> None:
    _ = db_async
    response = await async_client.get(
        STATISTICS, params=params, headers=superuser_token_headers_async
    )
    assert response.status_code == 422


async def test_malformed_date_is_refused(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    _ = db_async
    response = await async_client.get(
        STATISTICS,
        params={"start": "not-a-date"},
        headers=superuser_token_headers_async,
    )
    assert response.status_code == 422


@pytest.mark.parametrize("path", [STATISTICS, EXPORT])
async def test_requires_sign_in_and_alert_read_permission(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    normal_user_token_headers_async: dict[str, str],
    path: str,
) -> None:
    _ = db_async
    assert (await async_client.get(path)).status_code == 401
    denied = await async_client.get(path, headers=normal_user_token_headers_async)
    assert denied.status_code == 403


async def test_csv_export_matches_the_statistics(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    await _seed(db_async)
    stats = (
        await async_client.get(
            STATISTICS, params=PERIOD, headers=superuser_token_headers_async
        )
    ).json()
    response = await async_client.get(
        EXPORT, params=PERIOD, headers=superuser_token_headers_async
    )
    assert response.status_code == 200
    assert response.headers["content-type"] == "text/csv; charset=utf-8"
    assert response.headers["content-disposition"] == (
        'attachment; filename="cap-warning-statistics-2026-01-01-2026-12-31.csv"'
    )
    rows = list(csv.reader(io.StringIO(response.text)))
    assert rows[0] == ["table", "key", "label", "count"]
    assert rows[1] == ["total", "total", "All published warnings", "3"]
    exported = {(row[0], row[1]): int(row[3]) for row in rows[2:]}
    expected = {
        (table, bucket["key"]): bucket["count"]
        for table, key in (
            ("hazard", "by_hazard"),
            ("colour", "by_colour"),
            ("parish", "by_parish"),
            ("month", "by_month"),
        )
        for bucket in stats[key]
    }
    assert exported == expected


async def test_csv_export_defuses_spreadsheet_formulas(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    creator = await make_user(db_async, superuser=True)
    await _add_alert(
        db_async,
        creator_id=creator.id,
        identifier="formula",
        published_at=datetime(2026, 5, 5, 12, 0),
        event='=HYPERLINK("http://example.com")',
    )
    response = await async_client.get(
        EXPORT, params=PERIOD, headers=superuser_token_headers_async
    )
    hazard_rows = [
        row for row in csv.reader(io.StringIO(response.text)) if row[0] == "hazard"
    ]
    assert hazard_rows == [
        [
            "hazard",
            '\'=HYPERLINK("http://example.com")',
            '\'=HYPERLINK("http://example.com")',
            "1",
        ]
    ]


def _grenada_today() -> date:
    return datetime.now(GRENADA).date()


@pytest.mark.parametrize(
    "params",
    [
        {"start": "9999-01-01", "end": "9999-12-31"},
        {"start": "2026-01-01", "end": "9999-12-31"},
        {"end": (_grenada_today() + timedelta(days=400)).isoformat()},
    ],
)
async def test_end_far_in_the_future_is_refused(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
    params: dict[str, str],
) -> None:
    """No 500 near year 9999: the end is capped at a year after today."""
    _ = db_async
    response = await async_client.get(
        STATISTICS, params=params, headers=superuser_token_headers_async
    )
    assert response.status_code == 422
    assert response.json()["detail"] == ("The end date must be within a year of today.")


async def test_end_one_year_after_today_is_accepted(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    _ = db_async
    latest = warning_statistics.latest_end(_grenada_today())
    response = await async_client.get(
        STATISTICS,
        params={"start": "2026-01-01", "end": latest.isoformat()},
        headers=superuser_token_headers_async,
    )
    assert response.status_code == 200, response.text
    beyond = await async_client.get(
        STATISTICS,
        params={"start": "2026-01-01", "end": (latest + timedelta(days=1)).isoformat()},
        headers=superuser_token_headers_async,
    )
    assert beyond.status_code == 422


@pytest.mark.parametrize(
    "start",
    ["1999-12-31", "0001-01-01", "1900-06-01"],
)
async def test_start_before_2000_is_refused(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
    start: str,
) -> None:
    _ = db_async
    response = await async_client.get(
        STATISTICS,
        params={"start": start, "end": "2026-01-01"},
        headers=superuser_token_headers_async,
    )
    assert response.status_code == 422
    assert response.json()["detail"] == (
        "The start date must not be before 2000-01-01."
    )


async def test_start_on_2000_01_01_is_accepted(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    _ = db_async
    response = await async_client.get(
        STATISTICS,
        params={"start": "2000-01-01", "end": "2000-01-31"},
        headers=superuser_token_headers_async,
    )
    assert response.status_code == 200, response.text


async def test_end_without_start_is_accepted_from_the_archive_start(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    """Only an end was given: the default start is clamped to 2000-01-01, not refused."""
    _ = db_async
    response = await async_client.get(
        STATISTICS,
        params={"end": "2000-06-30"},
        headers=superuser_token_headers_async,
    )
    assert response.status_code == 200, response.text
    assert response.json()["start"] == "2000-01-01"
    assert response.json()["end"] == "2000-06-30"


async def test_default_end_with_far_past_start_is_refused(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    _ = db_async
    response = await async_client.get(
        STATISTICS,
        params={"start": "0001-01-01"},
        headers=superuser_token_headers_async,
    )
    assert response.status_code == 422


async def test_period_limit_is_exactly_3660_days(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    _ = db_async
    start = date(2017, 1, 1)
    accepted = await async_client.get(
        STATISTICS,
        params={
            "start": start.isoformat(),
            "end": (start + timedelta(days=3660)).isoformat(),
        },
        headers=superuser_token_headers_async,
    )
    assert accepted.status_code == 200, accepted.text
    refused = await async_client.get(
        STATISTICS,
        params={
            "start": start.isoformat(),
            "end": (start + timedelta(days=3661)).isoformat(),
        },
        headers=superuser_token_headers_async,
    )
    assert refused.status_code == 422
    assert refused.json()["detail"] == ("Choose a period of about ten years or less.")


async def test_grenada_day_boundaries(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    """A Grenada day runs from 04:00 UTC to 04:00 UTC the next day (UTC-4)."""
    creator = await make_user(db_async, superuser=True)
    cases = {
        "before-start": datetime(2026, 3, 1, 3, 59),
        "at-start": datetime(2026, 3, 1, 4, 0),
        "last-minute-of-end": datetime(2026, 4, 1, 3, 59),
        "after-end": datetime(2026, 4, 1, 4, 0),
    }
    for identifier, published in cases.items():
        await _add_alert(
            db_async,
            creator_id=creator.id,
            identifier=identifier,
            published_at=published,
        )
    response = await async_client.get(
        STATISTICS,
        params={"start": "2026-03-01", "end": "2026-03-31"},
        headers=superuser_token_headers_async,
    )
    body = response.json()
    assert body["total"] == 2
    assert _counts(body["by_month"])["2026-03"] == 2


async def test_cancel_test_and_draft_are_not_counted(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    creator = await make_user(db_async, superuser=True)
    published = datetime(2026, 5, 5, 12, 0)
    await _add_alert(
        db_async,
        creator_id=creator.id,
        identifier="real",
        published_at=published,
    )
    await _add_alert(
        db_async,
        creator_id=creator.id,
        identifier="cancel-message",
        published_at=published,
        msg_type=CapMessageType.CANCEL,
    )
    await _add_alert(
        db_async,
        creator_id=creator.id,
        identifier="test-status",
        published_at=published,
        status=CapStatus.TEST,
    )
    await _add_alert(
        db_async,
        creator_id=creator.id,
        identifier="draft-status",
        published_at=published,
        status=CapStatus.DRAFT,
    )
    response = await async_client.get(
        STATISTICS, params=PERIOD, headers=superuser_token_headers_async
    )
    body = response.json()
    assert body["total"] == 1
    assert _counts(body["by_hazard"]) == {"Heavy Rainfall Warning": 1}


async def test_one_alert_with_two_hazards_counts_in_each(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    creator = await make_user(db_async, superuser=True)
    await _add_alert(
        db_async,
        creator_id=creator.id,
        identifier="two-hazards",
        published_at=datetime(2026, 6, 1, 12, 0),
        blocks=[
            ("Heavy Rainfall Warning", _awareness_parameters(levels.GmsColour.ORANGE)),
            ("High Wind Warning", _awareness_parameters(levels.GmsColour.ORANGE)),
        ],
    )
    response = await async_client.get(
        STATISTICS, params=PERIOD, headers=superuser_token_headers_async
    )
    body = response.json()
    assert body["total"] == 1
    assert _counts(body["by_hazard"]) == {
        "Heavy Rainfall Warning": 1,
        "High Wind Warning": 1,
    }
    assert _counts(body["by_colour"])["orange"] == 1


async def test_colour_counts_each_alert_once_at_its_highest_colour(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    """Red > orange > yellow > green > unassigned; the colour table adds up to total."""
    creator = await make_user(db_async, superuser=True)
    await _add_alert(
        db_async,
        creator_id=creator.id,
        identifier="yellow-then-orange",
        published_at=datetime(2026, 6, 1, 12, 0),
        blocks=[
            ("Heavy Rainfall Warning", _awareness_parameters(levels.GmsColour.YELLOW)),
            ("High Wind Warning", _awareness_parameters(levels.GmsColour.ORANGE)),
        ],
    )
    await _add_alert(
        db_async,
        creator_id=creator.id,
        identifier="green-and-unassigned",
        published_at=datetime(2026, 6, 2, 12, 0),
        blocks=[
            ("Heavy Rainfall Warning", _awareness_parameters(levels.GmsColour.GREEN)),
            ("Heavy Rainfall Warning", []),
        ],
    )
    await _add_alert(
        db_async,
        creator_id=creator.id,
        identifier="unassigned-only",
        published_at=datetime(2026, 6, 3, 12, 0),
        blocks=[("Heavy Rainfall Warning", [])],
    )
    response = await async_client.get(
        STATISTICS, params=PERIOD, headers=superuser_token_headers_async
    )
    body = response.json()
    assert body["total"] == 3
    colours = _counts(body["by_colour"])
    assert colours == {
        "green": 1,
        "yellow": 0,
        "orange": 1,
        "red": 0,
        "unassigned": 1,
    }
    assert sum(colours.values()) == body["total"]
    # Hazards still count the alert once per hazard it has blocks for.
    assert _counts(body["by_hazard"]) == {
        "Heavy Rainfall Warning": 3,
        "High Wind Warning": 1,
    }


# Spellings of the awareness_level value: the SQL colour must agree with
# levels.parse_awareness for each one (whitespace and colour case tolerated;
# code and severity exact). The Unicode spaces are the ones str.strip removes.
AWARENESS_VARIANTS = [
    "3; orange; Severe",
    " 3 ;  ORANGE ; Severe ",
    "3;\torange\n;Severe",
    "4; Red; Extreme",
    "1; GREEN; Minor",
    "2;yellow;Moderate",
    "3;orange;severe",
    "03; orange; Severe",
    "3; orange; Severe; extra",
    "3; orange",
    "orange",
    "",
    "3; orange; Severe ",  # no-break space
    "　3　;　orange　;Severe　",  # ideographic space
    "3;orange;\u0085Severe\u0085",  # next line (NEL)
    "\x1c3\x1c;\x1corange\x1c;\x1cSevere\x1c",  # file, group, record, unit separators
    "3; orange ;Severe",  # line and paragraph separators
    "3;orange;Severe ",  # line separator at the end
]


async def test_colour_spelling_matches_parse_awareness(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    creator = await make_user(db_async, superuser=True)
    expected = {colour.value: 0 for colour in levels.GmsColour}
    expected["unassigned"] = 0
    for index, variant in enumerate(AWARENESS_VARIANTS):
        parsed = levels.parse_awareness(variant)
        expected[parsed.value if parsed else "unassigned"] += 1
        await _add_alert(
            db_async,
            creator_id=creator.id,
            identifier=f"spelling-{index}",
            published_at=datetime(2026, 6, 1, 12, 0),
            blocks=[
                (
                    "Heavy Rainfall Warning",
                    [{"value_name": levels.AWARENESS_PARAMETER, "value": variant}],
                )
            ],
        )
    response = await async_client.get(
        STATISTICS, params=PERIOD, headers=superuser_token_headers_async
    )
    assert _counts(response.json()["by_colour"]) == expected
    # The variants really do cover each colour and the unassigned case.
    assert all(expected.values())


@pytest.mark.parametrize(
    ("parameters", "json_type"),
    [
        (None, "null"),
        ({"value_name": "GMS:product", "value": "Warning"}, "object"),
        ("orange", "string"),
        (3, "number"),
    ],
    ids=["null", "object", "string", "number"],
)
async def test_non_array_parameters_do_not_break_the_counts(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
    parameters: Any,
    json_type: str,
) -> None:
    """A stored JSON null, object or scalar in ``parameters`` counts as no colour."""
    creator = await make_user(db_async, superuser=True)
    await _add_alert(
        db_async,
        creator_id=creator.id,
        identifier="odd-parameters",
        published_at=datetime(2026, 6, 1, 12, 0),
        blocks=[("Heavy Rainfall Warning", parameters)],
    )
    await _add_alert(
        db_async,
        creator_id=creator.id,
        identifier="orange-warning",
        published_at=datetime(2026, 6, 2, 12, 0),
        colour=levels.GmsColour.ORANGE,
    )
    stored = await db_async.scalar(
        select(sa.func.jsonb_typeof(sa.cast(CapInfo.parameters, JSONB)))
        .select_from(CapInfo)
        .join(CapAlert, CapInfo.alert_id == CapAlert.id)
        .where(CapAlert.identifier == "odd-parameters")
    )
    assert stored == json_type  # the seeded row really holds the odd shape

    response = await async_client.get(
        STATISTICS, params=PERIOD, headers=superuser_token_headers_async
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 2
    assert _counts(body["by_colour"]) == {
        "green": 0,
        "yellow": 0,
        "orange": 1,
        "red": 0,
        "unassigned": 1,
    }


async def test_outlook_block_is_not_counted_as_a_colour(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    """An Outlook has no colour yet, so a stored awareness_level is ignored (read_level)."""
    creator = await make_user(db_async, superuser=True)
    outlook = {"value_name": levels.PRODUCT_PARAMETER, "value": "Outlook"}
    warning = {"value_name": levels.PRODUCT_PARAMETER, "value": "Warning"}
    await _add_alert(
        db_async,
        creator_id=creator.id,
        identifier="legacy-outlook-with-colour",
        published_at=datetime(2026, 6, 1, 12, 0),
        blocks=[
            (
                "Heavy Rainfall Warning",
                [outlook, *_awareness_parameters(levels.GmsColour.ORANGE)],
            )
        ],
    )
    await _add_alert(
        db_async,
        creator_id=creator.id,
        identifier="outlook-then-warning",
        published_at=datetime(2026, 6, 2, 12, 0),
        blocks=[
            (
                "Heavy Rainfall Warning",
                [outlook, *_awareness_parameters(levels.GmsColour.RED)],
            ),
            (
                "High Wind Warning",
                [warning, *_awareness_parameters(levels.GmsColour.ORANGE)],
            ),
        ],
    )
    response = await async_client.get(
        STATISTICS, params=PERIOD, headers=superuser_token_headers_async
    )
    body = response.json()
    assert body["total"] == 2
    colours = _counts(body["by_colour"])
    # The Outlook-only alert is unassigned; the other one is orange from its Warning block.
    assert colours["unassigned"] == 1
    assert colours["orange"] == 1
    assert colours["red"] == 0
    assert sum(colours.values()) == body["total"]


_OUTLOOK = {"value_name": levels.PRODUCT_PARAMETER, "value": "Outlook"}
_WARNING = {"value_name": levels.PRODUCT_PARAMETER, "value": "Warning"}
_BOGUS_PRODUCT = {"value_name": levels.PRODUCT_PARAMETER, "value": "Bogus"}
_ORANGE = _awareness_parameters(levels.GmsColour.ORANGE)
_YELLOW = _awareness_parameters(levels.GmsColour.YELLOW)


@pytest.mark.parametrize(
    ("parameters", "colour"),
    [
        # The block's last GMS:product decides whether it is an Outlook.
        pytest.param(
            [_OUTLOOK, _WARNING, *_ORANGE], "orange", id="outlook-then-warning"
        ),
        pytest.param(
            [_WARNING, _OUTLOOK, *_ORANGE], "unassigned", id="warning-then-outlook"
        ),
        # No product at all: the colour still counts, as read_level reads it.
        pytest.param(list(_ORANGE), "orange", id="colour-without-product"),
        # An invalid product is no product; the colour still counts.
        pytest.param([_BOGUS_PRODUCT, *_ORANGE], "orange", id="invalid-product"),
        # An invalid product after an Outlook replaces it, so the block is not an Outlook.
        pytest.param(
            [_OUTLOOK, _BOGUS_PRODUCT, *_ORANGE], "orange", id="outlook-then-invalid"
        ),
    ],
)
async def test_block_colour_follows_the_product_rules_of_read_level(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
    parameters: list[dict[str, str]],
    colour: str,
) -> None:
    creator = await make_user(db_async, superuser=True)
    await _add_alert(
        db_async,
        creator_id=creator.id,
        identifier="block-product-rules",
        published_at=datetime(2026, 6, 1, 12, 0),
        blocks=[("Heavy Rainfall Warning", parameters)],
    )
    # The same rule the public feed applies to one block.
    level = levels.read_level(
        [CapNameValue(value_name=p["value_name"], value=p["value"]) for p in parameters]
    )
    assert (level[1].value if level[1] is not None else "unassigned") == colour
    response = await async_client.get(
        STATISTICS, params=PERIOD, headers=superuser_token_headers_async
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 1
    expected = {item.value: 0 for item in levels.GmsColour}
    expected["unassigned"] = 0
    expected[colour] = 1
    assert _counts(body["by_colour"]) == expected


async def test_malformed_parameter_elements_are_not_read(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    """Scalars, nulls and nested arrays are not parameters: they neither break the
    counts nor make a nested Outlook the block's product."""
    creator = await make_user(db_async, superuser=True)
    malformed: Any = [
        "junk",
        3,
        None,
        [_OUTLOOK],
        {"value_name": "GMS:product"},  # a product element with no value
        *_ORANGE,
    ]
    await _add_alert(
        db_async,
        creator_id=creator.id,
        identifier="malformed-elements",
        published_at=datetime(2026, 6, 1, 12, 0),
        blocks=[("Heavy Rainfall Warning", malformed)],
    )
    response = await async_client.get(
        STATISTICS, params=PERIOD, headers=superuser_token_headers_async
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["total"] == 1
    colours = _counts(body["by_colour"])
    assert colours["orange"] == 1
    assert colours["unassigned"] == 0


async def test_highest_awareness_value_in_one_block_wins(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    """Statistics take the highest awareness_level in a block; read_level takes the last.

    Authored data holds one value per block, so the two agree; a feed that repeats
    the parameter can make them differ, and the docs say so.
    """
    creator = await make_user(db_async, superuser=True)
    await _add_alert(
        db_async,
        creator_id=creator.id,
        identifier="orange-then-yellow",
        published_at=datetime(2026, 6, 1, 12, 0),
        blocks=[("Heavy Rainfall Warning", [*_ORANGE, *_YELLOW])],
    )
    await _add_alert(
        db_async,
        creator_id=creator.id,
        identifier="yellow-then-orange",
        published_at=datetime(2026, 6, 2, 12, 0),
        blocks=[("Heavy Rainfall Warning", [*_YELLOW, *_ORANGE])],
    )
    orange_then_yellow = [
        CapNameValue(value_name=p["value_name"], value=p["value"])
        for p in [*_ORANGE, *_YELLOW]
    ]
    assert levels.read_level(orange_then_yellow)[1] == levels.GmsColour.YELLOW
    response = await async_client.get(
        STATISTICS, params=PERIOD, headers=superuser_token_headers_async
    )
    body = response.json()
    assert body["total"] == 2
    colours = _counts(body["by_colour"])
    assert colours["orange"] == 2
    assert colours["yellow"] == 0


@pytest.mark.parametrize("event", ["=1+1", "+CMD", "-2+3", "@SUM(A1)"])
async def test_csv_label_column_is_defused(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
    event: str,
) -> None:
    creator = await make_user(db_async, superuser=True)
    await _add_alert(
        db_async,
        creator_id=creator.id,
        identifier=f"label-{event}",
        published_at=datetime(2026, 5, 5, 12, 0),
        event=event,
    )
    response = await async_client.get(
        EXPORT, params=PERIOD, headers=superuser_token_headers_async
    )
    rows = [row for row in csv.reader(io.StringIO(response.text)) if row[0] == "hazard"]
    assert [row[2] for row in rows] == [f"'{event}"]
