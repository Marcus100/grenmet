from pathlib import Path

import pytest

from tests.sharding import (
    assign_files,
    duration_key,
    durations_from_junit,
    load_durations,
    parse_shard,
    shard_of,
    weigh_files,
)

pytestmark = pytest.mark.unit


def test_parse_shard_accepts_one_based_index() -> None:
    assert parse_shard("2/3") == (2, 3)


@pytest.mark.parametrize("value", ["0/3", "4/3", "1/0", "x", "1-3", "1/3/5"])
def test_parse_shard_rejects_bad_values(value: str) -> None:
    with pytest.raises(ValueError):
        parse_shard(value)


def test_every_file_lands_in_exactly_one_shard() -> None:
    paths = [f"tests/test_{n}.py" for n in range(40) for _ in range(n % 7 + 1)]
    seen: list[str] = []
    for index in (1, 2, 3):
        seen.extend(shard_of(paths, index, 3))
    assert sorted(seen) == sorted(set(paths))


def test_assignment_is_balanced_and_deterministic() -> None:
    counts = {"a.py": 50, "b.py": 30, "c.py": 30, "d.py": 20, "e.py": 10, "f.py": 10}
    first = assign_files(counts, 3)
    assert first == assign_files(dict(reversed(list(counts.items()))), 3)
    loads = [sum(c for p, c in counts.items() if first[p] == s) for s in (1, 2, 3)]
    assert max(loads) - min(loads) <= 20


def test_single_shard_keeps_everything() -> None:
    assert shard_of(["a.py", "b.py", "a.py"], 1, 1) == {"a.py", "b.py"}


def test_measured_seconds_outweigh_test_counts() -> None:
    # One slow file with few tests must not share a shard with the other heavy one.
    paths = ["tests/slow.py"] * 2 + ["tests/big.py"] * 50 + ["tests/small.py"] * 10
    durations = {"tests/slow.py": 100.0, "tests/big.py": 90.0, "tests/small.py": 5.0}
    first = shard_of(paths, 1, 2, durations)
    second = shard_of(paths, 2, 2, durations)
    assert first == {"tests/slow.py"}
    assert second == {"tests/big.py", "tests/small.py"}


def test_unmeasured_files_weigh_their_count_times_the_average() -> None:
    counts = {"/ci/work/tests/known.py": 10, "/ci/work/tests/new.py": 20}
    weights = weigh_files(counts, {"tests/known.py": 30.0})
    assert weights == {"/ci/work/tests/known.py": 30.0, "/ci/work/tests/new.py": 60.0}
    assert weigh_files({"a.py": 4}, {}) == {"a.py": 2.0}


def test_duration_key_ignores_the_checkout_path() -> None:
    assert duration_key("/home/x/apps/api/fastapi/tests/hr/test_a.py") == (
        "tests/hr/test_a.py"
    )
    assert duration_key("a.py") == "a.py"


def test_load_durations_tolerates_a_missing_or_bad_file(tmp_path: Path) -> None:
    assert load_durations(tmp_path / "absent.json") == {}
    bad = tmp_path / "bad.json"
    bad.write_text("[1, 2]")
    assert load_durations(bad) == {}
    good = tmp_path / "good.json"
    good.write_text('{"tests/a.py": 1.5, "tests/b.py": "x", "tests/c.py": -1}')
    assert load_durations(good) == {"tests/a.py": 1.5}


def test_durations_from_junit_sums_seconds_per_file(tmp_path: Path) -> None:
    report = tmp_path / "report.xml"
    report.write_text(
        "<testsuites><testsuite>"
        '<testcase classname="tests.hr.test_a.TestX" name="one" time="1.25"/>'
        '<testcase classname="tests.hr.test_a" name="two" time="0.5"/>'
        '<testcase classname="tests.test_b" name="three" time="2"/>'
        '<testcase classname="other" name="skipped" time="9"/>'
        "</testsuite></testsuites>"
    )
    assert durations_from_junit([report]) == {
        "tests/hr/test_a.py": 1.8,
        "tests/test_b.py": 2.0,
    }


def test_the_committed_durations_file_is_valid() -> None:
    durations = load_durations()
    assert durations, "run python -m tests.sharding <reports> to create it"
    assert all(key.startswith("tests/") and key.endswith(".py") for key in durations)
