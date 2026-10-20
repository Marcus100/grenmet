"""Public sites: organisation-owned settings for public forms (ADR-0025 N1/N2).

A public form names its site by key (``/contact/public/{site_key}/messages``).
The site row says which organisation owns it, where its inbox and origin are,
and how Turnstile applies. Null settings fall back to the old per-site
environment settings until those are retired.

Functions flush but never commit; the caller owns the transaction.
"""

import logging
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from src.audit import service as audit_service
from src.auth.models import User
from src.exceptions import AppException
from src.utils import secret_box

from . import service
from .config import organisations_settings
from .exceptions import PublicSiteNotFoundError, SecretStorageUnavailableError
from .models import (
    OrganisationKind,
    OrganisationStatus,
    PlatformOrganisation,
    PublicSite,
    TurnstileMode,
    new_public_site_id,
)
from .schemas import PublicSiteAdmin, PublicSiteCreate, PublicSiteUpdate

logger = logging.getLogger(__name__)

BARRELS_ORGANISATION_NAME = "Barrels Grenada"


@dataclass(frozen=True)
class DefaultSite:
    key: str
    organisation_id: str
    name: str
    accepts_contact: bool
    accepts_subscriptions: bool


#: Sites that existed before N1 as environment settings. Seeded by the migration
#: and by ``ensure_default_public_sites`` (fresh databases, baseline seed).
DEFAULT_SITES: tuple[DefaultSite, ...] = (
    DefaultSite(
        "barrels", service.BARRELS_ORGANISATION_ID, "Barrels Grenada", True, True
    ),
    DefaultSite(
        "signal", service.BARRELS_ORGANISATION_ID, "Grenada Signal", False, True
    ),
    DefaultSite("mbia", "gaa", "MBIA website", True, False),
    DefaultSite("gms-alerts", "gaa", "GMS weather alerts", False, True),
)


@dataclass(frozen=True)
class TurnstilePolicy:
    """How one site's forms are checked. ``secret`` is decrypted and never logged."""

    mode: TurnstileMode
    secret: str | None = None


@dataclass(frozen=True)
class ResolvedSite:
    key: str
    organisation_id: str
    name: str
    site_url: str | None
    contact_recipient: str | None
    accepts_contact: bool
    accepts_subscriptions: bool
    turnstile_site_key: str | None
    turnstile: TurnstilePolicy


def _decrypt(value: str | None, site_key: str) -> str | None:
    if not value:
        return None
    try:
        return secret_box.decrypt(
            value, organisations_settings.ORG_SECRET_ENCRYPTION_KEYS
        )
    except secret_box.SecretBoxError:
        logger.error("Public site secret cannot be decrypted", extra={"site": site_key})
        return None


def _resolved(site: PublicSite) -> ResolvedSite:
    return ResolvedSite(
        key=site.key,
        organisation_id=site.organisation_id,
        name=site.name,
        site_url=site.site_url,
        contact_recipient=site.contact_recipient,
        accepts_contact=site.accepts_contact,
        accepts_subscriptions=site.accepts_subscriptions,
        turnstile_site_key=site.turnstile_site_key,
        turnstile=TurnstilePolicy(
            mode=TurnstileMode(site.turnstile_mode),
            secret=_decrypt(site.turnstile_secret_encrypted, site.key),
        ),
    )


async def resolve_public_site(session: AsyncSession, key: str) -> ResolvedSite | None:
    """The site behind a public key, or None when unknown or its owner is suspended."""
    row = await session.scalar(
        select(PublicSite)
        .join(
            PlatformOrganisation, PlatformOrganisation.id == PublicSite.organisation_id
        )
        .where(
            PublicSite.key == key,
            PlatformOrganisation.status == OrganisationStatus.ACTIVE.value,
        )
    )
    return _resolved(row) if row is not None else None


async def require_public_site(session: AsyncSession, key: str) -> ResolvedSite:
    site = await resolve_public_site(session, key)
    if site is None:
        raise PublicSiteNotFoundError()
    return site


def to_admin(site: PublicSite) -> PublicSiteAdmin:
    return PublicSiteAdmin(
        id=site.id,
        organisation_id=site.organisation_id,
        key=site.key,
        name=site.name,
        site_url=site.site_url,
        contact_recipient=site.contact_recipient,
        accepts_contact=site.accepts_contact,
        accepts_subscriptions=site.accepts_subscriptions,
        turnstile_mode=TurnstileMode(site.turnstile_mode),
        turnstile_site_key=site.turnstile_site_key,
        turnstile_secret_set=bool(site.turnstile_secret_encrypted),
        created_at=site.created_at,
        updated_at=site.updated_at,
    )


async def list_sites(
    session: AsyncSession, *, organisation_id: str | None = None
) -> list[PublicSite]:
    query = select(PublicSite).order_by(PublicSite.key)
    if organisation_id is not None:
        query = query.where(PublicSite.organisation_id == organisation_id)
    return list((await session.scalars(query)).all())


def _encrypt(secret: str) -> str:
    keys = organisations_settings.ORG_SECRET_ENCRYPTION_KEYS
    if not keys:
        raise SecretStorageUnavailableError()
    return secret_box.encrypt(secret, keys)


async def create_site(
    session: AsyncSession, actor: User, payload: PublicSiteCreate
) -> PublicSite:
    if await session.get(PlatformOrganisation, payload.organisation_id) is None:
        raise AppException("Organisation not found", 404)
    if await session.scalar(select(PublicSite.id).where(PublicSite.key == payload.key)):
        raise AppException("That site key is already in use", 409)
    audit_service.set_actor(session, actor.id)
    site = PublicSite(
        id=new_public_site_id(),
        organisation_id=payload.organisation_id,
        key=payload.key,
        name=payload.name,
        site_url=payload.site_url,
        contact_recipient=str(payload.contact_recipient)
        if payload.contact_recipient
        else None,
        accepts_contact=payload.accepts_contact,
        accepts_subscriptions=payload.accepts_subscriptions,
        turnstile_mode=payload.turnstile_mode.value,
        turnstile_site_key=payload.turnstile_site_key,
        turnstile_secret_encrypted=_encrypt(payload.turnstile_secret)
        if payload.turnstile_secret
        else None,
    )
    session.add(site)
    await session.flush()
    return site


async def update_site(
    session: AsyncSession, actor: User, site_id: str, payload: PublicSiteUpdate
) -> PublicSite:
    site = await session.get(PublicSite, site_id)
    if site is None:
        raise PublicSiteNotFoundError()
    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise AppException("Send at least one field to change", 422)
    for field in ("name", "accepts_contact", "accepts_subscriptions"):
        if field in changes and changes[field] is None:
            raise AppException(f"{field} cannot be empty", 422)
    audit_service.set_actor(session, actor.id)
    if "turnstile_secret" in changes:
        secret = changes.pop("turnstile_secret")
        site.turnstile_secret_encrypted = _encrypt(secret) if secret else None
    if "turnstile_mode" in changes:
        mode = changes.pop("turnstile_mode")
        site.turnstile_mode = (mode or TurnstileMode.INHERIT).value
    if changes.get("contact_recipient") is not None:
        changes["contact_recipient"] = str(changes["contact_recipient"])
    for field, value in changes.items():
        setattr(site, field, value)
    await session.flush()
    return site


def _default_row(default: DefaultSite) -> PublicSite:
    return PublicSite(
        id=new_public_site_id(),
        organisation_id=default.organisation_id,
        key=default.key,
        name=default.name,
        accepts_contact=default.accepts_contact,
        accepts_subscriptions=default.accepts_subscriptions,
        turnstile_mode=TurnstileMode.INHERIT.value,
    )


async def ensure_default_public_sites(session: AsyncSession) -> None:
    """Create the Barrels organisation and the pre-N1 sites when missing.

    Idempotent. A site whose owner does not exist yet is skipped (``gaa`` comes
    from the installation seed, which calls this again afterwards)."""
    if await session.get(PlatformOrganisation, service.BARRELS_ORGANISATION_ID) is None:
        await service.create_organisation(
            session,
            name=BARRELS_ORGANISATION_NAME,
            kind=OrganisationKind.BARRELS,
            slug="barrels",
            organisation_id=service.BARRELS_ORGANISATION_ID,
        )
    existing = set((await session.scalars(select(PublicSite.key))).all())
    for default in DEFAULT_SITES:
        if default.key in existing:
            continue
        if await session.get(PlatformOrganisation, default.organisation_id) is None:
            continue
        session.add(_default_row(default))
    await session.flush()


def ensure_default_public_sites_sync(session: Session) -> None:
    """Synchronous twin of ``ensure_default_public_sites`` for the prestart seed."""
    if session.get(PlatformOrganisation, service.BARRELS_ORGANISATION_ID) is None:
        slug = "barrels"
        if session.scalar(
            select(PlatformOrganisation.id).where(PlatformOrganisation.slug == slug)
        ):
            slug = "barrels-grenada"
        session.add(
            PlatformOrganisation(
                id=service.BARRELS_ORGANISATION_ID,
                slug=slug,
                name=BARRELS_ORGANISATION_NAME,
                kind=OrganisationKind.BARRELS.value,
                status=OrganisationStatus.ACTIVE.value,
            )
        )
        session.flush()
    existing = set(session.scalars(select(PublicSite.key)).all())
    for default in DEFAULT_SITES:
        if default.key in existing:
            continue
        if session.get(PlatformOrganisation, default.organisation_id) is None:
            continue
        session.add(_default_row(default))
    session.flush()
