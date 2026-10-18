"""Deterministic test sharding for parallel CI jobs (``pytest --shard 2/3``).

Whole files stay together so module-scoped fixtures are built once per shard.
Files are assigned largest-first to the lightest shard (by test count), so the
split is balanced, stable for a given collection and identical in every xdist
worker, which xdist requires.
"""

from collections.abc import Sequence


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


def assign_files(file_counts: dict[str, int], total: int) -> dict[str, int]:
    """Map each file to a 1-based shard, balancing by test count."""
    loads = [0] * total
    assignment: dict[str, int] = {}
    # Heaviest first; the name breaks ties so the result never depends on order.
    for path, count in sorted(
        file_counts.items(), key=lambda item: (-item[1], item[0])
    ):
        lightest = min(range(total), key=lambda shard: (loads[shard], shard))
        loads[lightest] += count
        assignment[path] = lightest + 1
    return assignment


def shard_of(paths: Sequence[str], index: int, total: int) -> set[str]:
    """The distinct file paths that belong to shard ``index`` of ``total``."""
    counts: dict[str, int] = {}
    for path in paths:
        counts[path] = counts.get(path, 0) + 1
    assignment = assign_files(counts, total)
    return {path for path, shard in assignment.items() if shard == index}
