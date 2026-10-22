"""Admin moderation queue for organiser verification (zone ``admin``, ADR-0025).

Staff session routes. Moderators (``events.moderate``) and superusers read the
queue and cases; only an MFA superuser decides. Decisions go through
``organisations.service.admin_set_verified`` (one write path, one audit entry).
"""

from typing import Annotated, Any

from fastapi import APIRouter, Path, Query, status

from src.dependencies import MfaAdminUser
from src.organisations.models import VerificationStatus

from . import schemas
from .dependencies import EventsSession, ModerationReader
from .service import organiser_verification

router = APIRouter(prefix="/admin/moderation", tags=["events-moderation"])

OrganisationId = Annotated[str, Path(max_length=100)]

_READ: dict[int | str, dict[str, Any]] = {
    401: {"description": "Not signed in"},
    403: {"description": "Moderator access required"},
    404: {"description": "Verification case not found"},
}
_DECIDE: dict[int | str, dict[str, Any]] = {
    **_READ,
    409: {"description": "Decision already made or not allowed from this state"},
    422: {"description": "A reason is required"},
}


@router.get(
    "/organisers",
    response_model=schemas.VerificationCaseList,
    summary="List organiser verification cases",
    description=(
        "Organisers by verification status (default `pending`), oldest request "
        "first. Moderators and superusers."
    ),
    responses=_READ,
)
async def list_verification_cases(
    *,
    session: EventsSession,
    _reader: ModerationReader,
    case_status: Annotated[
        VerificationStatus, Query(alias="status")
    ] = VerificationStatus.PENDING,
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> schemas.VerificationCaseList:
    return await organiser_verification.list_cases(
        session, status=case_status, page=page, size=size
    )


@router.get(
    "/organisers/{organisation_id}",
    response_model=schemas.VerificationCaseDetail,
    summary="View an organiser verification case",
    description=(
        "The organiser, its owners, listing counts and the verification history. "
        "Moderators and superusers."
    ),
    responses=_READ,
)
async def get_verification_case(
    *,
    session: EventsSession,
    _reader: ModerationReader,
    organisation_id: OrganisationId,
) -> schemas.VerificationCaseDetail:
    return await organiser_verification.get_case(session, organisation_id)


@router.post(
    "/organisers/{organisation_id}/approve",
    response_model=schemas.VerificationCaseDetail,
    status_code=status.HTTP_200_OK,
    summary="Approve an organiser",
    description=(
        "MFA superuser only. Verifies the organisation, so its organiser can "
        "publish, and queues `organiser.approved`. 409 when already verified."
    ),
    responses=_DECIDE,
)
async def approve_organiser(
    *,
    session: EventsSession,
    admin: MfaAdminUser,
    organisation_id: OrganisationId,
    body: schemas.VerificationApproval,
) -> schemas.VerificationCaseDetail:
    return await organiser_verification.decide(
        session, organisation_id, admin, approve=True, reason=body.reason
    )


@router.post(
    "/organisers/{organisation_id}/reject",
    response_model=schemas.VerificationCaseDetail,
    status_code=status.HTTP_200_OK,
    summary="Reject an organiser",
    description=(
        "MFA superuser only. Records the reason, leaves the organiser "
        "unverified and queues `organiser.rejected` with the reason. The "
        "organiser can resubmit. 409 when already rejected or verified."
    ),
    responses=_DECIDE,
)
async def reject_organiser(
    *,
    session: EventsSession,
    admin: MfaAdminUser,
    organisation_id: OrganisationId,
    body: schemas.VerificationRejection,
) -> schemas.VerificationCaseDetail:
    return await organiser_verification.decide(
        session, organisation_id, admin, approve=False, reason=body.reason
    )
