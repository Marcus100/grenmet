"""Quarantine list for tests that fail at random (``tests/quarantine.txt``).

A quarantined test still runs and is reported, but its failure does not fail
the run (a non-strict ``xfail``). Each line names one test and the GitHub issue
that tracks the fix::

    tests/hr/test_roster.py::test_swap_keeps_hours #1234

Rules, enforced by ``tests/test_quarantine.py``: every entry needs an issue
number, an entry must name a ``tests/...::test`` node, and the list holds at
most ``MAX_ENTRIES``, so quarantine cannot become a place to park failures.
Remove the line in the pull request that fixes the test.
"""

import re
from pathlib import Path

QUARANTINE_FILE = Path(__file__).with_name("quarantine.txt")
MAX_ENTRIES = 10
_ENTRY = re.compile(r"(?P<node>tests/\S+\.py::\S+)\s+#(?P<issue>\d+)")


def quarantine_key(nodeid: str) -> str:
    """The node id without a parametrisation suffix, as the list writes it."""
    return nodeid.split("[", 1)[0]


def parse_quarantine(text: str) -> tuple[dict[str, int], list[str]]:
    """Entries by node id, and the lines that are not valid entries."""
    entries: dict[str, int] = {}
    bad: list[str] = []
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        match = _ENTRY.fullmatch(line)
        if match is None:
            bad.append(line)
            continue
        entries[match["node"]] = int(match["issue"])
    return entries, bad


def load_quarantine(path: Path = QUARANTINE_FILE) -> dict[str, int]:
    """Quarantined node ids and their issue numbers; empty when no file."""
    try:
        text = path.read_text()
    except OSError:
        return {}
    return parse_quarantine(text)[0]
