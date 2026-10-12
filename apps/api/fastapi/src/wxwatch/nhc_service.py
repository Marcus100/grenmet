"""SQL-backed NHC workspace. Collection runs only in the dedicated worker."""

import json
from datetime import date
from typing import Any
from uuid import NAMESPACE_URL, UUID, uuid4, uuid5

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import NotFoundError

from .nhc_schemas import (
    FactKey,
    GuidanceFact,
    GuidanceGridSample,
    GuidanceSource,
    GuidanceSystem,
    NhcContent,
    NhcEdition,
    NhcFamily,
    NhcJob,
    NhcPage,
    NhcPrefill,
    ProductGuidance,
)

EDITION_SELECT = """SELECT e.id,p.key AS product_key,p.title,d.family,d.kind,d.storm_id,
    e.issued_at,d.header_issued_at,e.observed_at,e.reference_time,e.valid_start,e.valid_end,
    e.first_received_at, last_event.checked_at AS last_checked_at,
    last_event.attempted_at AS last_attempted_at,
    coalesce(state.metadata->>'status',last_event.source_metadata->>'status','success') AS status,
    CASE WHEN state.metadata IS NULL THEN true ELSE
      coalesce((state.metadata->>'active')::boolean,true) AND
      coalesce(state.metadata->>'storm_id','')=coalesce(d.storm_id,'') END AS active,
    (state.metadata->>'stale')::boolean AS stale,
    e.source_metadata->'source'->>'sha256' AS sha256,
    e.source_metadata->'source'->>'url' AS source_url,
    d.decoded_metadata AS decoded
    FROM archive_editions e JOIN archive_products p ON p.id=e.product_id
    JOIN archive_nhc_decoded d ON d.edition_id=e.id
    LEFT JOIN archive_nhc_product_state state ON state.product_key=p.key
    LEFT JOIN LATERAL (SELECT checked_at,attempted_at,source_metadata FROM archive_nhc_events
        WHERE product_key=substring(p.key from 5) ORDER BY attempted_at DESC,id DESC LIMIT 1) last_event ON true"""


async def assets(session: AsyncSession, edition_id: UUID) -> list[dict[str, Any]]:
    return [
        dict(row)
        for row in (
            await session.execute(
                text("""SELECT a.id AS asset_id,ea.role,a.media_type,a.byte_size
        FROM archive_edition_assets ea JOIN archive_assets a ON a.id=ea.asset_id
        WHERE ea.edition_id=:id ORDER BY ea.role,a.id"""),
                {"id": edition_id},
            )
        ).mappings()
    ]


async def browse(
    session: AsyncSession,
    *,
    family: NhcFamily | None,
    product: str | None,
    storm: str | None,
    start: date | None,
    end: date | None,
    latest: bool,
    offset: int,
    limit: int,
) -> NhcPage:
    # Rank before filtering dates: latest must not silently mean latest within an old window.
    sql = (
        "SELECT * FROM (SELECT selected.*,row_number() OVER(PARTITION BY product_key,coalesce(storm_id,'') ORDER BY issued_at DESC NULLS LAST,first_received_at DESC,id DESC) AS rank FROM ("  # noqa: S608 -- only constant SQL; values are bound
        + EDITION_SELECT
        + ") selected) editions WHERE true"  # noqa: S608 -- constant SQL only; inputs use bound parameters
    )
    params: dict[str, Any] = {"offset": offset, "limit": limit + 1}
    for key, value, clause in (
        ("family", family, "family=:family"),
        ("product", product, "(title ILIKE :product OR product_key ILIKE :product)"),
        ("storm", storm, "storm_id=:storm"),
        ("start", start, "issued_at>=CAST(:start AS date)"),
        ("end", end, "issued_at<CAST(:end AS date)+INTERVAL '1 day'"),
    ):
        if value is not None:
            sql += " AND " + clause
            params[key] = (
                "%" + value + "%"
                if key == "product" and isinstance(value, str)
                else value
            )
    if latest:
        sql += " AND rank=1 AND active"
    sql += " ORDER BY issued_at DESC NULLS LAST,first_received_at DESC,id DESC OFFSET :offset LIMIT :limit"
    rows = list((await session.execute(text(sql), params)).mappings())
    items = [
        NhcEdition.model_validate({**row, "assets": await assets(session, row["id"])})
        for row in rows[:limit]
    ]
    return NhcPage(items=items, has_more=len(rows) > limit, offset=offset)


async def content(session: AsyncSession, edition_id: UUID) -> NhcContent:
    row = (
        (
            await session.execute(
                text(EDITION_SELECT + " WHERE e.id=:id"), {"id": edition_id}
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise NotFoundError("NHC edition not found")
    decoded = row["decoded"]
    return NhcContent(
        edition=NhcEdition.model_validate(
            {**row, "assets": await assets(session, edition_id)}
        ),
        text=decoded.get("text"),
        decoded=decoded,
    )


async def create_job(
    session: AsyncSession, kind: str, payload: dict[str, Any], actor: UUID
) -> NhcJob:
    # A DB constraint + transaction lock coalesces pulls across API instances.
    await session.execute(text("SELECT pg_advisory_xact_lock(73190508)"))
    if kind == "pull":
        existing = (
            (
                await session.execute(
                    text(
                        "SELECT * FROM archive_nhc_jobs WHERE kind='pull' AND status IN ('queued','running')"
                    )
                )
            )
            .mappings()
            .first()
        )
        if existing:
            families = sorted(
                set(existing["payload"]["families"]) | set(payload["families"])
            )
            row = (
                (
                    await session.execute(
                        text(
                            "UPDATE archive_nhc_jobs SET payload=CAST(:payload AS jsonb) WHERE id=:id RETURNING *"
                        ),
                        {
                            "id": existing["id"],
                            "payload": json.dumps({"families": families}),
                        },
                    )
                )
                .mappings()
                .one()
            )
            await session.commit()
            return NhcJob.model_validate(row)
    row = (
        (
            await session.execute(
                text("""INSERT INTO archive_nhc_jobs(id,kind,status,requested_by,payload)
        VALUES (:id,:kind,'queued',:actor,CAST(:payload AS jsonb)) RETURNING *"""),
                {
                    "id": uuid4(),
                    "kind": kind,
                    "actor": actor,
                    "payload": json.dumps(payload),
                },
            )
        )
        .mappings()
        .one()
    )
    await session.commit()
    return NhcJob.model_validate(row)


async def job(session: AsyncSession, job_id: UUID) -> NhcJob:
    row = (
        (
            await session.execute(
                text("SELECT * FROM archive_nhc_jobs WHERE id=:id"), {"id": job_id}
            )
        )
        .mappings()
        .first()
    )
    if row is None:
        raise NotFoundError("NHC request not found")
    return NhcJob.model_validate(row)


def grid_sample(
    point_id: UUID, index: int, result: dict[str, Any], record: dict[str, Any]
) -> GuidanceGridSample:
    return GuidanceGridSample(
        job_id=point_id,
        record_index=index,
        requested_latitude=result["latitude"],
        requested_longitude=result["longitude"],
        cell_latitude=record["cell_latitude"],
        cell_longitude=record["cell_longitude"],
        distance_km=record["distance_km"],
        source_value=record["value"],
        parameter=str(record.get("name") or record.get("shortName") or "Unknown"),
        units=str(record.get("units") or "Unknown"),
        data_date=str(record.get("dataDate") or ""),
        data_time=str(record.get("dataTime") or ""),
        validity_date=str(record.get("validityDate") or ""),
        validity_time=str(record.get("validityTime") or ""),
        step_range=str(record.get("stepRange") or ""),
    )


async def prefill(
    session: AsyncSession,
    kind: str,
    edition_ids: list[UUID],
    zone_id: str | None = None,
    period_label: str | None = None,
    point_job_ids: list[UUID] | None = None,
) -> NhcPrefill:
    sources = []
    systems = []
    facts = []
    values = {}
    texts = []
    storm_id = None
    for edition_id in dict.fromkeys(edition_ids):
        item = await content(session, edition_id)
        edition = item.edition
        sources.append(
            GuidanceSource(
                edition_id=edition.id,
                product_key=edition.product_key,
                title=edition.title,
                issued_at=edition.issued_at,
                sha256=edition.sha256,
                url=edition.source_url,
            )
        )
        raw_structured = item.decoded.get("structured")
        structured: dict[str, Any] = (
            raw_structured if isinstance(raw_structured, dict) else {}
        )
        if kind == "marine" and zone_id and period_label:
            period = next(
                (
                    period
                    for period in structured.get("marine_periods", [])
                    if period["zone_id"] == zone_id and period["label"] == period_label
                ),
                None,
            )
            if period:
                values["weather"] = period["text"]
                for raw in period["facts"]:
                    fact = GuidanceFact(**{**raw, "source_edition_id": edition_id})
                    facts.append(fact)
                    if fact.key == "wind_direction":
                        values["windDirFrom"] = fact.description
                    if fact.key == "wind_speed":
                        values["windSpeedMin"] = f"{fact.minimum:g}"
                        values["windSpeedMax"] = f"{fact.maximum:g}"
                    if (
                        fact.key == "wave_height"
                        and fact.minimum is not None
                        and fact.maximum is not None
                    ):
                        values["waveHeightMin"] = f"{fact.minimum * 0.3048:.2f}"
                        values["waveHeightMax"] = f"{fact.maximum * 0.3048:.2f}"
        for raw in structured.get("systems", []):
            key = raw["source_feature_key"]
            systems.append(
                GuidanceSystem(
                    **{
                        **{
                            field: value
                            for field, value in raw.items()
                            if field != "parent_feature_key"
                        },
                        "id": uuid5(NAMESPACE_URL, f"nhc:{edition_id}:{key}"),
                        "suggested_parent_system_id": uuid5(
                            NAMESPACE_URL,
                            f"nhc:{edition_id}:{raw.get('parent_feature_key')}",
                        )
                        if raw.get("parent_feature_key")
                        else None,
                        "facts": [
                            {**fact, "source_edition_id": edition_id}
                            for fact in raw["facts"]
                        ],
                    }
                )
            )
        for fact in structured.get("facts", []):
            facts.append(GuidanceFact(**{**fact, "source_edition_id": edition_id}))
        if item.text:
            texts.append(item.text)
        if kind == "cyclone":
            if storm_id and edition.storm_id and storm_id != edition.storm_id:
                raise ValueError(
                    "Select guidance for one cyclone when prefilling a cyclone bulletin"
                )
            storm_id = edition.storm_id or storm_id
            if edition.storm_id:
                values["systemName"] = edition.storm_id.upper()
            for fact in [
                fact for fact in facts if fact.source_edition_id == edition_id
            ]:
                if fact.value is not None and fact.key == "pressure":
                    values["pressure"] = f"{fact.value:g}"
                if fact.value is not None and fact.key == "maximum_wind":
                    values["wind"] = f"{fact.value:g} kt"
                if fact.value is not None and fact.key == "movement_speed":
                    values["movement"] = f"{fact.value:g} kt"
            lat = next(
                (
                    f
                    for f in facts
                    if f.source_edition_id == edition_id
                    and f.key == "latitude"
                    and f.value is not None
                ),
                None,
            )
            lon = next(
                (
                    f
                    for f in facts
                    if f.source_edition_id == edition_id
                    and f.key == "longitude"
                    and f.value is not None
                ),
                None,
            )
            if lat and lon and lat.value is not None and lon.value is not None:
                values["position"] = f"Near {lat.value:g}, {lon.value:g} degrees"
    for point_id in point_job_ids or []:
        request = await job(session, point_id)
        if request.kind != "point" or request.status != "success" or not request.result:
            raise ValueError("Select a successfully completed grid point request")
        result = request.result
        edition_id = UUID(str(result["edition_id"]))
        if edition_id not in edition_ids:
            raise ValueError(
                "Grid point request must belong to a selected source edition"
            )
        item = await content(session, edition_id)
        # Only these explicit NDFD fields have a supported meteorological meaning.
        suffix = item.edition.product_key.rsplit("-", 1)[-1]
        fields: dict[str, FactKey] = {
            "wspd": "wind_speed",
            "wdir": "wind_direction",
            "wgust": "gust",
            "waveh": "wave_height",
        }
        key = fields.get(suffix)
        if key is None:
            continue
        records = result.get("records", [])
        if not isinstance(records, list):
            raise ValueError("Grid sample records are unavailable")
        for index, record in enumerate(records):
            if not isinstance(record, dict) or not isinstance(
                record.get("value"), (int, float)
            ):
                continue
            sample = grid_sample(point_id, index, result, record)
            facts.append(
                GuidanceFact(
                    key=key,
                    record_type="forecast",
                    value=sample.source_value,
                    unit=sample.units,
                    source_edition_id=edition_id,
                    sample=sample,
                    source_text=f"Native cell {sample.cell_latitude:g}, {sample.cell_longitude:g}; {sample.parameter}; valid {sample.validity_date} {sample.validity_time}; step {sample.step_range}",
                )
            )
    if kind == "outlook" and systems:
        values["systems"] = "\n\n".join(
            system.name + ": " + system.narrative for system in systems
        )
        values["source"] = "National Hurricane Center (NHC)"
    guidance = ProductGuidance(sources=sources, systems=systems, facts=facts)
    return NhcPrefill(
        guidance=guidance,
        values=values,
        notices=[
            "Review selected source times and every proposed field before accepting.",
            "Unsupported narrative fields require manual entry.",
        ]
        + (
            [
                "Regional marine guidance requires a local assessment; select a zone or grid period before transferring values."
            ]
            if kind == "marine"
            else []
        ),
    )


async def check_sources(
    session: AsyncSession, edition_ids: list[UUID]
) -> list[dict[str, Any]]:
    results = []
    for edition_id in edition_ids:
        item = await content(session, edition_id)
        row = (
            (
                await session.execute(
                    text(
                        "SELECT * FROM ("  # noqa: S608 -- constant SQL only
                        + EDITION_SELECT
                        + ") editions WHERE product_key=:key AND coalesce(storm_id,'')=:storm ORDER BY issued_at DESC NULLS LAST,first_received_at DESC,id DESC LIMIT 1"
                    ),
                    {
                        "key": item.edition.product_key,
                        "storm": item.edition.storm_id or "",
                    },
                )
            )
            .mappings()
            .one()
        )
        results.append(
            {
                "edition_id": edition_id,
                "newer_edition_id": row["id"] if row["id"] != edition_id else None,
                "status": item.edition.status,
            }
        )
    return results


async def validate_sources(
    session: AsyncSession, guidance: ProductGuidance
) -> ProductGuidance:
    canonical = []
    for source in guidance.sources:
        item = await content(session, source.edition_id)
        if item.edition.sha256 != source.sha256:
            raise ValueError("Source checksum does not match the archived edition")
        edition = item.edition
        canonical.append(
            GuidanceSource(
                edition_id=edition.id,
                product_key=edition.product_key,
                title=edition.title,
                issued_at=edition.issued_at,
                sha256=edition.sha256,
                url=edition.source_url,
            )
        )
    for fact in guidance.facts + [
        fact for system in guidance.systems for fact in system.facts
    ]:
        if not fact.sample:
            continue
        request = await job(session, fact.sample.job_id)
        result = request.result
        if (
            request.kind != "point"
            or request.status != "success"
            or not result
            or str(fact.source_edition_id) != result.get("edition_id")
        ):
            raise ValueError(
                "Sample evidence must reference a completed point request for its source edition"
            )
        records = result.get("records", [])
        index = fact.sample.record_index
        if (
            not isinstance(records, list)
            or index >= len(records)
            or not isinstance(records[index], dict)
        ):
            raise ValueError("Sample record is unavailable")
        record = records[index]
        if not isinstance(record, dict):
            raise ValueError("Sample record is unavailable")
        if grid_sample(request.id, index, result, record) != fact.sample:
            raise ValueError(
                "Native sample metadata must match the archived worker result"
            )
    for graphic in guidance.graphics:
        allowed = await assets(session, graphic.edition_id)
        if not any(
            row["asset_id"] == graphic.asset_id
            and row["media_type"].startswith("image/")
            for row in allowed
        ):
            raise ValueError(
                "Selected graphic is not an image belonging to its source edition"
            )
    return guidance.model_copy(update={"sources": canonical})
