"""Idempotent lineage registration for registered, verified assets."""

import json
from uuid import UUID

from fastapi import HTTPException
from pydantic import Field, JsonValue, model_validator
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.models import BaseModel, UtcDateTime

from .catalogue import identifier


class DerivationInput(BaseModel):
    input_asset_ids: list[UUID] = Field(min_length=1, max_length=100)
    output_asset_id: UUID
    processor: str = Field(min_length=1, max_length=200)
    processor_version: str = Field(min_length=1, max_length=200)
    options: dict[str, JsonValue] = Field(default_factory=dict)
    generated_at: UtcDateTime | None = None

    @model_validator(mode="after")
    def validate_lineage(self) -> "DerivationInput":
        if len(set(self.input_asset_ids)) != len(self.input_asset_ids):
            raise ValueError("Input assets must be unique")
        if self.output_asset_id in self.input_asset_ids:
            raise ValueError("Output cannot be its own input")
        if len(json.dumps(self.options, allow_nan=False).encode()) > 16384:
            raise ValueError("Processing options exceed 16 KiB")
        return self


class DerivationResult(BaseModel):
    id: UUID


async def register(session: AsyncSession, body: DerivationInput) -> DerivationResult:
    values = body.model_dump(mode="json")
    values["input_asset_ids"] = sorted(values["input_asset_ids"])
    values.pop("generated_at")
    key = identifier(
        "derivation",
        json.dumps(values, sort_keys=True, separators=(",", ":"), allow_nan=False),
    )
    await session.execute(text("SELECT pg_advisory_xact_lock(73190507)"))
    for asset in [*body.input_asset_ids, body.output_asset_id]:
        if not await session.scalar(
            text("""SELECT a.id FROM archive_assets a
            JOIN archive_replicas r ON r.asset_id=a.id
            WHERE a.id=:id AND r.state='verified' AND r.verified_sha256=a.sha256 LIMIT 1"""),
            {"id": asset},
        ):
            raise HTTPException(422, "Every asset must have a verified replica")
    cycle = await session.scalar(
        text("""WITH RECURSIVE descendants(id) AS (
        SELECT CAST(:output AS uuid) UNION
        SELECT d.output_asset_id FROM archive_derivations d
        JOIN archive_derivation_inputs i ON i.derivation_id=d.id
        JOIN descendants p ON p.id=i.asset_id)
        SELECT EXISTS(SELECT 1 FROM descendants WHERE id=ANY(CAST(:inputs AS uuid[])))"""),
        {"output": body.output_asset_id, "inputs": body.input_asset_ids},
    )
    if cycle:
        raise HTTPException(409, "Derivation would create a lineage cycle")
    existing = (
        await session.execute(
            text("SELECT generated_at FROM archive_derivations WHERE id=:id"),
            {"id": key},
        )
    ).first()
    if existing and existing.generated_at != body.generated_at:
        raise HTTPException(
            409, "Generation evidence conflicts with the registered derivation"
        )
    await session.execute(
        text("""INSERT INTO archive_derivations
        (id,output_asset_id,processor,processor_version,options,generated_at)
        VALUES (:id,:output,:processor,:version,CAST(:options AS jsonb),:generated)
        ON CONFLICT(id) DO NOTHING"""),
        {
            "id": key,
            "output": body.output_asset_id,
            "processor": body.processor,
            "version": body.processor_version,
            "options": json.dumps(body.options, allow_nan=False),
            "generated": body.generated_at,
        },
    )
    for asset in body.input_asset_ids:
        await session.execute(
            text(
                "INSERT INTO archive_derivation_inputs VALUES (:id,:asset) ON CONFLICT DO NOTHING"
            ),
            {"id": key, "asset": asset},
        )
    await session.commit()
    return DerivationResult(id=key)
