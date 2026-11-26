"""The cross-domain record link registry (src/record_links.py)."""

import random
import string

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src import record_links
from src.organisations.models import Membership


def _kind() -> str:
    letters = "".join(random.choices(string.ascii_lowercase, k=8))
    return f"test_{letters}.thing"


async def _none(
    _session: AsyncSession,
    _organisation_id: str,
    _membership: Membership,
    _ids: list[str],
) -> dict[str, record_links.RecordLink]:
    return {}


def test_kinds_must_be_domain_dot_noun() -> None:
    for bad in ("incident", "Incidents.incident", "incidents.incident.extra", ""):
        with pytest.raises(ValueError, match="Record kinds"):
            record_links.register(bad, _none)


def test_a_kind_has_one_resolver() -> None:
    kind = _kind()
    record_links.register(kind, _none)
    record_links.register(kind, _none)  # the same resolver again is fine

    async def other(
        _session: AsyncSession,
        _organisation_id: str,
        _membership: Membership,
        _ids: list[str],
    ) -> dict[str, record_links.RecordLink]:
        return {}

    with pytest.raises(ValueError, match="already has a resolver"):
        record_links.register(kind, other)


@pytest.mark.asyncio
async def test_unknown_kinds_and_unrequested_ids_are_left_out(
    db_async: AsyncSession,
) -> None:
    kind = _kind()

    async def resolver(
        _session: AsyncSession,
        _organisation_id: str,
        _membership: Membership,
        _ids: list[str],
    ) -> dict[str, record_links.RecordLink]:
        return {
            "a": record_links.RecordLink(title="A"),
            "stray": record_links.RecordLink(title="not asked for"),
        }

    record_links.register(kind, resolver)
    found = await record_links.resolve(
        db_async,
        organisation_id="org_x",
        membership=Membership(organisation_id="org_x"),
        refs=[(kind, "a"), ("nobody.owns", "b")],
    )
    assert found == {(kind, "a"): record_links.RecordLink(title="A")}
