"""Deterministic test sharding for parallel CI jobs (``pytest --shard 2/3``).

Whole files stay together so module-scoped fixtures are built once per shard.
Files are assigned heaviest-first to the lightest shard, so the split is
balanced, stable for a given collection and identical in every xdist worker,
which xdist requires.

A file's weight is its measured seconds in ``shard_durations.json``. A file
missing from it weighs its test count times the average seconds per test, so
new files still spread out. Refresh the measurements from CI's JUnit reports
(the ``backend-test-results-shard-*`` artifacts of a green dev run):

    python -m tests.sharding <pytest.xml>...
"""

import json
import re
import sys
from collections.abc import Mapping, Sequence
from pathlib import Path

DURATIONS_FILE = Path(__file__).with_name("shard_durations.json")
_DEFAULT_SECONDS_PER_TEST = 0.5
_TESTCASE = re.compile(r"<testcase\b[^>]*>")
_CLASSNAME = re.compile(r'\bclassname="([\w.]*)"')
_TIME = re.compile(r'\btime="([0-9]+(?:\.[0-9]+)?)"')


def parse_shard(value: str) -> tuple[int, int]:
    """Parse ``"index/total"`` (1-based) into a validated pair."""
    try:
        index_text, total_text = value.split("/")
        index, total = int(index_text), int(total_text)
    except ValueError as error:
        raise ValueError(f"--shard must look like 2/3, got {value!r}") from error
    if total < 1 or not 1 <= index <= total:
        raise ValueError(f"--shard index must be within 1..{total}, got {value!r}")
    return index, total


def assign_files(file_weights: Mapping[str, float], total: int) -> dict[str, int]:
    """Map each file to a 1-based shard, balancing by weight."""
    loads = [0.0] * total
    assignment: dict[str, int] = {}
    # Heaviest first; the name breaks ties so the result never depends on order.
    for path, weight in sorted(
        file_weights.items(), key=lambda item: (-item[1], item[0])
    ):
        lightest = min(range(total), key=lambda shard: (loads[shard], shard))
        loads[lightest] += weight
        assignment[path] = lightest + 1
    return assignment


def duration_key(path: str) -> str:
    """``tests/...`` relative to the API root, whatever the checkout path."""
    marker = path.rfind("/tests/")
    return path[marker + 1 :] if marker >= 0 else path


def load_durations(path: Path = DURATIONS_FILE) -> dict[str, float]:
    """Measured seconds per test file; empty when the file is absent or bad."""
    try:
        data = json.loads(path.read_text())
    except OSError, ValueError:
        return {}
    if not isinstance(data, dict):
        return {}
    return {
        str(key): float(value)
        for key, value in data.items()
        if isinstance(value, int | float) and not isinstance(value, bool) and value >= 0
    }


def weigh_files(
    counts: Mapping[str, int], durations: Mapping[str, float]
) -> dict[str, float]:
    """Measured seconds where known, else test count times the average."""
    measured = {
        path: durations[duration_key(path)]
        for path in counts
        if duration_key(path) in durations
    }
    measured_tests = sum(counts[path] for path in measured)
    per_test = (
        sum(measured.values()) / measured_tests
        if measured_tests
        else _DEFAULT_SECONDS_PER_TEST
    )
    return {
        path: measured.get(path, count * per_test) for path, count in counts.items()
    }


def shard_of(
    paths: Sequence[str],
    index: int,
    total: int,
    durations: Mapping[str, float] | None = None,
) -> set[str]:
    """The distinct file paths that belong to shard ``index`` of ``total``."""
    counts: dict[str, int] = {}
    for path in paths:
        counts[path] = counts.get(path, 0) + 1
    assignment = assign_files(weigh_files(counts, durations or {}), total)
    return {path for path, shard in assignment.items() if shard == index}


def durations_from_junit(reports: Sequence[Path]) -> dict[str, float]:
    """Seconds per test file from JUnit reports written with ``--junitxml``."""
    # The two attributes are read with patterns, not an XML parser: the report
    # is machine-written and only these plain values are needed.
    totals: dict[str, float] = {}
    for report in reports:
        for tag in _TESTCASE.findall(report.read_text()):
            classname = _CLASSNAME.search(tag)
            seconds = _TIME.search(tag)
            parts = classname.group(1).split(".") if classname else []
            module = next(
                (i for i, part in enumerate(parts) if part.startswith("test_")), None
            )
            if module is None:
                continue
            key = "/".join(parts[: module + 1]) + ".py"
            totals[key] = totals.get(key, 0.0) + (
                float(seconds.group(1)) if seconds else 0.0
            )
    return {key: round(value, 1) for key, value in sorted(totals.items())}


if __name__ == "__main__":
    measured = durations_from_junit([Path(arg) for arg in sys.argv[1:]])
    DURATIONS_FILE.write_text(json.dumps(measured, indent=1, sort_keys=True) + "\n")
    sys.stdout.write(f"{len(measured)} files, {round(sum(measured.values()))} s\n")
