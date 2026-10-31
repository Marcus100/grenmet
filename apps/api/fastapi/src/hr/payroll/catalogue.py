"""GAA's provisional pay items, loaded once as organisation data.

Only the GAA organisation receives these; every other organisation starts with
an empty catalogue. Each item is PROVISIONAL and names where its rule was read
(the GAA-GTAWU Memorandum 2024-2028, photo scan with an unverified OCR text;
see docs/hr/policy-rules.md). No amount or rate is stored: the memorandum's
dollar figures stay in HrPlus.

The load is recorded with a BaselineStep marker, so an item HR later edits or
retires is never re-created by a later seed run.
"""

from dataclasses import dataclass, field
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from src.baseline.models import BaselineStep

from .models import PayItem, PayItemKind, PayItemMethod, PayItemUnit, RuleState

GAA_ORGANISATION_ID = "gaa"
MARKER = "payroll:gaa-pay-items:v1"
MEMORANDUM = "GAA-GTAWU Memorandum 2024-2028 (OCR unverified)"
#: Article 24: the memorandum takes effect on 1 April 2024.
EFFECTIVE_FROM = date(2024, 4, 1)


@dataclass(frozen=True)
class PayItemSeed:
    code: str
    name: str
    kind: PayItemKind
    unit: PayItemUnit
    method: PayItemMethod
    source: str
    params: dict[str, Any] = field(default_factory=dict)


def _band(code: str, name: str, band: str, clauses: str) -> PayItemSeed:
    """Overtime bands are named as the roster rules engine (#890) names them:
    the band's multiplier as a normalised decimal string ("1.5", "2", "3").
    It identifies a quantity bucket; slice 1 stores no money."""
    return PayItemSeed(
        code,
        name,
        PayItemKind.OVERTIME,
        PayItemUnit.HOURS,
        PayItemMethod.OVERTIME_BAND,
        f"{MEMORANDUM}, {clauses}, PDF p. 12; band hours from the roster rules (#890)",
        {"band": band},
    )


GAA_PAY_ITEMS: tuple[PayItemSeed, ...] = (
    PayItemSeed(
        "BASE",
        "Base hours",
        PayItemKind.BASE_HOURS,
        PayItemUnit.HOURS,
        PayItemMethod.ATTENDANCE_BASE,
        f"{MEMORANDUM}, hours of work: 8 standard hours a day inclusive of a lunch break, PDF p. 11",
        {"standard_hours": "8", "hours_basis": "ELAPSED"},
    ),
    _band(
        "OT_TIME_AND_HALF",
        "Overtime at time and a half",
        "1.5",
        "Art. 6(2)(a)-(b): weekday first 4 hours, Saturday 08:00 to 12:00",
    ),
    _band(
        "OT_DOUBLE",
        "Overtime at double time",
        "2",
        "Art. 6(2)(a)-(e): weekday after 4 hours, Saturday afternoon, "
        "Sunday, public holiday or day off first 8 hours, after midnight",
    ),
    _band(
        "OT_TRIPLE",
        "Overtime at triple time",
        "3",
        "Art. 6(2)(c): Sunday, public holiday or day off after 8 hours",
    ),
    PayItemSeed(
        "PUBLIC_HOLIDAY",
        "Public holiday hours",
        PayItemKind.PUBLIC_HOLIDAY,
        PayItemUnit.HOURS,
        PayItemMethod.PUBLIC_HOLIDAY,
        f"{MEMORANDUM}, Art. 6(3), PDF p. 12; holiday dates from HR setup (provisional)",
    ),
    PayItemSeed(
        "SHIFT_PREMIUM",
        "Shift premium hours (21:00 to 06:00)",
        PayItemKind.SHIFT_PREMIUM,
        PayItemUnit.HOURS,
        PayItemMethod.TIME_WINDOW,
        f"{MEMORANDUM}, Art. 8(8), PDF p. 19; premium amount unreadable in the scan",
        {"start": "21:00", "end": "06:00"},
    ),
    PayItemSeed(
        "MEAL",
        "Meal allowance",
        PayItemKind.MEAL_ALLOWANCE,
        PayItemUnit.COUNT,
        PayItemMethod.THRESHOLD_EVENT,
        f"{MEMORANDUM}, Art. 8(1)(a) and (b), PDF p. 18",
        {
            "shift_worker_standard_hours": "8",
            "shift_worker_beyond_hours": "2",
            "non_shift_departs_after": "18:30",
            "hours_basis": "ELAPSED",
        },
    ),
    PayItemSeed(
        "CALL_OUT",
        "Call-out",
        PayItemKind.CALL_OUT,
        PayItemUnit.COUNT,
        PayItemMethod.MANUAL,
        f"{MEMORANDUM}, Art. 8(7), PDF p. 19; entered by hand with a reason for now",
    ),
    PayItemSeed(
        "CALL_OUT_MEAL",
        "Call-out meal allowance (call-out over 4 hours)",
        PayItemKind.MEAL_ALLOWANCE,
        PayItemUnit.COUNT,
        PayItemMethod.MANUAL,
        f"{MEMORANDUM}, Art. 8(1)(c), PDF p. 18; amount not stated",
    ),
)


def _rows(existing: set[str]) -> list[PayItem]:
    return [
        PayItem(
            organisation_id=GAA_ORGANISATION_ID,
            code=seed.code,
            name=seed.name,
            kind=seed.kind.value,
            unit=seed.unit.value,
            method=seed.method.value,
            params=dict(seed.params),
            effective_from=EFFECTIVE_FROM,
            rule_state=RuleState.PROVISIONAL.value,
            source_reference=seed.source,
            sort_order=order * 10,
        )
        for order, seed in enumerate(GAA_PAY_ITEMS, start=1)
        if seed.code not in existing
    ]


def seed_gaa_pay_items(session: Session) -> None:
    if session.get(BaselineStep, MARKER) is not None:
        return
    existing = set(
        session.execute(
            select(PayItem.code).where(PayItem.organisation_id == GAA_ORGANISATION_ID)
        )
        .scalars()
        .all()
    )
    session.add_all(_rows(existing))
    session.add(BaselineStep(key=MARKER))
    session.flush()


async def seed_gaa_pay_items_async(session: AsyncSession) -> None:
    if await session.get(BaselineStep, MARKER) is not None:
        return
    existing = set(
        (
            await session.execute(
                select(PayItem.code).where(
                    PayItem.organisation_id == GAA_ORGANISATION_ID
                )
            )
        )
        .scalars()
        .all()
    )
    session.add_all(_rows(existing))
    session.add(BaselineStep(key=MARKER))
    await session.flush()
