"""Manifest types for self-registering API domains (ADR-0031).

Kept apart from ``src/domains.py`` so a domain's ``register.py`` can import
them without importing the shared list, which imports every manifest.

Manifests name code by import path (``"src.x.router:router"``, ``"src.x.models"``)
instead of importing it. ``src/database.py`` and ``alembic/env.py`` read the
shared list, and routers import ``src.database``, so a manifest that imported
its router would be a circular import.
"""

from dataclasses import dataclass
from importlib import import_module

from fastapi import APIRouter


def resolve_router(target: APIRouter | str) -> APIRouter:
    """The router itself, or the one a ``"module:attribute"`` path names."""
    if isinstance(target, APIRouter):
        return target
    module_name, _, attribute = target.partition(":")
    if not module_name or not attribute:
        raise ValueError(f"router path {target!r} must be 'module:attribute'")
    router = getattr(import_module(module_name), attribute)
    if not isinstance(router, APIRouter):
        raise TypeError(f"{target!r} is not an APIRouter")
    return router


@dataclass(frozen=True)
class Mount:
    """One router and the slot it fills in ``MOUNT_ORDER``.

    ``key`` is ``<domain>.<part>``. ``router`` is the router or, in a manifest,
    its ``"module:attribute"`` path. ``versioned`` routers are mounted under
    ``settings.API_V1_STR``; the others (CAP's public feeds) at the root.
    """

    key: str
    router: APIRouter | str
    versioned: bool = True


@dataclass(frozen=True)
class Domain:
    """What one API domain adds to the app.

    ``schemas``: Postgres schemas its tables live in; Alembic autogenerate tracks
    them. ``model_modules``: modules that put its tables on ``Base.metadata``.
    ``registrations``: modules whose ``register()`` runs once, before any session
    exists (audit tracking, notification events), in the order given.
    """

    name: str
    mounts: tuple[Mount, ...] = ()
    schemas: tuple[str, ...] = ()
    model_modules: tuple[str, ...] = ()
    registrations: tuple[str, ...] = ()
