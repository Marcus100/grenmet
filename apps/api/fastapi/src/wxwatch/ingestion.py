"""Worker-only archive writes with expiring per-source leases and idempotency."""

import hmac
import json
from typing import Annotated, Literal
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import Field, JsonValue, field_validator
from sqlalchemy import text
from starlette.concurrency import run_in_threadpool

from src.models import BaseModel, UtcDateTime

from . import catalogue, derivations
from .config import wxwatch_settings
from .router import ImageSession


def authenticate_worker(authorization: Annotated[str | None, Header()] = None) -> None:
    token = wxwatch_settings.INGEST_TOKEN
    if token is None or len(token.get_secret_value()) < 32:
        raise HTTPException(503, "Archive ingestion is not configured")
    expected = f"Bearer {token.get_secret_value()}".encode()
    if not authorization or not hmac.compare_digest(authorization.encode(), expected):
        raise HTTPException(401, "Invalid collector credentials")


router = APIRouter(
    prefix="/wxwatch", tags=["wxwatch"], dependencies=[Depends(authenticate_worker)]
)
Source = Literal["goes19", "sfcana", "cimss", "trackthetropics", "uwyo"]


class RunInput(BaseModel):
    source: Source


class RunResult(BaseModel):
    id: UUID


class RunFinish(BaseModel):
    status: Literal["finished", "failed"]


class ImageInput(BaseModel):
    time_basis: Literal[
        "filename",
        "source_observation",
        "estimated_analysis",
        "rounded_source_modified",
        "source_modified",
        "unknown",
        "legacy_unknown",
    ] = "legacy_unknown"
    raw_metadata: dict[str, JsonValue] = Field(default_factory=dict)
    run_id: UUID
    storage_path: str = Field(min_length=1, max_length=1500)
    name: str = Field(min_length=1, max_length=500)
    image_url: str = Field(min_length=1, max_length=3000)
    checksum: str = Field(min_length=1, max_length=128)
    fetched_at: UtcDateTime
    observation_time: UtcDateTime | None = None
    source_modified: UtcDateTime | None = None
    width: int | None = Field(default=None, gt=0)
    height: int | None = Field(default=None, gt=0)
    file_size_bytes: int | None = Field(default=None, gt=0)
    frame_count: int | None = Field(default=None, gt=0)
    file_format: str | None = None
    is_animated: bool | None = None
    parent_url: str | None = None
    page_title: str | None = None
    etag: str | None = None
    mode: str | None = None
    download_status: str | None = None

    @field_validator("storage_path")
    @classmethod
    def safe_path(cls, value: str) -> str:
        if "\\" in value or any(p in {"", ".", ".."} for p in value.split("/")):
            raise ValueError("Expected a relative archive path")
        return value


class ImageResult(BaseModel):
    id: int
    created: bool


@router.post("/runs", response_model=RunResult)
async def start_run(body: RunInput, session: ImageSession) -> RunResult:
    await session.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:source, 0))"),
        {"source": "wxwatch-run:" + body.source},
    )
    await session.execute(
        text(
            "UPDATE collection_runs SET status='expired', finished_at=now() WHERE source=:source AND status='running' AND expires_at <= now()"
        ),
        {"source": body.source},
    )
    active = await session.scalar(
        text(
            "SELECT id FROM collection_runs WHERE source=:source AND status='running'"
        ),
        {"source": body.source},
    )
    if active:
        raise HTTPException(409, "This source already has an active collection run")
    identifier = uuid4()
    await session.execute(
        text("INSERT INTO collection_runs(id,source) VALUES (:id,:source)"),
        {"id": identifier, "source": body.source},
    )
    await session.commit()
    return RunResult(id=identifier)


@router.post("/runs/{run_id}/finish", status_code=204)
async def finish_run(run_id: UUID, body: RunFinish, session: ImageSession) -> None:
    result = await session.execute(
        text(
            "UPDATE collection_runs SET status=:status, finished_at=now() WHERE id=:id AND status='running' RETURNING id"
        ),
        {"id": run_id, "status": body.status},
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(409, "Run is not active")
    await session.commit()


@router.post("/ingest", response_model=ImageResult)
async def ingest(body: ImageInput, session: ImageSession) -> ImageResult:
    source = await session.scalar(
        text(
            "SELECT source FROM collection_runs WHERE id=:id AND status='running' AND expires_at>now() FOR UPDATE"
        ),
        {"id": body.run_id},
    )
    if source is None:
        raise HTTPException(409, "Collection lease expired or closed")
    if not body.storage_path.startswith(source + "/"):
        raise HTTPException(422, "Archive path does not match collection source")
    values = body.model_dump()
    values.update(
        spider_name=source,
        time_basis=body.time_basis if body.observation_time else "unknown",
    )
    # Hashing and image decoding are blocking work, outside the event loop.
    verification = None
    if wxwatch_settings.LOCAL_IMAGES_DIR is not None:
        verification = await run_in_threadpool(
            catalogue.inspect_file,
            wxwatch_settings.LOCAL_IMAGES_DIR,
            body.storage_path,
            body.checksum,
        )
        if verification["status"] != "verified":
            raise HTTPException(422, "Archive file could not be verified")
    # Coordinate with the operator backfill until legacy reads are retired.
    await session.execute(text("SELECT pg_advisory_xact_lock(73190507)"))
    await session.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:identity,0))"),
        {"identity": body.image_url + "\x1f" + body.checksum},
    )
    existing = await session.scalar(
        text(
            """SELECT id FROM weather_images WHERE spider_name=:source AND name=:name
            AND image_url=:url AND checksum=:checksum
            AND observation_time IS NOT DISTINCT FROM :observed
            AND source_modified IS NOT DISTINCT FROM :modified
            AND time_basis=:basis ORDER BY id LIMIT 1"""
        ),
        {
            "url": body.image_url,
            "checksum": body.checksum,
            "source": source,
            "name": body.name,
            "observed": body.observation_time,
            "modified": body.source_modified,
            "basis": values["time_basis"],
        },
    )
    values.update(
        product_key=catalogue.product_identity(values)[0],
        raw_metadata=json.dumps(body.raw_metadata),
    )
    # Keys originate exclusively from the validated model and constants above.
    columns = ",".join(values)
    placeholders = ",".join(":" + key for key in values)
    identifier = existing
    if identifier is None:
        identifier = await session.scalar(
            text(
                f"INSERT INTO weather_images ({columns}) VALUES ({placeholders}) RETURNING id"  # noqa: S608 -- fixed model keys
            ),
            values,
        )
    row = dict(
        (
            await session.execute(
                text("SELECT * FROM weather_images WHERE id=:id"), {"id": identifier}
            )
        )
        .mappings()
        .one()
    )
    connection = await session.connection()
    try:
        await connection.run_sync(
            lambda sync: catalogue.record_ingestion(
                sync, row, body.model_dump(mode="json"), verification
            )
        )
    except ValueError as exc:
        raise HTTPException(
            409, "Archive path already identifies different file bytes"
        ) from exc
    await session.commit()
    return ImageResult(id=identifier, created=existing is None)


@router.post("/derivations", response_model=derivations.DerivationResult)
async def register_derivation(
    body: derivations.DerivationInput, session: ImageSession
) -> derivations.DerivationResult:
    return await derivations.register(session, body)
