"""The seam between payroll and the roster rules engine's overtime bands (#380).

Payroll does not decide what counts as overtime. A pay item with method
``OVERTIME_BAND`` names a ``band`` in its params and reads that band's hours
for each approved shift from an :class:`OvertimeBandSource`.

Until #380 lands the installed source is :class:`PendingOvertimeBands`, which
reports no band hours, so no overtime line is computed. Preparers enter
overtime as MANUAL lines against the band's pay item in the meantime (the
service allows manual lines on OVERTIME_BAND items while the source is not
available). When #380 lands, implement this protocol over its banding and
install it with :func:`install`; nothing else in payroll changes.

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

    async def band_hours(
        self,
        session: AsyncSession,
        *,
        organisation_id: str,
        shifts: Sequence[ShiftFacts],
    ) -> BandHours:
        del session, organisation_id, shifts
        return {}


_source: OvertimeBandSource = PendingOvertimeBands()


def source() -> OvertimeBandSource:
    return _source


def install(new_source: OvertimeBandSource) -> OvertimeBandSource:
    """Install a band source and return the previous one (tests restore it)."""
    global _source
    previous, _source = _source, new_source
    return previous
