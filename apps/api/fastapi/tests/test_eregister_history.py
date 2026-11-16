"""Hour-to-hour history: one query fetches the previous hour and 3 hours earlier."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from datetime import UTC, datetime, timedelta
from typing import TYPE_CHECKING, Any, cast

from src.eregister import entries

if TYPE_CHECKING:
    from sqlalchemy.ext.asyncio import AsyncSession

from .test_eregister_validation import PAPER_ROW

STATION = "78958"
OBSERVED = datetime(2026, 3, 30, 12, 0, tzinfo=UTC)
ONE_HOUR = OBSERVED - timedelta(hours=1)
THREE_HOURS = OBSERVED - timedelta(hours=3)


class _Result:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self._rows = rows

    def mappings(self) -> _Result:
        return self

    def all(self) -> list[dict[str, Any]]:
        return list(self._rows)

    def first(self) -> dict[str, Any] | None:
        return self._rows[0] if self._rows else None


def _session(register: _Register) -> AsyncSession:
    """The fake stands in for the session; it implements only what history_for uses."""
    return cast("AsyncSession", register)


class _Register:
    """Answers a statement with the stored rows whose observed_at it was given."""

    def __init__(self, stored: dict[datetime, dict[str, Any]]) -> None:
        self.stored = stored
        self.statements = 0

    @asynccontextmanager
    async def begin_nested(self) -> AsyncIterator[None]:
        yield

    async def execute(self, statement: Any, params: dict[str, Any]) -> _Result:
        self.statements += 1
        wanted: set[datetime] = set()
        for value in params.values():
            values = value if isinstance(value, list) else [value]
            wanted.update(item for item in values if isinstance(item, datetime))
        return _Result(
            [
                {"observed_at": at, "body": body}
                for at, body in self.stored.items()
                if at in wanted
            ]
        )


def _body(air_temp: str) -> dict[str, Any]:
    return {**PAPER_ROW, "air_temp": air_temp}


async def test_both_hours_come_from_one_query() -> None:
    register = _Register({ONE_HOUR: _body("0271"), THREE_HOURS: _body("0243")})
    found = await entries.history_for(_session(register), STATION, OBSERVED)
    assert register.statements == 1
    assert {hours: book.air_temp for hours, book in found.items()} == {
        1: "0271",
        3: "0243",
    }


async def test_a_missing_hour_is_left_out() -> None:
    register = _Register({THREE_HOURS: _body("0243")})
    found = await entries.history_for(_session(register), STATION, OBSERVED)
    assert list(found) == [3]


async def test_other_hours_are_not_history() -> None:
    register = _Register(
        {
            OBSERVED - timedelta(hours=2): _body("0250"),
            ONE_HOUR: _body("0271"),
        }
    )
    found = await entries.history_for(_session(register), STATION, OBSERVED)
    assert list(found) == [1]


async def test_an_unreadable_body_leaves_the_other_hour_usable() -> None:
    # air_temp is at most 8 characters: this stored body cannot be read.
    register = _Register({ONE_HOUR: _body("1234567890"), THREE_HOURS: _body("0243")})
    found = await entries.history_for(_session(register), STATION, OBSERVED)
    assert list(found) == [3]


async def test_no_register_or_station_means_no_query() -> None:
    assert await entries.history_for(None, STATION, OBSERVED) == {}
    register = _Register({ONE_HOUR: _body("0271")})
    assert await entries.history_for(_session(register), " ", OBSERVED) == {}
    assert register.statements == 0
