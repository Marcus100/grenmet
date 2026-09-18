"""UTC gallery selection, preserving the existing three-hour floor buckets."""

import re
from datetime import UTC, date, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from .schemas import (
    ArchiveBulletin,
    ArchiveEdition,
    ArchiveHistory,
    ArchivePage,
    ArchiveRetrieval,
    SynopticImageGroup,
    SynopticImageGroups,
    SynopticSlots,
    WeatherImage,
)

HOURS = tuple(f"{hour:02d}" for hour in range(0, 24, 3))
PREFIX = re.compile(r"^\d+_(.+)$")


def group_images(images: list[WeatherImage], day: date) -> SynopticImageGroups:
    start = datetime.combine(day, datetime.min.time(), tzinfo=UTC)
    end = start + timedelta(days=1)
    groups: dict[str, list[WeatherImage]] = {}
    for image in sorted(
        images, key=lambda row: (row.observation_time or start, row.id)
    ):
        observed = image.observation_time
        if not observed or not image.name or not start <= observed < end:
            continue
        name = (
            PREFIX.sub(r"\1", image.name)
            if image.spider_name == "goes19"
            else image.name
        )
        groups.setdefault(
            image.product_key or f"{image.spider_name}:{name}", []
        ).append(image)
    result = []
    for product_key, rows in sorted(groups.items()):
        name = (
            PREFIX.sub(r"\1", rows[0].name or "")
            if rows[0].spider_name == "goes19"
            else rows[0].name or product_key
        )
        slots: dict[str, WeatherImage | None] = dict.fromkeys(HOURS)
        for hour in HOURS:
            candidates = [
                row
                for row in rows
                if row.observation_time is not None
                and row.observation_time.astimezone(UTC).hour // 3 * 3 == int(hour)
            ]
            if candidates:
                if rows[0].spider_name == "goes19":
                    target = start + timedelta(hours=int(hour))
                    slots[hour] = min(
                        candidates,
                        key=lambda row: abs(
                            ((row.observation_time or target) - target).total_seconds()
                        ),
                    )
                else:
                    slots[hour] = max(candidates, key=lambda row: row.fetched_at)
        result.append(
            SynopticImageGroup(
                productKey=product_key,
                name=name,
                synopticImages=SynopticSlots.model_validate(slots),
            )
        )
    return SynopticImageGroups(groups=result)


async def load_images(session: AsyncSession, day: date) -> SynopticImageGroups:
    start = datetime.combine(day, datetime.min.time(), tzinfo=UTC)
    rows = await session.execute(
        text(
            """SELECT w.*,
            e.observed_at AS archive_observed_at, e.nominal_time AS archive_nominal_time,
            e.first_received_at AS first_retrieved_at,
            (SELECT max(r.retrieved_at) FROM archive_retrievals r WHERE r.edition_id=e.id) AS latest_retrieved_at,
            l.status AS verification_status, a.sha256 AS verified_sha256,
            a.byte_size AS verified_byte_size, replica.state AS replica_state
            FROM weather_images w
            LEFT JOIN archive_legacy_images l ON l.legacy_id=w.id
            LEFT JOIN archive_editions e ON e.id=l.edition_id
            LEFT JOIN archive_assets a ON a.id=l.asset_id
            LEFT JOIN archive_replicas replica ON replica.asset_id=a.id
                AND replica.backend_key='local-primary' AND replica.object_key=w.storage_path
            WHERE w.observation_time >= :start AND w.observation_time < :end
            ORDER BY w.observation_time,w.id"""
        ),
        {"start": start, "end": start + timedelta(days=1)},
    )
    return group_images(
        [WeatherImage.model_validate(row) for row in rows.mappings()], day
    )


async def browse_archive(
    session: AsyncSession,
    *,
    source: str | None,
    product: str | None,
    start: date | None,
    end: date | None,
    unknown_time: bool,
    offset: int,
    limit: int,
) -> ArchivePage:

    conditions = ["TRUE"]
    params: dict[str, Any] = {"offset": offset, "limit": limit + 1}
    if source:
        conditions.append("s.key=:source")
        params["source"] = source
    if product:
        conditions.append("strpos(lower(p.title || ' ' || p.key),lower(:product)) > 0")
        params["product"] = product
    if unknown_time:
        conditions.append("e.nominal_time IS NULL")
    else:
        if start:
            conditions.append("e.nominal_time >= :start")
            params["start"] = datetime.combine(start, datetime.min.time(), tzinfo=UTC)
        if end:
            conditions.append("e.nominal_time < :end")
            params["end"] = datetime.combine(
                end, datetime.min.time(), tzinfo=UTC
            ) + timedelta(days=1)
    where = " AND ".join(conditions)
    rows = (
        (
            await session.execute(
                text(f"""SELECT e.id::text, p.title, s.key AS source, p.key AS product_key,
        e.nominal_time,e.observed_at,e.issued_at,e.time_basis,e.first_received_at,l.storage_path,
        coalesce(n.storm_id,e.source_metadata->>'storm_id') AS storm_id,n.bulletin_code,(n.edition_id IS NOT NULL) AS has_bulletin,
        raster.asset_id::text AS image_asset_id,
        coalesce(l.status,CASE WHEN raster.state='verified' THEN 'verified' WHEN raster.asset_id IS NOT NULL THEN 'unverified' END) AS verification_status,
        coalesce(replica.state,raster.state) AS replica_state,
        coalesce(a.sha256,raster.sha256) AS sha256,coalesce(a.byte_size,raster.byte_size) AS byte_size
        FROM archive_editions e JOIN archive_products p ON p.id=e.product_id
        JOIN archive_sources s ON s.id=p.source_id
        LEFT JOIN archive_nhc_text n ON n.edition_id=e.id
        LEFT JOIN archive_legacy_images l ON l.edition_id=e.id
        LEFT JOIN archive_assets a ON a.id=l.asset_id
        LEFT JOIN archive_replicas replica ON replica.asset_id=a.id AND replica.object_key=l.storage_path AND replica.backend_key='local-primary'
        LEFT JOIN LATERAL (
            SELECT original.id AS asset_id,original.sha256,original.byte_size,r.state
            FROM archive_edition_assets ea JOIN archive_assets original ON original.id=ea.asset_id
            LEFT JOIN LATERAL (
                SELECT state FROM archive_replicas
                WHERE asset_id=original.id
                ORDER BY (state='verified' AND verified_sha256=original.sha256) DESC,backend_key,object_key LIMIT 1
            ) r ON TRUE
            WHERE ea.edition_id=e.id AND ea.role='original' AND p.product_type='raster_image'
            ORDER BY original.id LIMIT 1
        ) raster ON TRUE
        WHERE {where} ORDER BY e.nominal_time DESC NULLS LAST,e.id DESC LIMIT :limit OFFSET :offset"""),  # noqa: S608 -- fixed predicates, bound values
                params,
            )
        )
        .mappings()
        .all()
    )  # noqa: S608 -- predicates are fixed strings, values are bound
    return ArchivePage(
        items=[ArchiveEdition.model_validate(row) for row in rows[:limit]],
        has_more=len(rows) > limit,
        offset=offset,
    )


async def archive_history(
    session: AsyncSession, edition_id: UUID, offset: int, limit: int
) -> ArchiveHistory:

    rows = (
        (
            await session.execute(
                text("""SELECT id::text,retrieved_at,recorded_at,image_url,event_kind,checked_at,is_imported FROM (
                    SELECT id,retrieved_at,recorded_at,image_url,'downloaded' AS event_kind,
                        NULL::timestamptz AS checked_at,false AS is_imported,retrieved_at AS event_time
                    FROM archive_retrievals WHERE edition_id=:edition
                    UNION ALL
                    SELECT id,retrieved_at,imported_at AS recorded_at,
                        coalesce(source_metadata->'source'->>'url',source_metadata->>'url','') AS image_url,
                        outcome AS event_kind,checked_at,true AS is_imported,
                        coalesce(checked_at,retrieved_at,attempted_at) AS event_time
                    FROM archive_nhc_events WHERE edition_id=:edition
                ) events ORDER BY event_time DESC,id DESC LIMIT :limit OFFSET :offset"""),
                {"edition": edition_id, "limit": limit + 1, "offset": offset},
            )
        )
        .mappings()
        .all()
    )
    return ArchiveHistory(
        items=[ArchiveRetrieval.model_validate(row) for row in rows[:limit]],
        has_more=len(rows) > limit,
        offset=offset,
    )


async def load_bulletin(
    session: AsyncSession, edition_id: UUID
) -> ArchiveBulletin | None:
    row = (
        (
            await session.execute(
                text(
                    "SELECT edition_id::text,bulletin_text AS text FROM archive_nhc_text WHERE edition_id=:id"
                ),
                {"id": edition_id},
            )
        )
        .mappings()
        .one_or_none()
    )
    return ArchiveBulletin.model_validate(row) if row else None
