"""Manifest types for self-registering API domains (ADR-0031).

Kept apart from ``src/domains.py`` so a domain's ``register.py`` can import
them without importing the shared list, which imports every manifest.

Manifests name code by import path (``"src.x.router:router"``, ``"src.x.models"``)
instead of importing it. ``src/database.py`` and ``alembic/env.py`` read the
shared list, and routers import ``src.database``, so a manifest that imported
its router would be a circular import.
"""

from collections.abc import Callable, Mapping
from dataclasses import dataclass
from importlib import import_module
from typing import Any

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


def resolve_function(target: str) -> Callable[..., Any]:
    """The callable a ``"module:attribute"`` path names (worker jobs)."""
    module_name, _, attribute = target.partition(":")
    if not module_name or not attribute:
        raise ValueError(f"job path {target!r} must be 'module:attribute'")
    found: object = getattr(import_module(module_name), attribute)
    if not callable(found):
        raise TypeError(f"{target!r} is not callable")
    return found


@dataclass(frozen=True)
class WorkerJob:
    """One arq job of the main worker (``src.worker.main.WorkerSettings``).

    ``function`` is the job's ``"module:attribute"`` path; keep that module light
    (import task dependencies inside the function), because the worker health
    probe loads ``WorkerSettings`` without them. ``cron`` holds the keyword
    arguments of ``arq.cron`` (for example ``{"minute": {5, 35}}``); without it
    the job is only enqueued on demand.
    """

    function: str
    cron: Mapping[str, Any] | None = None


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
    ``worker_modules``: modules the main worker imports at startup and before each
    outbox drain (outbox handlers register on import). ``jobs``: its arq jobs.
    """

    name: str
    mounts: tuple[Mount, ...] = ()
    schemas: tuple[str, ...] = ()
    model_modules: tuple[str, ...] = ()
    registrations: tuple[str, ...] = ()
    worker_modules: tuple[str, ...] = ()
    jobs: tuple[WorkerJob, ...] = ()
