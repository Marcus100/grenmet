from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import APIRouter, Query, Response
from fastapi.responses import JSONResponse
from sqlalchemy import bindparam, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.exc import SQLAlchemyError

from src.auth.browser import BrowserUser

from . import public
from .dependencies import PublicRegisterSession, RegisterSession
from .schemas import (
    PublicCurrentConditions,
    RegisterObservationCreate,
    RegisterObservationList,
    RegisterObservationRead,
    SynopValidationIssue,
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
    description="Validates the structured SYNOP workbook and returns field-level issues plus the normalized workbook.",
)
async def validate_synop_observation(
    body: SynopValidationRequest,
    _user: BrowserUser,
) -> SynopValidationResponse:
    workbook = body.workbook
    issues: list[SynopValidationIssue] = []

    def add_issue(field: str, code: str, message: str) -> None:
        issues.append(SynopValidationIssue(field=field, code=code, message=message))

    def check_integer(field: str, minimum: int, maximum: int, label: str) -> None:
        value = getattr(workbook, field)
        if value in (None, ""):
            return
        try:
            number = int(value)
        except ValueError:
            add_issue(field, "not_integer", f"{label} must be numeric.")
            return
        if not minimum <= number <= maximum:
            add_issue(
                field,
                "out_of_range",
                f"{label} must be between {minimum} and {maximum}.",
            )

    if workbook.report_type not in (None, "", "AAXX", "BBXX", "OOXX"):
        add_issue(
            "report_type", "invalid_code", "Use AAXX, BBXX, or OOXX for this workbook."
        )
    check_integer("day", 1, 31, "Day")
    check_integer("time_utc", 0, 23, "UTC hour")
    check_integer("total_cloud", 0, 9, "Total cloud")
    check_integer("wind_dir", 0, 36, "Wind direction")
    check_integer("wind_speed", 0, 999, "Wind speed")
    station_id = workbook.station_id
    if (
        station_id is not None
        and station_id != ""
        and (len(station_id) != 5 or not station_id.isdigit())
    ):
        add_issue(
            "station_id", "invalid_station", "Station identifier must be five digits."
        )

    return SynopValidationResponse(valid=not issues, issues=issues, normalized=workbook)


@router.post(
    "/observations",
    response_model=RegisterObservationRead,
    status_code=201,
    summary="Create a register observation",
    description="Stores a structured SYNOP, METAR, or SPECI observation and returns the canonical saved record.",
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
