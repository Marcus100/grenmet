"""Links between records of different domains (ADR-0067 decision 3).

Airport operations modules point at each other's records as a ``(kind, id)``
pair, for example ``("incidents.incident", "inc_...")``, and never import each
other. A domain that owns a kind registers one resolver for it here (from its
manifest's ``registrations``); a domain that shows a reference asks this module
for the title, without knowing who owns the kind.

A resolver answers only for the viewer's organisation and only with what the
viewer may see: it returns nothing for a record that is missing, in another
organisation, or hidden from the viewer (a missing key, a private record), and
the caller shows "record not available". Kinds are ``<domain>.<noun>``.
"""

import re
from collections.abc import Awaitable, Callable, Iterable
from dataclasses import dataclass

from sqlalchemy.ext.asyncio import AsyncSession

from src.organisations.models import Membership

KIND_PATTERN = re.compile(r"^[a-z_]+\.[a-z_]+$")


@dataclass(frozen=True)
class RecordLink:
    """What a viewer may see of a linked record."""

    title: str


#: ``(session, organisation_id, membership, ids)`` to the visible records by id.
Resolver = Callable[
    [AsyncSession, str, Membership, list[str]], Awaitable[dict[str, RecordLink]]
]

_RESOLVERS: dict[str, Resolver] = {}


def register(kind: str, resolver: Resolver) -> None:
    if not KIND_PATTERN.match(kind):
        raise ValueError(f"Record kinds are '<domain>.<noun>': {kind!r}")
    if kind in _RESOLVERS and _RESOLVERS[kind] is not resolver:
        raise ValueError(f"Record kind already has a resolver: {kind}")
    _RESOLVERS[kind] = resolver


def is_known(kind: str) -> bool:
    return kind in _RESOLVERS


async def resolve(
    session: AsyncSession,
    *,
    organisation_id: str,
    membership: Membership,
    refs: Iterable[tuple[str, str]],
) -> dict[tuple[str, str], RecordLink]:
    """The visible records among ``refs``; anything else is left out.

    One resolver call per kind, so a page of references costs one query each."""
    by_kind: dict[str, set[str]] = {}
    for kind, record_id in refs:
        by_kind.setdefault(kind, set()).add(record_id)
    found: dict[tuple[str, str], RecordLink] = {}
    for kind, ids in by_kind.items():
        resolver = _RESOLVERS.get(kind)
        if resolver is None:
            continue
        links = await resolver(session, organisation_id, membership, sorted(ids))
        for record_id, link in links.items():
            if record_id in ids:
                found[(kind, record_id)] = link
    return found
