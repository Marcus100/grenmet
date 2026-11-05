"""Warning statistics: counts by hazard, colour, parish and month, and the CSV export."""

import csv
import io
from datetime import UTC, datetime
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.cap import levels
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
from tests.factories import make_user

pytestmark = pytest.mark.asyncio

STATISTICS = "/api/v1/cap/statistics"
EXPORT = "/api/v1/cap/statistics/export.csv"
PERIOD = {"start": "2026-01-01", "end": "2026-12-31"}


def _parish(iso_code: str) -> dict[str, str]:
    return {"value_name": "ISO3166-2:GD", "value": iso_code}


async def _add_alert(
    db: AsyncSession,
    *,
    creator_id: Any,
    identifier: str,
    published_at: datetime | None,
    event: str = "Heavy Rainfall Warning",
    colour: levels.GmsColour | None = levels.GmsColour.ORANGE,
    parishes: tuple[str, ...] = (),
    status: CapStatus = CapStatus.ACTUAL,
    msg_type: CapMessageType = CapMessageType.ALERT,
    lifecycle_state: CapLifecycleState = CapLifecycleState.PUBLISHED,
    info_blocks: int = 1,
) -> None:
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
    for sequence in range(info_blocks):
        info = CapInfo(
            alert_id=alert.id,
            sequence=sequence,
            event=event,
            urgency=CapUrgency.EXPECTED,
            severity=CapSeverity.SEVERE,
            certainty=CapCertainty.LIKELY,
            headline="Headline",
            description="Description",
            parameters=(
                []
                if colour is None
                else [
                    {
                        "value_name": levels.AWARENESS_PARAMETER,
                        "value": levels.awareness_value(colour),
                    }
                ]
            ),
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
