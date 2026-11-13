"""Self-registering API domains (ADR-0031): the shared list stays complete.

``openapi.json`` byte identity (CI regenerates it) proves the route and tag
order. These tests cover what it cannot: a gap or duplicate in ``MOUNT_ORDER``,
and a table or outbox topic silently lost while registrations move into
manifests. The floor file lists what existed when the migration started;
additions need no edit, a deliberate removal does.
"""

import json
import subprocess
import sys
from importlib import import_module
from pathlib import Path

import pytest
from fastapi import APIRouter

from src import database, outbox
from src.audit import registry
from src.contacts.models import Contact, ContactConsent
from src.domain_manifest import Domain, Mount, resolve_router
from src.domains import (
    DOMAINS,
    MOUNT_ORDER,
    ordered_mounts,
    run_registrations,
    tracked_schemas,
)
from src.main import _LEGACY_MOUNTS
from src.orm import Base

# The worker imports the outbox handler modules, which register their topics.
import_module("src.worker.main")

FLOOR = json.loads(
    (Path(__file__).parent / "snapshots" / "domain_registry_floor.json").read_text()
)


def _legacy_without(*keys: str) -> dict[str, Mount]:
    return {k: v for k, v in _LEGACY_MOUNTS.items() if k not in keys}


def test_every_router_has_one_slot_in_mount_order() -> None:
    mounts = ordered_mounts(_LEGACY_MOUNTS)
    assert [mount.key for mount in mounts] == list(MOUNT_ORDER)
    routers = {id(resolve_router(mount.router)) for mount in mounts}
    assert len(routers) == len(mounts)


def test_only_cap_public_feeds_mount_outside_the_versioned_prefix() -> None:
    unversioned = [m.key for m in ordered_mounts(_LEGACY_MOUNTS) if not m.versioned]
    assert unversioned == ["cap.public"]


def test_registered_domains_are_not_also_legacy() -> None:
    registered = {mount.key for domain in DOMAINS for mount in domain.mounts}
    assert registered
    assert not registered & set(_LEGACY_MOUNTS)


def test_a_router_missing_from_mount_order_fails() -> None:
    extra = Domain("extra", (Mount("extra.extra", APIRouter()),))
    with pytest.raises(ValueError, match="not in MOUNT_ORDER"):
        ordered_mounts(_LEGACY_MOUNTS, (*DOMAINS, extra))


def test_a_mount_order_key_with_no_router_fails() -> None:
    with pytest.raises(ValueError, match="no router for"):
        ordered_mounts(_legacy_without("auth.login"))


def test_a_mount_must_carry_its_domain_name() -> None:
    wrong = Domain("extra", (Mount("other.extra", APIRouter()),))
    with pytest.raises(ValueError, match="must start with"):
        ordered_mounts(_LEGACY_MOUNTS, (*DOMAINS, wrong))


def test_a_domain_registered_twice_fails() -> None:
    with pytest.raises(ValueError, match="registered twice"):
        ordered_mounts(_LEGACY_MOUNTS, (*DOMAINS, DOMAINS[0]))


def test_a_mount_both_legacy_and_registered_fails() -> None:
    mount = DOMAINS[0].mounts[0]
    with pytest.raises(ValueError, match="both legacy and registered"):
        ordered_mounts({**_LEGACY_MOUNTS, mount.key: mount})


def test_no_table_is_lost() -> None:
    missing = sorted(set(FLOOR["tables"]) - set(Base.metadata.tables))
    assert missing == [], "tables no longer registered with Base.metadata"


def test_no_outbox_topic_is_lost() -> None:
    missing = sorted(set(FLOOR["outbox_topics"]) - set(outbox._HANDLERS))
    assert missing == [], "outbox topics no longer registered by the worker"


def test_the_shared_list_imports_no_domain_code() -> None:
    """``src.database`` reads ``src.domains``; importing a router there would loop."""
    code = (
        "import sys, src.domains as d\n"
        "loaded = [m for d_ in d.DOMAINS for m in (*d_.model_modules, "
        "*d_.registrations, *(str(x.router).partition(':')[0] for x in d_.mounts)) "
        "if m in sys.modules]\n"
        "print(loaded)"
    )
    result = subprocess.run(
        [sys.executable, "-c", code],
        capture_output=True,
        text=True,
        check=True,
        cwd=Path(__file__).parents[1],
    )
    assert result.stdout.strip() == "[]"


def test_manifest_routers_are_import_paths() -> None:
    for domain in DOMAINS:
        for mount in domain.mounts:
            assert isinstance(mount.router, str), mount.key


def test_a_bad_router_path_fails() -> None:
    with pytest.raises(ValueError, match="module:attribute"):
        resolve_router("src.contacts.router")
    with pytest.raises(TypeError, match="not an APIRouter"):
        resolve_router("src.contacts.models:Contact")


def test_every_manifest_table_lives_in_a_tracked_schema() -> None:
    """Alembic autogenerate silently drops a table in an untracked schema."""
    declared = tracked_schemas()
    for domain in DOMAINS:
        modules = set(domain.model_modules)
        tables = [
            table
            for table in Base.metadata.tables.values()
            if any(
                getattr(mapper.class_, "__module__", "") in modules
                for mapper in Base.registry.mappers
                if mapper.local_table is table
            )
        ]
        assert tables, f"{domain.name} declares model modules with no tables"
        for table in tables:
            assert table.schema in declared, (domain.name, table.fullname)
            assert table.schema in domain.schemas, (domain.name, table.fullname)


def test_manifest_registrations_ran_once_on_database_import() -> None:
    assert database.engine is not None
    for model in (Contact, ContactConsent):
        assert registry.tracked(model) is not None
    webhook_models = import_module("src.webhooks_out.models")
    assert registry.tracked(webhook_models.WebhookEndpoint) is not None
    run_registrations()  # a second call must not track anything twice


def test_alembic_tracks_the_manifest_schemas() -> None:
    env = (Path(__file__).parents[1] / "alembic" / "env.py").read_text()
    assert "} | tracked_schemas()" in env
    assert "import_models()" in env
