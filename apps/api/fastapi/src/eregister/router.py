from datetime import UTC, datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import bindparam, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.exc import SQLAlchemyError

from src.auth.browser import BrowserUser
from src.auth.policy import require_permission
from src.dependencies import SessionDep
from src.openapi_responses import AUTHENTICATED
from src.rate_limit import limiter

from . import public, qc, rules, sends
from .dependencies import PublicRegisterSession, RegisterSession
from .schemas import (
    ObservationSend,
    ObservationSendList,
    PublicCurrentConditions,
    PublicMonthSummaryResponse,
    QcDecisionRequest,
    RegisterObservationCreate,
    RegisterObservationList,
    RegisterObservationRead,
    SendObservationRequest,
    SynopValidationRequest,
    SynopValidationResponse,
)

router = APIRouter(prefix="/eregister", tags=["eregister"])


def _read(row: dict[str, Any]) -> RegisterObservationRead:
    return RegisterObservationRead.model_validate(row)


@router.get(
    "/observations",
    response_model=RegisterObservationList,
    summary="List register observations",
    description="Returns recent SYNOP, METAR, and SPECI observations, optionally filtered by station and observation kind.",
    responses={**AUTHENTICATED},
)
async def list_register_observations(
    _user: BrowserUser,
    session: RegisterSession,
    response: Response,
    station_id: Annotated[str | None, Query(max_length=64)] = None,
    kind: str | None = Query(default=None, pattern="^(SYNOP|METAR|SPECI)$"),
    state: str | None = Query(
        default=None,
        pattern="^(draft|qc_pending|accepted|rejected|superseded)$",
        description="Only observations in this QC state (the QC queue is draft and qc_pending).",
    ),
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
) -> RegisterObservationList:
    response.headers["Cache-Control"] = "private, no-store"
    result = await session.execute(
        text(
            """
            SELECT *
            FROM register_observations
            WHERE (CAST(:station_id AS text) IS NULL OR station_id = :station_id)
              AND (CAST(:kind AS text) IS NULL OR kind = CAST(:kind AS observation_kind))
              AND (CAST(:state AS text) IS NULL OR state = CAST(:state AS register_state))
            ORDER BY observed_at DESC
            LIMIT :limit
            """
        ),
        {"station_id": station_id, "kind": kind, "state": state, "limit": limit},
    )
    return RegisterObservationList(
        observations=[_read(dict(row)) for row in result.mappings()]
    )


@router.post(
    "/observations/validate-synop",
    response_model=SynopValidationResponse,
    summary="Validate a SYNOP observation",
    description="Validates the coded SYNOP workbook against the FM-12 code tables and WMO B/C1 regulations, returning field-level errors and warnings, the normalized workbook and the SI-decoded values. Warnings advise; only errors make the workbook invalid.",
    responses={**AUTHENTICATED},
)
async def validate_synop_observation(
    body: SynopValidationRequest,
    _user: BrowserUser,
) -> SynopValidationResponse:
    workbook = body.workbook
    issues, decoded = rules.validate_synop(workbook)
    valid = all(issue.severity != "error" for issue in issues)
    return SynopValidationResponse(
        valid=valid, issues=issues, normalized=workbook, decoded=decoded
    )


@router.post(
    "/observations",
    response_model=RegisterObservationRead,
    status_code=201,
    summary="Create a register observation",
    description="Stores a structured SYNOP, METAR, or SPECI observation and returns the canonical saved record.",
    responses={**AUTHENTICATED},
)
async def create_register_observation(
    body: RegisterObservationCreate,
    user: BrowserUser,
    session: RegisterSession,
    response: Response,
) -> RegisterObservationRead:
    response.headers["Cache-Control"] = "no-store"
    result = await session.execute(
        text("""
        INSERT INTO register_observations
          (id, station_id, station_name, aerodrome_icao, kind, observed_at, issued_at,
           body, raw_tac, bufr, iwxxm, actor_id)
        VALUES (:id, :station_id, :station_name, :aerodrome_icao, CAST(:kind AS observation_kind),
                :observed_at, :issued_at, CAST(:body AS jsonb), :raw_tac, CAST(:bufr AS jsonb),
                CAST(:iwxxm AS jsonb), :actor_id)
        RETURNING *
        """).bindparams(
            bindparam("body", type_=JSONB),
            bindparam("bufr", type_=JSONB(none_as_null=True)),
            bindparam("iwxxm", type_=JSONB(none_as_null=True)),
        ),
        {**body.model_dump(), "actor_id": str(user.id)},
    )
    await session.commit()
    return _read(dict(result.mappings().one()))


SEND_RESPONSES = {
    **AUTHENTICATED,
    404: {"description": "Observation not found"},
    409: {"description": "Not configured, not sendable, or already sent (use resend)"},
    422: {"description": "Observation does not pass validation"},
}


@router.post(
    "/observations/{observation_id}/email",
    response_model=ObservationSend,
    status_code=202,
    summary="Email a register observation",
    description=(
        "Queues the SYNOP text and a decoded summary for every address in "
        "EREGISTER_OBS_RECIPIENTS through the email outbox. Requires "
        "`eregister.send`. 409 when no recipients are configured or the "
        "observation was already emailed (send `resend: true` to repeat)."
    ),
    responses=SEND_RESPONSES,
)
async def email_register_observation(
    observation_id: UUID,
    user: BrowserUser,
    register: RegisterSession,
    session: SessionDep,
    body: SendObservationRequest | None = None,
) -> ObservationSend:
    require_permission(current_user=user, permission_key="eregister.send")
    item = await sends.load_sendable(register, observation_id)
    return await sends.queue_email(
        session=session,
        item=item,
        observation_id=observation_id,
        user=user,
        resend=bool(body and body.resend),
    )


@router.post(
    "/observations/{observation_id}/publish",
    response_model=ObservationSend,
    status_code=202,
    summary="Queue a register observation for WIS2",
    description=(
        "Writes the observation as a csv2bufr (Surface-RA-IV-100) CSV into the "
        "wis2box incoming drop through an ARQ job with retries. Requires "
        "`eregister.send`. Only QC-accepted observations are published: 409 "
        "otherwise, unless WIS2BOX_* is configured. The station-hour publish gate "
        "(ADR-0032) must give the hour to the manual source: 409 when the "
        "schedule gives it to the automatic source, when another observation "
        "holds the hour, or when this one is already queued (WIS2 is never "
        "repeated; `resend` is ignored)."
    ),
    responses=SEND_RESPONSES,
)
async def publish_register_observation(
    observation_id: UUID,
    user: BrowserUser,
    register: RegisterSession,
    session: SessionDep,
    body: SendObservationRequest | None = None,
) -> ObservationSend:
    require_permission(current_user=user, permission_key="eregister.send")
    item = await sends.load_sendable(register, observation_id, require_accepted=True)
    return await sends.queue_wis2(
        session=session,
        register=register,
        item=item,
        observation_id=observation_id,
        user=user,
        resend=bool(body and body.resend),
    )


QC_RESPONSES = {
    **AUTHENTICATED,
    403: {"description": "Missing `eregister.qc`, or the observer deciding their own"},
    404: {"description": "Observation not found"},
    409: {"description": "The observation is not in a state that allows this"},
    422: {"description": "Missing reason, or the observation fails validation"},
}


async def _decide(
    action: qc.QcAction,
    observation_id: UUID,
    user: BrowserUser,
    register: RegisterSession,
    session: SessionDep,
    body: QcDecisionRequest | None,
) -> RegisterObservationRead:
    require_permission(current_user=user, permission_key="eregister.qc")
    return await qc.transition(
        register=register,
        app_session=session,
        observation_id=observation_id,
        user=user,
        action=action,
        reason=body.reason if body else None,
    )


@router.post(
    "/observations/{observation_id}/accept",
    response_model=RegisterObservationRead,
    summary="Accept a register observation (QC)",
    description=(
        "Moves a draft or qc_pending SYNOP to accepted. Requires `eregister.qc`. "
        "Four-eyes: always a different person from the observer who saved it, "
        "superusers included. The observation must pass validation. Audited."
    ),
    responses=QC_RESPONSES,
)
async def accept_register_observation(
    observation_id: UUID,
    user: BrowserUser,
    register: RegisterSession,
    session: SessionDep,
    body: QcDecisionRequest | None = None,
) -> RegisterObservationRead:
    return await _decide("accept", observation_id, user, register, session, body)


@router.post(
    "/observations/{observation_id}/reject",
    response_model=RegisterObservationRead,
    summary="Reject a register observation (QC)",
    description=(
        "Moves a draft or qc_pending observation to rejected; a reason is "
        "required. Requires `eregister.qc`. Rejected observations are never "
        "sent or shown publicly. Audited."
    ),
    responses=QC_RESPONSES,
)
async def reject_register_observation(
    observation_id: UUID,
    user: BrowserUser,
    register: RegisterSession,
    session: SessionDep,
    body: QcDecisionRequest | None = None,
) -> RegisterObservationRead:
    return await _decide("reject", observation_id, user, register, session, body)


@router.post(
    "/observations/{observation_id}/reopen",
    response_model=RegisterObservationRead,
    summary="Reopen an accepted or rejected observation (QC)",
    description=(
        "Moves an accepted or rejected observation back to qc_pending; a "
        "reason is required. Requires `eregister.qc`. 409 once the observation "
        "was queued or sent to WIS2. Audited."
    ),
    responses=QC_RESPONSES,
)
async def reopen_register_observation(
    observation_id: UUID,
    user: BrowserUser,
    register: RegisterSession,
    session: SessionDep,
    body: QcDecisionRequest | None = None,
) -> RegisterObservationRead:
    return await _decide("reopen", observation_id, user, register, session, body)


@router.get(
    "/observations/{observation_id}/sends",
    response_model=ObservationSendList,
    summary="Send history of a register observation",
    description="Newest first: each email and WIS2 hand-off with its status.",
    responses={**AUTHENTICATED},
)
async def list_observation_sends(
    observation_id: UUID,
    _user: BrowserUser,
    session: SessionDep,
    response: Response,
) -> ObservationSendList:
    response.headers["Cache-Control"] = "private, no-store"
    return ObservationSendList(sends=await sends.list_sends(session, observation_id))


@router.get(
    "/public/current",
    response_model=PublicCurrentConditions,
    summary="Latest public observation at MBIA",
    description=(
        "Anonymous. The newest SYNOP for station 78958 that has not been rejected "
        "or superseded, decoded into public units and labelled provisional until "
        "accepted. Returns 503 when the register is unavailable."
    ),
    responses={503: {"description": "Register unavailable"}},
)
async def public_current_conditions(
    session: PublicRegisterSession, response: Response
) -> PublicCurrentConditions | JSONResponse:
    unavailable = JSONResponse(
        {"error": "Current conditions are unavailable"},
        status_code=503,
        headers={"Cache-Control": "no-store"},
    )
    response.headers["Cache-Control"] = "no-store"
    if session is None:
        return unavailable
    try:
        return PublicCurrentConditions(
            observation=await public.latest(session, datetime.now(UTC))
        )
    except SQLAlchemyError, OSError, TimeoutError:
        return unavailable


@router.get(
    "/public/month-summary",
    response_model=PublicMonthSummaryResponse,
    summary="MBIA month-to-date summary",
    description=(
        "Anonymous. Rainfall, rain days (24 h total of at least 0.2 mm, WMO), "
        "highest and lowest temperature from non-rejected SYNOPs for station "
        "78958, for one UTC month (default: the current month to date). "
        "Provisional until every contributing reading is accepted. `summary` is "
        "null with no readings; individual figures are null when not reported, "
        "never zero. Returns 503 when the register is unavailable."
    ),
    responses={
        429: {"description": "Rate limit exceeded"},
        503: {"description": "Register unavailable"},
    },
)
@limiter.limit("60/minute")
async def public_month_summary(
    request: Request,
    session: PublicRegisterSession,
    response: Response,
    month: Annotated[
        str | None, Query(pattern=r"^\d{4}-(0[1-9]|1[0-2])$", examples=["2026-10"])
    ] = None,
) -> PublicMonthSummaryResponse | JSONResponse:
    _ = request
    unavailable = JSONResponse(
        {"error": "Month summary is unavailable"},
        status_code=503,
        headers={"Cache-Control": "no-store"},
    )
    if session is None:
        return unavailable
    try:
        summary = await public.month_summary(session, month, datetime.now(UTC))
    except SQLAlchemyError, OSError, TimeoutError:
        return unavailable
    response.headers["Cache-Control"] = (
        "public, max-age=300, stale-while-revalidate=600"
    )
    return PublicMonthSummaryResponse(summary=summary)
