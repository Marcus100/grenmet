"""Contacts routes (ADR-0028).

Organisation routes (`/contacts/org/*`) act for ``X-Barrels-Organisation`` and need the
``contacts`` entitlement: members read, admins and owners write, merge and erase.
`/contacts/admin/*` is a superuser read across organisations. There are no public
routes. Routers commit; service functions flush.
"""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, status

from src.dependencies import AdminUser, SessionDep
from src.openapi_responses import AUTHENTICATED, BAD_REQUEST, CONFLICT, NOT_FOUND
from src.organisations.dependencies import OrgContext, require_org_app
from src.organisations.models import MembershipRole
from src.pagination import PaginationDep

from . import service
from .models import Contact
from .schemas import (
    ContactConsentHistoryPublic,
    ContactConsentPublic,
    ContactConsentSet,
    ContactCreate,
    ContactDetailPublic,
    ContactListPublic,
    ContactMerge,
    ContactPublic,
    ContactUpdate,
)

router = APIRouter(prefix="/contacts", tags=["contacts"])

ContactsOrgMember = Annotated[OrgContext, Depends(require_org_app("contacts"))]
ContactsOrgAdmin = Annotated[
    OrgContext, Depends(require_org_app("contacts", MembershipRole.ADMIN))
]

READ_ERRORS = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND}
WRITE_ERRORS = {**AUTHENTICATED, **BAD_REQUEST, **NOT_FOUND, **CONFLICT}


async def _detail(session: SessionDep, contact: Contact) -> ContactDetailPublic:
    current = await service.current_consents(session, contact.id)
    return ContactDetailPublic.model_validate(
        {
            **ContactPublic.model_validate(contact, from_attributes=True).model_dump(),
            "consents": [
                ContactConsentPublic.model_validate(c, from_attributes=True)
                for c in current.values()
            ],
        }
    )


def _page(rows: list[Contact], count: int, page: int, size: int) -> ContactListPublic:
    return ContactListPublic(
        data=[ContactPublic.model_validate(r, from_attributes=True) for r in rows],
        count=count,
        page=page,
        size=size,
        total_pages=(count + size - 1) // size if count > 0 else 1,
    )


@router.get(
    "/org/contacts",
    response_model=ContactListPublic,
    summary="List my organisation's contacts",
    description=(
        "Paginated. `q` searches names, or matches an exact email address when it "
        "contains `@`. Erased contacts are hidden unless `include_erased` is true."
    ),
    operation_id="contactsListOrgContacts",
    responses=READ_ERRORS,
)
async def list_org_contacts(
    *,
    session: SessionDep,
    org: ContactsOrgMember,
    pagination: PaginationDep,
    q: Annotated[str | None, Query(max_length=254)] = None,
    include_erased: bool = False,
) -> Any:
    rows, count = await service.list_contacts(
        session,
        organisation_id=org.organisation_id,
        q=q,
        include_erased=include_erased,
        pagination=pagination,
    )
    return _page(rows, count, pagination.page, pagination.size)


@router.post(
    "/org/contacts",
    response_model=ContactDetailPublic,
    summary="Add or update a contact by email",
    description=(
        "Idempotent on the email address: an existing contact is returned with "
        "blank details filled in. Recorded with source `manual`."
    ),
    operation_id="contactsUpsertOrgContact",
    responses=WRITE_ERRORS,
)
async def upsert_org_contact(
    *, session: SessionDep, org: ContactsOrgAdmin, payload: ContactCreate
) -> Any:
    contact = await service.upsert_contact(
        session,
        org.organisation_id,
        email=str(payload.email),
        name=payload.name,
        phone=payload.phone,
        source=service.MANUAL_SOURCE,
    )
    result = await _detail(session, contact)
    await session.commit()
    return result


@router.get(
    "/org/contacts/{contact_id}",
    response_model=ContactDetailPublic,
    summary="Get a contact",
    description="One contact with its current consent decisions.",
    operation_id="contactsGetOrgContact",
    responses=READ_ERRORS,
)
async def get_org_contact(
    *, session: SessionDep, org: ContactsOrgMember, contact_id: str
) -> Any:
    contact = await service.get_contact(session, org.organisation_id, contact_id)
    return await _detail(session, contact)


@router.patch(
    "/org/contacts/{contact_id}",
    response_model=ContactDetailPublic,
    summary="Update a contact",
    description="Change the name or phone. The email address is the identity.",
    operation_id="contactsUpdateOrgContact",
    responses=WRITE_ERRORS,
)
async def update_org_contact(
    *,
    session: SessionDep,
    org: ContactsOrgAdmin,
    contact_id: str,
    payload: ContactUpdate,
) -> Any:
    contact = await service.get_contact(session, org.organisation_id, contact_id)
    await service.update_contact(
        session,
        contact,
        actor=org.user,
        fields=payload.model_dump(exclude_unset=True),
    )
    result = await _detail(session, contact)
    await session.commit()
    return result


@router.get(
    "/org/contacts/{contact_id}/consents",
    response_model=ContactConsentHistoryPublic,
    summary="Get a contact's consent history",
    description="The current decision per purpose and every decision, oldest first.",
    operation_id="contactsGetOrgContactConsents",
    responses=READ_ERRORS,
)
async def get_org_contact_consents(
    *, session: SessionDep, org: ContactsOrgMember, contact_id: str
) -> Any:
    contact = await service.get_contact(session, org.organisation_id, contact_id)
    current = await service.current_consents(session, contact.id)
    history = await service.consent_history(session, contact.id)
    return ContactConsentHistoryPublic(
        current=[
            ContactConsentPublic.model_validate(c, from_attributes=True)
            for c in current.values()
        ],
        history=[
            ContactConsentPublic.model_validate(c, from_attributes=True)
            for c in history
        ],
    )


@router.post(
    "/org/contacts/{contact_id}/consents",
    response_model=ContactConsentPublic,
    status_code=status.HTTP_201_CREATED,
    summary="Record a consent decision",
    description="Appends a grant or revocation; earlier decisions are kept.",
    operation_id="contactsSetOrgContactConsent",
    responses=WRITE_ERRORS,
)
async def set_org_contact_consent(
    *,
    session: SessionDep,
    org: ContactsOrgAdmin,
    contact_id: str,
    payload: ContactConsentSet,
) -> Any:
    contact = await service.get_contact(session, org.organisation_id, contact_id)
    row = await service.set_consent(
        session, contact, payload.purpose, payload.granted, source=payload.source
    )
    result = ContactConsentPublic.model_validate(row, from_attributes=True)
    await session.commit()
    return result


@router.post(
    "/org/contacts/{contact_id}/merge",
    response_model=ContactDetailPublic,
    summary="Merge another contact into this one",
    description=(
        "Explicit and audited. Moves the other contact's consent history here, "
        "keeps the earlier creation date and deletes the other contact."
    ),
    operation_id="contactsMergeOrgContact",
    responses=WRITE_ERRORS,
)
async def merge_org_contact(
    *,
    session: SessionDep,
    org: ContactsOrgAdmin,
    contact_id: str,
    payload: ContactMerge,
) -> Any:
    contact = await service.merge_contacts(
        session,
        org.user,
        contact_id,
        payload.drop_contact_id,
        organisation_id=org.organisation_id,
    )
    result = await _detail(session, contact)
    await session.commit()
    return result


@router.post(
    "/org/contacts/{contact_id}/erase",
    response_model=ContactDetailPublic,
    summary="Erase a contact's personal details",
    description=(
        "Blanks email, name and phone, revokes every consent and keeps only the "
        "email hash so the erasure holds. Irreversible."
    ),
    operation_id="contactsEraseOrgContact",
    responses=WRITE_ERRORS,
)
async def erase_org_contact(
    *, session: SessionDep, org: ContactsOrgAdmin, contact_id: str
) -> Any:
    contact = await service.get_contact(session, org.organisation_id, contact_id)
    await service.erase_contact(session, contact, actor=org.user)
    result = await _detail(session, contact)
    await session.commit()
    return result


@router.get(
    "/admin/contacts",
    response_model=ContactListPublic,
    summary="List contacts across organisations",
    description="Superuser read. Filter by `organisation_id`; same search as the organisation list.",
    operation_id="contactsListAdminContacts",
    responses={**AUTHENTICATED, **BAD_REQUEST},
)
async def list_admin_contacts(
    *,
    session: SessionDep,
    _admin: AdminUser,
    pagination: PaginationDep,
    organisation_id: Annotated[str | None, Query(max_length=100)] = None,
    q: Annotated[str | None, Query(max_length=254)] = None,
    include_erased: bool = False,
) -> Any:
    rows, count = await service.list_contacts(
        session,
        organisation_id=organisation_id,
        q=q,
        include_erased=include_erased,
        pagination=pagination,
    )
    return _page(rows, count, pagination.page, pagination.size)
