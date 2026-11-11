"""Convert the hourly importer's own unreviewed drafts of a month to ``historical``.

Used by ``scripts/mark_imported_historical.py``. Only a draft whose ``notes`` start
with ``cl1_import.IMPORT_NOTE_PREFIX`` (so typed by nobody), that nobody reviewed and
that was never sent, for the manual station, inside the local month. Anything else is
left as it is. The state change is audited like the QC transitions (entity
``eregister_observation``, action ``mark_historical``), one entry per record, in the
application database after the register commit.
"""

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Literal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit import service as audit_service
from src.auth.models import User
from src.exceptions import AppException

from . import entries
from .cl1_import import (
    IMPORT_NOTE_PREFIX,
    STATION_ID,
    UTC_OFFSET_HOURS,
    carry_over,
    may_update,
)
from .models import STATUS_QUEUED, STATUS_SENT, ERegisterSend
from .qc import AUDIT_ENTITY
from .schemas import RegisterObservationCreate, SynopWorkbook

AUDIT_ACTION = "mark_historical"
MONTH = re.compile(r"^(\d{4})-(0[1-9]|1[0-2])$")


class MonthError(ValueError):
    """The month argument is not YYYY-MM."""


def month_range(month: str) -> tuple[datetime, datetime]:
    """UTC range [start, end) covering the Grenada local month (UTC-4)."""
    found = MONTH.match(month)
    if found is None:
        raise MonthError("Use the month as YYYY-MM, for example 2026-10")
    year, number = int(found.group(1)), int(found.group(2))
    offset = timedelta(hours=UTC_OFFSET_HOURS)
    start = datetime(year, number, 1, tzinfo=UTC) + offset
    following = datetime(year + (number == 12), number % 12 + 1, 1, tzinfo=UTC)
    return start, following + offset


@dataclass
class Conversion:
    candidates: int = 0  # the importer's drafts in the month
    reviewed: int = 0  # left alone: somebody reviewed them
    sent: int = 0  # left alone: an email or WIS2 file was queued or sent
    converted: int = 0  # changed (or, in a dry run, would be)
    other_live: int = 0  # live rows in the month that are not the importer's drafts


_CANDIDATES = text(
    """
    SELECT id, review_outcome IS NOT NULL AS reviewed
    FROM register_observations
    WHERE station_id = :station AND kind = 'SYNOP' AND state = 'draft'
      AND starts_with(coalesce(body->>'notes', ''), :prefix)
      AND observed_at >= :start AND observed_at < :end
    ORDER BY observed_at
    """
)
_OTHER_LIVE = text(
    """
    SELECT count(*) FROM register_observations
    WHERE station_id = :station AND kind = 'SYNOP'
      AND state NOT IN ('rejected', 'superseded')
      AND observed_at >= :start AND observed_at < :end
      AND NOT (state = 'draft' AND starts_with(coalesce(body->>'notes', ''), :prefix))
    """
)
_CONVERT = text(
    """
    UPDATE register_observations
    SET state = 'historical', updated_at = now()
    WHERE id = ANY(CAST(:ids AS uuid[])) AND state = 'draft' AND review_outcome IS NULL
    RETURNING id
    """
)


async def convert_month(
    *,
    register: AsyncSession,
    app_session: AsyncSession,
    actor: User,
    month: str,
    apply: bool,
) -> Conversion:
    start, end = month_range(month)
    params = {
        "station": STATION_ID,
        "prefix": IMPORT_NOTE_PREFIX,
        "start": start,
        "end": end,
    }
    found = (await register.execute(_CANDIDATES, params)).mappings().all()
    result = Conversion(
        candidates=len(found),
        reviewed=sum(1 for row in found if row["reviewed"]),
        other_live=int(await register.scalar(_OTHER_LIVE, params) or 0),
    )
    unreviewed = [row["id"] for row in found if not row["reviewed"]]
    sent: set[UUID] = set()
    if unreviewed:
        sent = set(
            await app_session.scalars(
                select(ERegisterSend.observation_id).where(
                    ERegisterSend.observation_id.in_(unreviewed),
                    ERegisterSend.status.in_((STATUS_QUEUED, STATUS_SENT)),
                )
            )
        )
    result.sent = len(sent)
    eligible = [row_id for row_id in unreviewed if row_id not in sent]
    if not apply or not eligible:
        result.converted = len(eligible)
        await register.rollback()
        return result
    changed = [
        row[0]
        for row in await register.execute(
            _CONVERT, {"ids": [str(row_id) for row_id in eligible]}
        )
    ]
    await register.commit()
    result.converted = len(changed)
    audit_service.set_actor(app_session, actor.id)
    for row_id in changed:
        await audit_service.record_change(
            app_session,
            entity_type=AUDIT_ENTITY,
            entity_id=str(row_id),
            record_type=AUDIT_ENTITY,
            record_id=str(row_id),
            action=AUDIT_ACTION,
            changes={"state": ("draft", "historical")},
        )
    await app_session.commit()
    return result


HTTP_CONFLICT = 409

_LIVE_ROW = text(
    "SELECT state::text AS state, body->>'notes' AS notes, review_outcome, body"
    " FROM register_observations WHERE station_id = :station AND kind = 'SYNOP'"
    " AND observed_at = :at AND state NOT IN ('rejected', 'superseded')"
)


@dataclass
class SaveOutcome:
    created: int = 0
    updated: int = 0
    skipped: list[str] = field(default_factory=list)
    failed: list[str] = field(default_factory=list)


async def save_hours(
    *,
    register: AsyncSession,
    app_session: AsyncSession,
    actor: User,
    ready: list[tuple[datetime, SynopWorkbook, int]],
    state: Literal["draft", "historical"],
) -> SaveOutcome:
    """Save the sheet's passing hours, oldest first, through ``entries.create``.

    ``state`` is ``draft`` or ``historical``. An hour already in the register is
    refreshed in place only when this importer made it and nobody reviewed it
    (``cl1_import.may_update``); anything else is left alone and listed.
    """
    outcome = SaveOutcome()
    for observed_at, workbook, row in sorted(ready, key=lambda item: item[0]):
        when = f"{observed_at:%Y-%m-%d %H:%M} UTC (sheet row {row})"
        live = (
            (
                await register.execute(
                    _LIVE_ROW, {"station": STATION_ID, "at": observed_at}
                )
            )
            .mappings()
            .first()
        )
        if live is not None and not may_update(
            live["state"],
            live["notes"],
            live["review_outcome"],
            historical=state == "historical",
        ):
            outcome.skipped.append(f"{when}: already there as {live['state']}")
            continue
        data = RegisterObservationCreate(
            station_id=STATION_ID,
            kind="SYNOP",
            observed_at=observed_at,
            body=carry_over(
                workbook.model_dump(exclude_none=True),
                (live["body"] or {}) if live is not None else {},
            ),
        )
        try:
            _row, was_created = await entries.create(
                register=register,
                app_session=app_session,
                data=data,
                user=actor,
                state=state,
            )
        except AppException as exc:
            if exc.status_code == HTTP_CONFLICT:
                outcome.skipped.append(f"{when}: already there (another entry)")
            else:
                outcome.failed.append(f"{when}: {exc.message}")
        except HTTPException as exc:  # the 422 of require_valid_synop
            outcome.failed.append(f"{when}: {exc.detail}")
        else:
            if was_created:
                outcome.created += 1
            else:
                outcome.updated += 1
    return outcome
