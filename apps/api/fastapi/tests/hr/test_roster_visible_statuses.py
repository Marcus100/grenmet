"""The one definition of which roster periods are visible, and a guard that no
module copies the pair back in by hand."""

import re
from pathlib import Path

from src.hr.roster.models import ROSTER_VISIBLE_PERIOD_STATUSES, RosterPeriodStatus

SRC = Path(__file__).resolve().parents[2] / "src"
DEFINING_FILE = SRC / "hr" / "roster" / "models.py"
COPIED_PAIR = re.compile(r"RosterPeriodStatus\.PUBLISHED,\s*RosterPeriodStatus\.CLOSED")


def test_visible_periods_are_published_and_closed_only() -> None:
    assert ROSTER_VISIBLE_PERIOD_STATUSES == (
        RosterPeriodStatus.PUBLISHED,
        RosterPeriodStatus.CLOSED,
    )
    assert RosterPeriodStatus.DRAFT not in ROSTER_VISIBLE_PERIOD_STATUSES


def test_no_module_copies_the_visible_pair_by_hand() -> None:
    offenders = [
        str(path.relative_to(SRC))
        for path in SRC.rglob("*.py")
        if path != DEFINING_FILE
        and COPIED_PAIR.search(path.read_text(encoding="utf-8"))
    ]
    assert offenders == []
