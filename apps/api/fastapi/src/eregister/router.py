from datetime import UTC, datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from src.auth.browser import BrowserUser
from src.auth.models import User
from src.auth.policy import has_permission, require_permission
from src.dependencies import SessionDep
from src.openapi_responses import AUTHENTICATED
from src.rate_limit import limiter

from . import derive, entries, metar, public, qc, rules, sends, stations
from .dependencies import PublicRegisterSession, RegisterSession
from .schemas import (
    ObservationSend,
    ObservationSendList,
    PublicCurrentConditions,
    PublicMonthSummaryResponse,
    QcDecisionRequest,
    RegisterObservationCorrection,
    RegisterObservationCreate,
    RegisterObservationList,
    RegisterObservationRead,
    ReviewRequest,
    SendObservationRequest,
    StationSettings,
    StationSettingsUpdate,
    SynopValidationRequest,
    SynopValidationResponse,
)

router = APIRouter(prefix="/eregister", tags=["eregister"])

# Saved readings show on the public weather site at once (``public.py``), so only
# register staff may record or read them. QC and senders already work the
# register, and their roles predate ``eregister.observe``, so they keep access.
# Far inside PostgreSQL's int64 OFFSET range; larger values reached the database and 500ed.
MAX_OFFSET = 10_000_000
REGISTER_ACCESS_KEYS = ("eregister.observe", "eregister.qc", "eregister.send")

REGISTER_RESPONSES = {
    **AUTHENTICATED,
    403: {
        "description": "Missing `eregister.observe`, `eregister.qc` or `eregister.send`"
    },
}


def _require_register_access(user: User) -> None:
    if not any(
        has_permission(current_user=user, permission_key=key)
        for key in REGISTER_ACCESS_KEYS
    ):
        # None held: logs the denial and raises the standard 403.
        require_permission(current_user=user, permission_key="eregister.observe")


def _read(row: dict[str, Any]) -> RegisterObservationRead:
    return RegisterObservationRead.model_validate(row)


STATE_PATTERN = (
    "^(draft|qc_pending|accepted|rejected|superseded)"
    "(,(draft|qc_pending|accepted|rejected|superseded))*$"
)


@router.get(
    "/observations",
    response_model=RegisterObservationList,
    summary="List register observations",
    description="Returns SYNOP, METAR, and SPECI observations, newest first, optionally filtered by station, kind and QC state (comma separated, for example `draft,qc_pending`), with `limit`/`offset` paging and the matching `total`. SYNOP rows carry the coded row, validation findings (each stored row is checked as saved, without the station's current pressure amounts) and who recorded them. Requires `eregister.observe`, `eregister.qc` or `eregister.send`.",
    responses=REGISTER_RESPONSES,
)
async def list_register_observations(
    user: BrowserUser,
    session: RegisterSession,
    app_session: SessionDep,
    response: Response,
    station_id: Annotated[str | None, Query(max_length=64)] = None,
    kind: str | None = Query(default=None, pattern="^(SYNOP|METAR|SPECI)$"),
    state: str | None = Query(
        default=None,
        pattern=STATE_PATTERN,
        description="Only observations in these QC states, comma separated. Awaiting acceptance: draft,qc_pending.",
    ),
    reviewed: Annotated[
        bool | None,
        Query(
            description="true: only reviewed observations; false: only unreviewed (the review queue is state=accepted, reviewed=false)."
        ),
    ] = None,
    observed_at: Annotated[
        datetime | None,
        Query(
            description="Only observations for exactly this UTC time (to find the record occupying an hour)."
        ),
    ] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0, le=MAX_OFFSET)] = 0,
) -> RegisterObservationList:
    _require_register_access(user)
    response.headers["Cache-Control"] = "private, no-store"
    states = state.split(",") if state else None
    params = {
        "station_id": station_id,
        "kind": kind,
        "states": states,
        "reviewed": reviewed,
        "observed_at": observed_at,
    }
    result = await session.execute(
        text(
            """
            SELECT * FROM register_observations
            WHERE (CAST(:station_id AS text) IS NULL OR station_id = :station_id)
              AND (CAST(:kind AS text) IS NULL OR kind = CAST(:kind AS observation_kind))
              AND (CAST(:states AS text[]) IS NULL OR state::text = ANY(CAST(:states AS text[])))
              AND (CAST(:reviewed AS boolean) IS NULL
                   OR (reviewed_at IS NOT NULL) = CAST(:reviewed AS boolean))
              AND (CAST(:observed_at AS timestamptz) IS NULL OR observed_at = :observed_at)
            ORDER BY observed_at DESC, created_at DESC
            LIMIT :limit OFFSET :offset
            """
        ),
        {**params, "limit": limit, "offset": offset},
    )
    rows = [dict(row) for row in result.mappings()]
    total = await session.scalar(
        text(
            """
            SELECT count(*) FROM register_observations
            WHERE (CAST(:station_id AS text) IS NULL OR station_id = :station_id)
              AND (CAST(:kind AS text) IS NULL OR kind = CAST(:kind AS observation_kind))
              AND (CAST(:states AS text[]) IS NULL OR state::text = ANY(CAST(:states AS text[])))
              AND (CAST(:reviewed AS boolean) IS NULL
                   OR (reviewed_at IS NOT NULL) = CAST(:reviewed AS boolean))
              AND (CAST(:observed_at AS timestamptz) IS NULL OR observed_at = :observed_at)
            """
        ),
        params,
    )
    names = await entries.actor_names(app_session, {str(r["actor_id"]) for r in rows})
    return RegisterObservationList(
        observations=[entries.listing_row(row, names) for row in rows],
        total=int(total or 0),
    )


@router.post(
    "/observations/validate-synop",
    response_model=SynopValidationResponse,
    summary="Validate a SYNOP observation",
    description="Validates the coded SYNOP workbook against the FM-12 code tables and WMO B/C1 regulations, returning field-level errors and warnings, the normalized workbook and the SI-decoded values. Warnings advise; only errors make the workbook invalid. With the station's pressure amounts (`/stations/{station_id}/settings`), blank groups 3 and 4 are worked out from `barometer_reading` and returned in `normalized`, `decoded` carries `qfe_pa` and `qnh_pa`, and a keyed group 3 or 4 that differs from the rule warns. With `observed_at`, the station's saved SYNOP of the previous hour and of 3 hours earlier are compared (hour-to-hour warnings). `expected_metar` is the METAR the observation implies; a METAR typed in `metar_text` is compared with it (warnings on that field).",
    responses={**AUTHENTICATED},
)
async def validate_synop_observation(
    body: SynopValidationRequest,
    _user: BrowserUser,
    register: PublicRegisterSession,
) -> SynopValidationResponse:
    # The station's pressure amounts (78958: owner confirmed); none if unknown.
    station = await stations.pressure_for(register, body.workbook.station_id)
    workbook = derive.apply_to_workbook(body.workbook, station)
    # The saved observations of the previous hours, for the hour-to-hour warnings.
    history = (
        {}
        if body.observed_at is None
        else await entries.history_for(
            register, body.workbook.station_id, body.observed_at
        )
    )
    issues, decoded = rules.validate_synop(workbook, station, history)
    if body.observed_at is not None:
        issues = [*issues, *rules.check_observation_time(workbook, body.observed_at)]
    valid = all(issue.severity != "error" for issue in issues)
    return SynopValidationResponse(
        valid=valid,
        issues=issues,
        normalized=workbook,
        decoded=decoded,
        expected_metar=None if decoded.is_nil_report else metar.text(workbook, decoded),
    )


@router.post(
    "/observations",
    response_model=RegisterObservationRead,
    status_code=201,
    summary="Create a register observation",
    description=(
        "Stores a structured SYNOP, METAR, or SPECI observation and returns the "
        "canonical saved record. A SYNOP is validated first: errors (including a "
        "keyed day or hour that does not match `observed_at`) are `422` with the "
        "issues in `detail.issues`; warnings are allowed. One live observation "
        "exists per station, time and kind: saving again as the observer of an "
        "unsent draft updates it in place (`200`); any other existing live "
        "observation is `409` (use the correct endpoint). Requires "
        "`eregister.observe`, `eregister.qc` or `eregister.send`; a saved SYNOP "
        "shows on the public weather site as provisional."
    ),
    responses={
        **REGISTER_RESPONSES,
        200: {
            "model": RegisterObservationRead,
            "description": "The observer's own unsent draft was updated",
        },
        409: {"description": "A live observation for this station and time exists"},
        422: {"description": "The SYNOP workbook has errors; see `detail.issues`"},
    },
)
async def create_register_observation(
    body: RegisterObservationCreate,
    user: BrowserUser,
    session: RegisterSession,
    app_session: SessionDep,
    response: Response,
) -> RegisterObservationRead:
    _require_register_access(user)
    response.headers["Cache-Control"] = "no-store"
    row, created = await entries.create(
        register=session, app_session=app_session, data=body, user=user
    )
    if not created:
        response.status_code = 200
    return _read(row)


@router.post(
    "/observations/{observation_id}/correct",
    response_model=RegisterObservationRead,
    status_code=201,
    summary="Correct a register observation",
    description=(
        "Saves a replacement that supersedes the observation (`supersedes_id`); "
        "the old one becomes `superseded` and stays listed. Station, kind and "
        "time are kept. `409` when the observation is rejected or already "
        "superseded; `422` when the replacement SYNOP has errors. The "
        "replacement starts as a draft; saving it holds any queued WIS2 file of the "
        "replaced observation until the correction is accepted (the old file is "
        "dropped) or rejected (the old file is released and the old observation "
        "returns to the state it had before). When its observer accepts it, a "
        "station-hour already sent to WIS2 is sent again marked as a correction. "
        "Requires `eregister.observe`, `eregister.qc` or `eregister.send`."
    ),
    responses={
        **REGISTER_RESPONSES,
        404: {"description": "Observation not found"},
        409: {"description": "The observation is rejected or already superseded"},
        422: {"description": "The SYNOP workbook has errors; see `detail.issues`"},
    },
)
async def correct_register_observation(
    observation_id: UUID,
    body: RegisterObservationCorrection,
    user: BrowserUser,
    session: RegisterSession,
    app_session: SessionDep,
    response: Response,
) -> RegisterObservationRead:
    _require_register_access(user)
    response.headers["Cache-Control"] = "no-store"
    saved = await entries.correct(
        register=session, observation_id=observation_id, data=body, user=user
    )
    # The replaced reading must not be retried to WIS2 while the correction is pending.
    await sends.hold_after_correction(
        app_session,
        station_id=str(saved["station_id"]),
        observed_at=saved["observed_at"],
        superseded_id=observation_id,
    )
    return _read(saved)


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
        "`eregister.send`. Only observations accepted by their observer are published: 409 "
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
    403: {
        "description": "Missing `eregister.observe`, `eregister.qc` or `eregister.send`"
    },
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
    _require_register_access(user)
    saved = await qc.transition(
        register=register,
        app_session=session,
        observation_id=observation_id,
        user=user,
        action=action,
        reason=body.reason if body else None,
    )
    if action == "accept":
        await sends.dispatch_after_acceptance(
            session=session,
            register=register,
            observation_id=observation_id,
            user=user,
        )
    return saved


@router.post(
    "/observations/{observation_id}/accept",
    response_model=RegisterObservationRead,
    summary="Accept a register observation",
    description=(
        "Moves a draft or qc_pending SYNOP to accepted after validation. The "
        "observer who keyed it may accept it alone; other register staff may "
        "too. Acceptance queues the WIS2 file and the email at once (a refused "
        "hand-off never undoes the acceptance; see the send history). Requires "
        "`eregister.observe`, `eregister.qc` or `eregister.send`. Audited."
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
    "/observations/{observation_id}/review",
    response_model=RegisterObservationRead,
    summary="Record a review of a register observation",
    description=(
        "Optional second look by register staff other than the observer: "
        "`reviewed` or `query` with a note (required for a query). Shown on the "
        "record and audited; it changes no state and never holds back WIS2 or "
        "email. Allowed on draft, qc_pending and accepted observations; a new "
        "review replaces the previous one on the record (every one is audited). "
        "Requires `eregister.observe`, `eregister.qc` or `eregister.send`."
    ),
    responses={
        **QC_RESPONSES,
        403: {"description": "Not register staff, or the observer reviewing their own"},
    },
)
async def review_register_observation(
    observation_id: UUID,
    body: ReviewRequest,
    user: BrowserUser,
    register: RegisterSession,
    session: SessionDep,
) -> RegisterObservationRead:
    _require_register_access(user)
    return await qc.review(
        register=register,
        app_session=session,
        observation_id=observation_id,
        user=user,
        outcome=body.outcome,
        note=body.note,
    )


@router.post(
    "/observations/{observation_id}/reject",
    response_model=RegisterObservationRead,
    summary="Reject a register observation (QC)",
    description=(
        "Moves a draft or qc_pending observation to rejected; a reason is "
        "required. Rejected observations are never sent or shown publicly. "
        "Rejecting a correction releases the held WIS2 file of the observation it "
        "replaced and puts that observation back to the state it had before the "
        "correction (for example `accepted`), live and correctable again. Requires register staff access. Audited."
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
    summary="Reopen an accepted or rejected observation",
    description=(
        "Moves an accepted or rejected observation back to qc_pending (any "
        "review is cleared); a reason is required. 409 once the observation was "
        "queued or sent to WIS2. Requires register staff access. Audited."
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
    description="Newest first: each email and WIS2 hand-off with its status. Requires `eregister.observe`, `eregister.qc` or `eregister.send`.",
    responses=REGISTER_RESPONSES,
)
async def list_observation_sends(
    observation_id: UUID,
    user: BrowserUser,
    session: SessionDep,
    response: Response,
) -> ObservationSendList:
    _require_register_access(user)
    response.headers["Cache-Control"] = "private, no-store"
    return ObservationSendList(sends=await sends.list_sends(session, observation_id))


@router.get(
    "/stations/{station_id}/settings",
    response_model=StationSettings,
    summary="Station pressure amounts",
    description=(
        "The fixed amounts (hPa) the register uses to work out the pressures from "
        "the barometer as read: station pressure = barometer + "
        "`total_correction_hpa`; QFE = station + `qfe_offset_hpa`; mean sea level "
        "pressure = station + `sea_level_offset_hpa`; QNH = sea level + "
        "`qnh_offset_hpa`. 78958 holds the owner-confirmed 0.0, 0.3, 1.0 and 0.1; "
        "an amount not yet supplied is null and listed in `pending`. Requires "
        "`eregister.observe`, `eregister.qc` or `eregister.send`."
    ),
    responses={**REGISTER_RESPONSES, 404: {"description": "Unknown station"}},
)
async def get_station_settings(
    station_id: str,
    user: BrowserUser,
    session: RegisterSession,
    response: Response,
) -> StationSettings:
    _require_register_access(user)
    response.headers["Cache-Control"] = "private, no-store"
    found = await stations.get(session, station_id.strip())
    if found is None:
        raise HTTPException(404, "Unknown station")
    return found


@router.put(
    "/stations/{station_id}/settings",
    response_model=StationSettings,
    summary="Set the station pressure amounts",
    description=(
        "Replaces all four amounts; every key is required and an explicit null "
        "clears one. The change is recorded in the change history (entity "
        "`eregister_station_settings`) with the amounts before and after and the "
        "actor. Requires `eregister.qc`."
    ),
    responses={**REGISTER_RESPONSES, 404: {"description": "Unknown station"}},
)
async def put_station_settings(
    station_id: str,
    body: StationSettingsUpdate,
    user: BrowserUser,
    session: RegisterSession,
    app_session: SessionDep,
    response: Response,
) -> StationSettings:
    require_permission(current_user=user, permission_key="eregister.qc")
    response.headers["Cache-Control"] = "no-store"
    station = station_id.strip()
    before, saved = await stations.update(session, station, body, actor=str(user.id))
    if before is None or saved is None:
        raise HTTPException(404, "Unknown station")
    await stations.record_change(
        app_session, user=user, station_id=station, before=before, after=saved
    )
    return saved


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
