"""API conventions (ADR-0025): every route must follow them.

Existing exceptions are listed here and may only shrink. Never add to an
allowlist to make a new route pass; change the route instead.
"""

import re
from pathlib import Path

from src.config import settings
from src.main import app

SPEC = app.openapi()
PATHS = list(SPEC["paths"])

#: Public CAP feeds keep their historical URLs: external feed readers and
#: aggregators poll them (RSS, CAP XML, GeoJSON).
PUBLIC_FEED_PREFIXES = ("/api/cap/",)

#: Audience zones. The segment after the domain names who a route serves.
ZONES = {"public", "me", "org", "admin"}
#: Synonyms that must not be used for new zones.
LEGACY_ZONE_WORDS = {"manage", "studio", "dash", "dashboard", "mine", "backoffice"}
#: Existing routes that use a legacy zone word (migrate, then delete the entry).
LEGACY_ZONE_PREFIXES = {
    "/api/v1/events/manage",
    "/api/v1/organisations/mine",
    "/api/v1/hr/dashboard",
}

VERBS = {
    "get",
    "list",
    "create",
    "update",
    "delete",
    "remove",
    "add",
    "fetch",
    "do",
    "make",
    "set",
}
LITERAL = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*(?:\.[a-z0-9]+)?$")
PARAMETER = re.compile(r"^\{[a-z][a-z0-9_]*\}(?:\.[a-z0-9]+)?$")


def _segments(path: str) -> list[str]:
    return [segment for segment in path.split("/") if segment]


def test_routes_are_versioned() -> None:
    stray = [
        path
        for path in PATHS
        if not path.startswith(f"{settings.API_V1_STR}/")
        and not path.startswith(PUBLIC_FEED_PREFIXES)
    ]
    assert stray == [], f"Mount routes under {settings.API_V1_STR}: {stray}"


def test_path_segments_are_kebab_case_and_parameters_snake_case() -> None:
    bad = [
        path
        for path in PATHS
        for segment in _segments(path)
        if not (PARAMETER if segment.startswith("{") else LITERAL).match(segment)
    ]
    assert bad == [], f"Use kebab-case segments and {{snake_case}} parameters: {bad}"


def test_paths_name_resources_not_verbs() -> None:
    bad = [
        path
        for path in PATHS
        for segment in _segments(path)
        if not segment.startswith("{") and segment.split("-")[0] in VERBS
    ]
    assert bad == [], f"Use HTTP methods instead of verbs in paths: {bad}"


def test_audience_zones_use_the_standard_words() -> None:
    offenders = set()
    for path in PATHS:
        parts = _segments(path)
        if len(parts) > 3 and parts[3] in LEGACY_ZONE_WORDS:
            prefix = "/" + "/".join(parts[:4])
            if prefix not in LEGACY_ZONE_PREFIXES:
                offenders.add(prefix)
    assert offenders == set(), (
        f"Use one of {sorted(ZONES)} for the audience segment: {sorted(offenders)}"
    )


def test_legacy_zone_allowlist_only_shrinks() -> None:
    used = {
        "/" + "/".join(_segments(path)[:4])
        for path in PATHS
        if len(_segments(path)) > 3 and _segments(path)[3] in LEGACY_ZONE_WORDS
    }
    stale = LEGACY_ZONE_PREFIXES - used
    assert stale == set(), f"Remove migrated entries from LEGACY_ZONE_PREFIXES: {stale}"


def test_schema_names_are_unique_and_unqualified() -> None:
    qualified = [
        name for name in SPEC["components"]["schemas"] if name.startswith("src__")
    ]
    assert qualified == [], (
        "Two schemas share a class name, so OpenAPI qualified them and the "
        f"generated client got module-path names. Rename one: {qualified}"
    )


def test_operation_ids_are_unique() -> None:
    ids = [
        operation["operationId"]
        for item in SPEC["paths"].values()
        for operation in item.values()
        if isinstance(operation, dict) and "operationId" in operation
    ]
    duplicates = sorted({i for i in ids if ids.count(i) > 1})
    assert duplicates == []


def test_routers_mount_with_the_shared_prefix_setting() -> None:
    main = (Path(__file__).parents[1] / "src" / "main.py").read_text()
    assert 'prefix="/api/v1"' not in main, "Use prefix=settings.API_V1_STR"


def test_grenada_zone_comes_from_the_shared_helper() -> None:
    src = Path(__file__).parents[1] / "src"
    offenders = [
        str(path.relative_to(src))
        for path in src.rglob("*.py")
        if path.name != "timezones.py"
        and re.search(r"ZoneInfo\(\s*[\"']America/Grenada", path.read_text())
    ]
    assert offenders == [], (
        f"Import GRENADA or zone() from src.utils.timezones: {offenders}"
    )
