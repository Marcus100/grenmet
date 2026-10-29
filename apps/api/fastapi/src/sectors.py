"""The sectors a warning or alert can be tagged with (Plan your week).

The same list is `packages/gms/src/sectors.ts`; `tests/test_sectors.py` keeps
the two equal. A CAP warning carries the keys in its `GMS:sectors` parameter
and a GMS bulletin in its `sectors` value, both comma-separated. An untagged
item affects everyone.
"""

SECTORS: tuple[tuple[str, str], ...] = (
    ("tourism", "Tourism & outdoors"),
    ("marine", "Marine"),
    ("aviation", "Aviation"),
    ("agriculture", "Agriculture"),
    ("health", "Health"),
    ("roads-transport", "Roads & transport"),
)
SECTOR_KEYS = tuple(key for key, _ in SECTORS)


def split_sectors(value: str | None) -> list[str]:
    """Names in a stored list, trimmed and without blanks; not checked against the list."""
    return [part.strip() for part in (value or "").split(",") if part.strip()]


def parse_sectors(value: str | None) -> list[str]:
    """The known sectors in a stored list, in menu order, each once."""
    wanted = set(split_sectors(value))
    return [key for key in SECTOR_KEYS if key in wanted]


def unknown_sectors(value: str | None) -> list[str]:
    """Names in a stored list that are not sectors, for a clear error message."""
    return [
        part for part in dict.fromkeys(split_sectors(value)) if part not in SECTOR_KEYS
    ]
