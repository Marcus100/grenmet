"""The setup checklist and the go-live gate (ADR-0066 item 3).

A business made by its own account opens online booking only once its setup is
complete: at least one active service, at least one active provider with working hours
who offers an active service, and a way for customers to reach it. Logo and colour are
optional and never block. Turning ``enabled`` on with a required item missing is a 409
that names the missing items. Businesses Barrels set up are not gated (staff and the
seed open them in their own order), but their checklist reads the same.
"""

from sqlalchemy import exists, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.organisations.models import PlatformOrganisation

from .exceptions import BookingSetupIncompleteError
from .models import BookingProfile, Provider, ProviderService, Service, WorkingHours
from .schemas import BookingSetupChecklist, BookingSetupItem, BookingSetupItemKey

#: Required items in checklist order; branding is listed after them and never required.
REQUIRED = (
    BookingSetupItemKey.SERVICES,
    BookingSetupItemKey.HOURS,
    BookingSetupItemKey.CONTACT,
)


async def _has_active_service(session: AsyncSession, organisation_id: str) -> bool:
    return bool(
        await session.scalar(
            select(
                exists().where(
                    Service.organisation_id == organisation_id,
                    Service.active.is_(True),
                )
            )
        )
    )


async def _has_bookable_provider(session: AsyncSession, organisation_id: str) -> bool:
    """An active provider with at least one working period who offers an active
    service: someone a customer could actually book."""
    query = select(
        exists()
        .where(
            Provider.organisation_id == organisation_id,
            Provider.active.is_(True),
        )
        .where(exists().where(WorkingHours.provider_id == Provider.id))
        .where(
            exists().where(
                ProviderService.provider_id == Provider.id,
                ProviderService.service_id == Service.id,
                Service.active.is_(True),
            )
        )
    )
    return bool(await session.scalar(query))


def _has_contact(profile: BookingProfile | None) -> bool:
    if profile is None:
        return False
    return any(
        (
            profile.contact_phone,
            profile.contact_whatsapp,
            profile.contact_instagram,
            profile.contact_email,
        )
    )


def _has_branding(profile: BookingProfile | None) -> bool:
    return profile is not None and (
        profile.logo_file_id is not None or profile.brand_color is not None
    )


async def checklist(
    session: AsyncSession,
    organisation_id: str,
    profile: BookingProfile | None = None,
) -> BookingSetupChecklist:
    """The checklist for ``profile`` as it stands in this transaction (pass the profile
    being saved so its unflushed contact details count)."""
    if profile is None:
        profile = await session.scalar(
            select(BookingProfile).where(
                BookingProfile.organisation_id == organisation_id
            )
        )
    done = {
        BookingSetupItemKey.SERVICES: await _has_active_service(
            session, organisation_id
        ),
        BookingSetupItemKey.HOURS: await _has_bookable_provider(
            session, organisation_id
        ),
        BookingSetupItemKey.CONTACT: _has_contact(profile),
        BookingSetupItemKey.BRANDING: _has_branding(profile),
    }
    items = [
        BookingSetupItem(key=key, done=done[key], required=key in REQUIRED)
        for key in (*REQUIRED, BookingSetupItemKey.BRANDING)
    ]
    missing = [item.key for item in items if item.required and not item.done]
    return BookingSetupChecklist(
        items=items,
        missing=missing,
        ready=not missing,
        live=bool(profile is not None and profile.enabled),
    )


async def require_ready_to_open(
    session: AsyncSession,
    *,
    organisation_id: str,
    profile: BookingProfile,
    was_enabled: bool,
) -> None:
    """Refuse to open online booking for a self-created business whose setup is not
    complete. Only the change from closed to open is gated: a live business saving
    other settings is never blocked."""
    if was_enabled or not profile.enabled:
        return
    created_by = await session.scalar(
        select(PlatformOrganisation.created_by_user_id).where(
            PlatformOrganisation.id == organisation_id
        )
    )
    if created_by is None:
        return
    result = await checklist(session, organisation_id, profile)
    if result.missing:
        raise BookingSetupIncompleteError([key.value for key in result.missing])
