import pytest

from tests.sharding import assign_files, parse_shard, shard_of

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
