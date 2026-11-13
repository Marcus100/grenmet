"""Manifest types for self-registering API domains (ADR-0031).

Kept apart from ``src/domains.py`` so a domain's ``register.py`` can import
them without importing the shared list, which imports every manifest.
"""

from dataclasses import dataclass

from fastapi import APIRouter


@dataclass(frozen=True)
class Mount:
    """One router and the slot it fills in ``MOUNT_ORDER``.

    ``key`` is ``<domain>.<part>``. ``versioned`` routers are mounted under
    ``settings.API_V1_STR``; the others (CAP's public feeds) at the root.
    """

    key: str
    router: APIRouter
    versioned: bool = True


@dataclass(frozen=True)
class Domain:
    """What one API domain adds to the app."""

    name: str
    mounts: tuple[Mount, ...] = ()
