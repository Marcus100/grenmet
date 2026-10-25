"""Saving, listing and correcting register observations.

One live row exists per station, observation time and kind (partial unique
index ``register_observations_live_key``, migration ``eregister_0004``). A
re-save by the observer updates their own unsent draft in place; any other
change to an hour that already has a live row is a correction: a new row that
supersedes the old one (``supersedes_id``; the old row becomes ``superseded``
and stays visible).
"""

from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import bindparam, func, select, text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User

from . import derive, encode, rules, stations
from .models import STATUS_QUEUED, STATUS_SENT, ERegisterSend
from .schemas import (
    RegisterObservationCorrection,
    RegisterObservationCreate,
    RegisterObservationRead,
    SynopValidationIssue,
)

UNSENT_EDITABLE = ("draft", "qc_pending")
ISSUE_PREVIEW = 3


def validation_issues(
    body: dict[str, Any],
    observed_at: datetime,
    station: derive.PressureSettings | None = None,
) -> list[SynopValidationIssue]:
    try:
        workbook = encode.workbook_from_body(body)
    except ValidationError as exc:
        # The body is free-form JSON: a value over a field's length is the client's
        # mistake (422 with the field), not a server error.
        return [
            SynopValidationIssue(
                field=str(error["loc"][0]) if error["loc"] else "body",
                code="invalid_value",
                message=str(error["msg"]),
                severity="error",
            )
            for error in exc.errors()
        ]
    issues, _decoded = rules.validate_synop(workbook, station)
    return [*issues, *rules.check_observation_time(workbook, observed_at)]


def require_valid_synop(
    body: dict[str, Any],
    observed_at: datetime,
    station: derive.PressureSettings | None = None,
) -> None:
    """422 with the issues when the coded workbook has errors; warnings pass."""
    issues = validation_issues(body, observed_at, station)
    errors = [issue for issue in issues if issue.severity == "error"]
    if errors:
        summary = "; ".join(f"{i.field}: {i.message}" for i in errors[:ISSUE_PREVIEW])
        raise HTTPException(
            422,
            detail={
                "message": f"Observation does not pass validation: {summary}",
                "issues": [issue.model_dump() for issue in issues],
            },
        )


async def _has_sends(app_session: AsyncSession, observation_id: UUID) -> bool:
    count = await app_session.scalar(
        select(func.count())
        .select_from(ERegisterSend)
        .where(
            ERegisterSend.observation_id == observation_id,
            ERegisterSend.status.in_((STATUS_QUEUED, STATUS_SENT)),
        )
    )
    return bool(count)


async def lock_key(
    register: AsyncSession, station_id: str, observed_at: datetime, kind: str
) -> None:
    await register.execute(
        select(
            func.pg_advisory_xact_lock(
                func.hashtextextended(
                    f"eregister-obs:{station_id}:{observed_at.astimezone(UTC).isoformat()}:{kind}",
                    0,
                )
            )
        )
    )


async def live_row(
    register: AsyncSession, station_id: str, observed_at: datetime, kind: str
) -> dict[str, Any] | None:
    result = await register.execute(
        text(
            """
            SELECT * FROM register_observations
            WHERE station_id = :station AND observed_at = :at
              AND kind = CAST(:kind AS observation_kind)
              AND state NOT IN ('rejected', 'superseded')
            FOR UPDATE
            """
        ),
        {"station": station_id, "at": observed_at, "kind": kind},
    )
    row = result.mappings().first()
    return dict(row) if row else None


def _json_params(values: dict[str, Any]) -> dict[str, Any]:
    return {
        "body": values["body"],
        "bufr": values.get("bufr"),
        "iwxxm": values.get("iwxxm"),
    }


_INSERT = text(
    """
    INSERT INTO register_observations
      (id, station_id, station_name, aerodrome_icao, kind, observed_at, issued_at,
       body, raw_tac, bufr, iwxxm, actor_id, supersedes_id)
    VALUES (:id, :station_id, :station_name, :aerodrome_icao, CAST(:kind AS observation_kind),
            :observed_at, :issued_at, CAST(:body AS jsonb), :raw_tac, CAST(:bufr AS jsonb),
            CAST(:iwxxm AS jsonb), :actor_id, :supersedes_id)
    RETURNING *
    """
).bindparams(
    bindparam("body", type_=JSONB),
    bindparam("bufr", type_=JSONB(none_as_null=True)),
    bindparam("iwxxm", type_=JSONB(none_as_null=True)),
)

_UPDATE = text(
    """
    UPDATE register_observations
    SET station_name = :station_name, aerodrome_icao = :aerodrome_icao,
        issued_at = :issued_at, body = CAST(:body AS jsonb), raw_tac = :raw_tac,
        bufr = CAST(:bufr AS jsonb), iwxxm = CAST(:iwxxm AS jsonb),
        state = 'draft', updated_at = now(),
        review_outcome = NULL, review_note = NULL,
        reviewed_by = NULL, reviewed_at = NULL
    WHERE id = :id
    RETURNING *
    """
).bindparams(
    bindparam("body", type_=JSONB),
    bindparam("bufr", type_=JSONB(none_as_null=True)),
    bindparam("iwxxm", type_=JSONB(none_as_null=True)),
)


async def create(
    *,
    register: AsyncSession,
    app_session: AsyncSession,
    data: RegisterObservationCreate,
    user: User,
) -> tuple[dict[str, Any], bool]:
    """Save an observation. Returns the row and whether it was newly inserted."""
    station = await stations.pressure_for(register, data.station_id)
    if data.kind == "SYNOP":
        require_valid_synop(data.body, data.observed_at, station)
    values = data.model_dump()
    values["body"] = derive.apply_to_body(values["body"], station)
    await lock_key(register, data.station_id, data.observed_at, data.kind)
    existing = await live_row(register, data.station_id, data.observed_at, data.kind)
    if existing is not None:
        own_draft = str(existing["actor_id"]) == str(user.id) and (
            existing["state"] in UNSENT_EDITABLE
        )
        if own_draft and not await _has_sends(app_session, existing["id"]):
            result = await register.execute(
                _UPDATE, {**values, **_json_params(values), "id": existing["id"]}
            )
            saved = dict(result.mappings().one())
            await register.commit()
            return saved, False
        await register.rollback()
        raise HTTPException(
            409,
            "An observation for this station and time already exists "
            f"({existing['id']}, {existing['state']}). Correct it instead of "
            "saving a second one.",
        )
    try:
        result = await register.execute(
            _INSERT,
            {
                **values,
                **_json_params(values),
                "actor_id": str(user.id),
                "supersedes_id": None,
            },
        )
        saved = dict(result.mappings().one())
        await register.commit()
    except IntegrityError as exc:
        await register.rollback()
        raise HTTPException(
            409, "An observation for this station and time already exists"
        ) from exc
    return saved, True


async def correct(
    *,
    register: AsyncSession,
    observation_id: UUID,
    data: RegisterObservationCorrection,
    user: User,
) -> dict[str, Any]:
    """Save a replacement that supersedes ``observation_id``."""
    result = await register.execute(
        text("SELECT * FROM register_observations WHERE id = :id FOR UPDATE"),
        {"id": str(observation_id)},
    )
    found = result.mappings().first()
    if found is None:
        raise HTTPException(404, "Observation not found")
    old = dict(found)
    if old["state"] in ("rejected", "superseded"):
        await register.rollback()
        raise HTTPException(409, f"A {old['state']} observation cannot be corrected")
    station = await stations.pressure_for(register, old["station_id"])
    if old["kind"] == "SYNOP":
        require_valid_synop(data.body, old["observed_at"], station)
    values: dict[str, Any] = {
        **data.model_dump(exclude={"reason"}),
        "id": str(uuid4()),
        "station_id": old["station_id"],
        "kind": old["kind"],
        "observed_at": old["observed_at"],
        "actor_id": str(user.id),
        "supersedes_id": str(observation_id),
    }
    values["body"] = derive.apply_to_body(values["body"], station)
    # The old row leaves the live set first so the unique index admits the new one.
    await register.execute(
        text(
            "UPDATE register_observations SET superseded_from = state,"
            " superseded_qc_notes = qc_notes, state = 'superseded',"
            " updated_at = now(), qc_notes = :notes WHERE id = :id"
        ),
        {"id": str(observation_id), "notes": (data.reason or "").strip() or None},
    )
    inserted = await register.execute(_INSERT, {**values, **_json_params(values)})
    saved = dict(inserted.mappings().one())
    await register.commit()
    return saved


async def actor_names(app_session: AsyncSession, actor_ids: set[str]) -> dict[str, str]:
    valid: list[UUID] = []
    for value in actor_ids:
        try:
            valid.append(UUID(value))
        except ValueError:
            continue
    if not valid:
        return {}
    rows = await app_session.execute(
        select(User.id, User.first_name, User.last_name, User.email).where(
            User.id.in_(valid)
        )
    )
    names: dict[str, str] = {}
    for user_id, first, last, email in rows:
        full = " ".join(part for part in (first, last) if part).strip()
        names[str(user_id)] = full or email
    return names


def listing_row(
    row: dict[str, Any],
    names: dict[str, str],
    station: derive.PressureSettings | None = None,
) -> RegisterObservationRead:
    item = RegisterObservationRead.model_validate(row)
    item.actor_name = names.get(str(row["actor_id"]))
    if row["kind"] == "SYNOP":
        body = row["body"] or {}
        item.issues = validation_issues(body, row["observed_at"], station)
        try:
            item.coded = encode.synop_tac(encode.workbook_from_body(body))
        except ValueError, TypeError:
            item.coded = None
    return item
