from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Query, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy import bindparam, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.exc import SQLAlchemyError

from src.auth.browser import BrowserUser
from src.openapi_responses import AUTHENTICATED
from src.rate_limit import limiter

from . import public, rules
from .dependencies import PublicRegisterSession, RegisterSession
from .schemas import (
    PublicCurrentConditions,
    PublicMonthSummaryResponse,
    RegisterObservationCreate,
    RegisterObservationList,
    RegisterObservationRead,
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
            ORDER BY observed_at DESC
            LIMIT :limit
            """
        ),
        {"station_id": station_id, "kind": kind, "limit": limit},
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
