"""Self-registering API domains (ADR-0031): the shared list stays complete.

``openapi.json`` byte identity (CI regenerates it) proves the route and tag
order. These tests cover what it cannot: a gap or duplicate in ``MOUNT_ORDER``,
and a table or outbox topic silently lost while registrations move into
manifests. The floor file lists what existed when the migration started;
additions need no edit, a deliberate removal does.
"""

import json
from importlib import import_module
from pathlib import Path

import pytest
from fastapi import APIRouter

from src import outbox
from src.domain_manifest import Domain, Mount
from src.domains import DOMAINS, MOUNT_ORDER, ordered_mounts
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
    assert len({id(mount.router) for mount in mounts}) == len(mounts)


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
