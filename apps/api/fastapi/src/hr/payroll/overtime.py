"""The seam between payroll and the roster rules engine's overtime bands (#380).

Payroll does not decide what counts as overtime. A pay item with method
``OVERTIME_BAND`` names a ``band`` in its params and reads that band's hours
for each approved shift from an :class:`OvertimeBandSource`.

The installed source is :class:`RosterOvertimeBands`, over #890's
``overtime_service.attendance_bands``. A department without overtime rules in
#890 gets no computed bands, so preparers may enter its band hours as MANUAL
lines with a reason; where bands are computed, manual band lines are refused so
hours are never counted twice. :class:`PendingOvertimeBands` (no bands) remains
for tests and for switching the engine off with :func:`install`.

#890 computes bands when they are read and does not store them, and its bands
for past records can shift when rules or holidays change. Payroll therefore
copies band hours into pay-line quantities when it computes a period, and the
lines lock when the period is submitted: approved figures never move.
"""

import uuid
from collections.abc import Sequence
from decimal import Decimal
from typing import Protocol

from sqlalchemy.ext.asyncio import AsyncSession

from .rules import ShiftFacts

#: Hours per band per attendance record, e.g. {att_id: {"1.5": 2, "2": 1}}. A band
#: is named as the roster rules engine (#890) names it: its multiplier as a
#: normalised decimal string (``format(rate.normalize(), "f")``).
BandHours = dict[uuid.UUID, dict[str, Decimal]]


class OvertimeBandSource(Protocol):
    #: False while no band engine exists: manual band lines are then allowed.
    available: bool

    async def computes_for(self, session: AsyncSession, department_id: str) -> bool:
        """Whether this department's overtime bands are computed (no manual lines)."""
        ...

    async def band_hours(
        self,
        session: AsyncSession,
        *,
        organisation_id: str,
        shifts: Sequence[ShiftFacts],
    ) -> BandHours:
        """Band hours for every shift given, all at once (bands may span a week)."""
        ...


class PendingOvertimeBands:
    """Installed until #380: reports no band hours for any shift."""

    available = False

    async def computes_for(self, session: AsyncSession, department_id: str) -> bool:
        del session, department_id
        return False

    async def band_hours(
        self,
        session: AsyncSession,
        *,
        organisation_id: str,
        shifts: Sequence[ShiftFacts],
    ) -> BandHours:
        del session, organisation_id, shifts
        return {}


def band_name(rate: Decimal) -> str:
    """#890 names a band by its multiplier: 1.50 -> "1.5", 2.0 -> "2"."""
    return format(rate.normalize(), "f")


class RosterOvertimeBands:
    """Band hours from the roster rules engine (#890, ``overtime_service``).

    #890 computes bands on read and its bands for past records can shift;
    payroll copies them into pay-line quantities when a period computes and the
    lines lock at submission, so approved figures never move.
    """

    available = True

    async def computes_for(self, session: AsyncSession, department_id: str) -> bool:
        from src.hr.roster import rule_service

        rules = await rule_service.rules_for_department(session, department_id)
        return rules.overtime is not None

    async def band_hours(
        self,
        session: AsyncSession,
        *,
        organisation_id: str,
        shifts: Sequence[ShiftFacts],
    ) -> BandHours:
        del organisation_id
        from sqlalchemy import select

        from src.hr.attendance.models import AttendanceRecord
        from src.hr.roster import overtime_service
        from src.hr.roster.models import RosterAssignment, RosterPeriod, ShiftCatalog

        if not shifts:
            return {}
        rows = (
            await session.execute(
                select(RosterAssignment, RosterPeriod, ShiftCatalog, AttendanceRecord)
                .join(
                    RosterPeriod, RosterPeriod.id == RosterAssignment.roster_period_id
                )
                .join(ShiftCatalog, ShiftCatalog.code == RosterAssignment.shift_code)
                .join(
                    AttendanceRecord,
                    AttendanceRecord.roster_assignment_id == RosterAssignment.id,
                )
                .where(AttendanceRecord.id.in_([s.attendance_id for s in shifts]))
            )
        ).all()
        attendance_of = {a.id: record.id for a, _, _, record in rows}
        bands = await overtime_service.attendance_bands(
            session, [(a, p, s, r) for a, p, s, r in rows]
        )
        result: BandHours = {}
        for assignment_id, assignment_bands in bands.items():
            hours: dict[str, Decimal] = {}
            for band in assignment_bands:
                name = band_name(band.rate)
                hours[name] = hours.get(name, Decimal(0)) + band.hours
            result[attendance_of[assignment_id]] = hours
        return result


_source: OvertimeBandSource = RosterOvertimeBands()


def source() -> OvertimeBandSource:
    return _source


def install(new_source: OvertimeBandSource) -> OvertimeBandSource:
    """Install a band source and return the previous one (tests restore it)."""
    global _source
    previous, _source = _source, new_source
    return previous
