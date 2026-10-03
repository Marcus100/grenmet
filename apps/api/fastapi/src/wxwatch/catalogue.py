"""Conservative, bounded backfill. Never edits legacy rows or moves files."""

import hashlib
import json
import re
import stat
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlsplit, urlunsplit
from uuid import NAMESPACE_URL, UUID, uuid5

from PIL import Image, UnidentifiedImageError
from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine


def identifier(kind: str, key: str) -> UUID:
    return uuid5(NAMESPACE_URL, f"grenmet:wxwatch:{kind}:{key}")


def product_identity(row: dict[str, Any]) -> tuple[str, str, str | None]:
    source, name = row.get("spider_name") or "unknown", row.get("name") or ""
    if source == "goes19" and re.match(r"^\d+_.+", name):
        return source + ":" + re.sub(r"^\d+_", "", name), "goes_filename", None
    if source == "uwyo":
        station = re.fullmatch(r"\d{12}_skewt_(\d{5})\.png", name)
        if station:
            reference = "wmo:" + station[1]
            return f"uwyo:skewt:{reference}", "sounding_station", reference
    if row.get("image_url"):
        url = urlsplit(row["image_url"])
        # Query parameters may encode station/region; retain them.
        canonical = urlunsplit(
            (url.scheme.lower(), url.netloc.lower(), url.path, url.query, "")
        )
        return (
            f"{source}:url:{hashlib.sha256(canonical.encode()).hexdigest()}",
            "source_url_unreviewed",
            None,
        )
    return f"{source}:legacy:{row['id']}", "legacy_record_unreviewed", None


def catalogue_record(connection: Connection, row: dict[str, Any]) -> UUID:
    source = row.get("spider_name") or "unknown"
    source_id = identifier("source", source)
    key, basis, station = product_identity(row)
    product_id = identifier("product", key)
    edition_id = identifier("legacy-edition", str(row["id"]))
    connection.execute(
        text(
            "INSERT INTO archive_sources(id,key,name,role) VALUES (:id,:key,:key,'collector') ON CONFLICT DO NOTHING"
        ),
        {"id": source_id, "key": source},
    )
    connection.execute(
        text("""INSERT INTO archive_products(id,source_id,key,title,product_type,identity_basis,station_ref)
        VALUES (:id,:source,:key,:title,:type,:basis,:station) ON CONFLICT DO NOTHING"""),
        {
            "id": product_id,
            "source": source_id,
            "key": key,
            "title": row.get("name") or key,
            "type": "sounding_image" if station else "image",
            "basis": basis,
            "station": station,
        },
    )
    # Row aliases are unambiguous even if legacy product keys collapsed URLs.
    connection.execute(
        text(
            "INSERT INTO archive_product_aliases(product_id,namespace,value) VALUES (:id,'weather_images.id',:value) ON CONFLICT DO NOTHING"
        ),
        {"id": product_id, "value": str(row["id"])},
    )
    time_basis = row.get("time_basis") or "legacy_unknown"
    observed = (
        row.get("observation_time")
        if time_basis in {"filename", "source_observation"}
        else None
    )
    metadata = json.dumps(
        row,
        default=lambda value: (
            value.isoformat() if isinstance(value, datetime) else str(value)
        ),
    )
    connection.execute(
        text("""INSERT INTO archive_editions(id,product_id,observed_at,nominal_time,time_basis,first_received_at,source_modified_at,source_metadata)
        VALUES (:id,:product,:observed,:nominal,:basis,:received,:modified,CAST(:metadata AS jsonb)) ON CONFLICT DO NOTHING"""),
        {
            "id": edition_id,
            "product": product_id,
            "observed": observed,
            "nominal": row.get("observation_time"),
            "basis": time_basis,
            "received": row["fetched_at"],
            "modified": row.get("source_modified"),
            "metadata": metadata,
        },
    )
    connection.execute(
        text(
            "INSERT INTO archive_legacy_images(legacy_id,edition_id,storage_path) VALUES (:legacy,:edition,:path) ON CONFLICT DO NOTHING"
        ),
        {"legacy": row["id"], "edition": edition_id, "path": row["storage_path"]},
    )
    return edition_id


def inspect_file(root: Path, relative: str, expected: str | None) -> dict[str, Any]:
    if "\\" in relative or any(part in {"", ".", ".."} for part in relative.split("/")):
        return {"status": "unsafe", "error_code": "invalid_path"}
    try:
        path = (root / relative).resolve()
        if not path.is_relative_to(root.resolve()):
            return {"status": "unsafe", "error_code": "outside_root"}
        before = path.stat()
        if not stat.S_ISREG(before.st_mode):
            return {"status": "unsafe", "error_code": "not_regular_file"}
        with path.open("rb") as stream:
            sha, md5 = hashlib.sha256(), hashlib.md5(usedforsecurity=False)
            while chunk := stream.read(1024 * 1024):
                sha.update(chunk)
                md5.update(chunk)
            after = path.stat()
            if (before.st_ino, before.st_size, before.st_mtime_ns) != (
                after.st_ino,
                after.st_size,
                after.st_mtime_ns,
            ):
                return {"status": "unstable", "error_code": "changed_during_read"}
            if expected:
                actual = md5.hexdigest() if len(expected) == 32 else sha.hexdigest()
                if expected.lower() != actual:
                    return {
                        "status": "mismatch",
                        "error_code": "legacy_checksum_mismatch",
                    }
            stream.seek(0)
            with Image.open(stream) as image:
                width, height = image.size
                frames = getattr(image, "n_frames", 1)
                media = Image.MIME.get(image.format or "", "application/octet-stream")
                image.seek(0)
                image.verify()
            final = path.stat()
            if (before.st_ino, before.st_size, before.st_mtime_ns) != (
                final.st_ino,
                final.st_size,
                final.st_mtime_ns,
            ):
                return {"status": "unstable", "error_code": "changed_during_read"}
            return {
                "status": "verified" if expected else "unverified",
                "sha256": sha.hexdigest(),
                "byte_size": before.st_size,
                "media_type": media,
                "width": width,
                "height": height,
                "frame_count": frames,
                "integrity_basis": (
                    "legacy_md5" if len(expected) == 32 else "legacy_sha256"
                )
                if expected
                else "current_bytes_only",
            }
    except FileNotFoundError:
        return {"status": "missing", "error_code": "file_missing"}
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        RuntimeError,
        Image.DecompressionBombError,
    ):
        return {"status": "unsupported", "error_code": "unreadable_image"}


def record_asset(
    connection: Connection,
    row: dict[str, Any],
    edition: UUID,
    result: dict[str, Any],
    backend: str,
) -> UUID:
    asset_id = identifier("asset", result["sha256"])
    existing = connection.execute(
        text(
            "SELECT asset_id FROM archive_replicas WHERE backend_key=:backend AND object_key=:path FOR UPDATE"
        ),
        {"backend": backend, "path": row["storage_path"]},
    ).scalar_one_or_none()
    if existing is not None and existing != asset_id:
        raise ValueError("Replica path is already associated with different bytes")
    connection.execute(
        text("""INSERT INTO archive_assets(id,sha256,byte_size,media_type,width,height,frame_count)
        VALUES (:id,:sha256,:byte_size,:media_type,:width,:height,:frame_count) ON CONFLICT DO NOTHING"""),
        result | {"id": asset_id},
    )
    connection.execute(
        text("""INSERT INTO archive_edition_assets(edition_id,asset_id,role,original_name)
        VALUES (:edition,:asset,'legacy_original',:name) ON CONFLICT DO NOTHING"""),
        {"edition": edition, "asset": asset_id, "name": row.get("name")},
    )
    connection.execute(
        text("""INSERT INTO archive_replicas(id,asset_id,backend_key,object_key,state,verified_at,verified_sha256)
        VALUES (:id,:asset,:backend,:path,'verified',now(),:sha)
        ON CONFLICT (backend_key,object_key) DO UPDATE SET state='verified',verified_at=now(),verified_sha256=EXCLUDED.verified_sha256"""),
        {
            "id": identifier("replica", backend + ":" + row["storage_path"]),
            "asset": asset_id,
            "backend": backend,
            "path": row["storage_path"],
            "sha": result["sha256"],
        },
    )
    return asset_id


def backfill_batch(
    engine: Engine,
    *,
    root: Path | None,
    backend: str,
    limit: int = 100,
    after_id: int = 0,
) -> dict[str, int]:
    if not 1 <= limit <= 1000 or after_id < 0:
        raise ValueError("limit must be 1..1000 and after_id nonnegative")
    counts: dict[str, int] = {"processed": 0, "last_id": after_id}
    with engine.begin() as connection:
        connection.execute(text("SELECT pg_advisory_xact_lock(73190507)"))
        rows = (
            connection.execute(
                text(
                    "SELECT * FROM weather_images WHERE id>:after ORDER BY id LIMIT :limit"
                ),
                {"after": after_id, "limit": limit},
            )
            .mappings()
            .all()
        )
        for record in rows:
            row = dict(record)
            edition = catalogue_record(connection, row)
            if root is None:
                counts["processed"] += 1
                counts["last_id"] = row["id"]
                status = connection.scalar(
                    text(
                        "SELECT status FROM archive_legacy_images WHERE legacy_id=:id"
                    ),
                    {"id": row["id"]},
                )
                counts[status] = counts.get(status, 0) + 1
                continue
            result = (
                inspect_file(root, row["storage_path"], row.get("checksum"))
                if root
                else {"status": "pending", "error_code": "local_root_not_supplied"}
            )
            asset_id = None
            if "sha256" in result:
                try:
                    asset_id = record_asset(connection, row, edition, result, backend)
                except ValueError:
                    result = {
                        "status": "mismatch",
                        "error_code": "replica_bytes_changed",
                    }
            if "sha256" not in result:
                connection.execute(
                    text(
                        "UPDATE archive_replicas SET state=:state,verified_at=NULL,verified_sha256=NULL WHERE backend_key=:backend AND object_key=:path"
                    ),
                    {
                        "state": "missing"
                        if result["status"] == "missing"
                        else "failed",
                        "backend": backend,
                        "path": row["storage_path"],
                    },
                )
            connection.execute(
                text(
                    """UPDATE archive_legacy_images SET status=:status,asset_id=coalesce(:asset,asset_id),integrity_basis=coalesce(:basis,integrity_basis),last_attempt_at=:now,error_code=:error WHERE legacy_id=:id"""
                ),
                {
                    "status": result["status"],
                    "asset": asset_id,
                    "basis": result.get("integrity_basis"),
                    "now": datetime.now(UTC),
                    "error": result.get("error_code"),
                    "id": row["id"],
                },
            )
            counts["processed"] += 1
            counts["last_id"] = row["id"]
            counts[result["status"]] = counts.get(result["status"], 0) + 1
    return counts


def record_ingestion(
    connection: Connection,
    row: dict[str, Any],
    retrieval: dict[str, Any],
    verification: dict[str, Any] | None,
) -> None:
    """Atomic compatibility row, catalogue and retrieval write; no filesystem I/O."""
    edition = catalogue_record(connection, row)
    if verification is not None:
        # A repeated sighting may have a different physical path from the edition.
        asset = record_asset(
            connection,
            row | {"storage_path": retrieval["storage_path"]},
            edition,
            verification,
            "local-primary",
        )
        connection.execute(
            text("""UPDATE archive_legacy_images SET asset_id=:asset,status='verified',
            integrity_basis=:basis,last_attempt_at=now(),error_code=NULL WHERE legacy_id=:id AND storage_path=:path"""),
            {
                "asset": asset,
                "basis": verification["integrity_basis"],
                "id": row["id"],
                "path": retrieval["storage_path"],
            },
        )
    metadata = json.dumps(retrieval, sort_keys=True)
    # Exact request retries have one identity; a new run or fetch is a new sighting.
    retrieval_id = identifier("retrieval", metadata)
    connection.execute(
        text("""INSERT INTO archive_retrievals
        (id,edition_id,run_id,retrieved_at,image_url,storage_path,checksum,source_metadata)
        VALUES (:id,:edition,:run,:time,:url,:path,:checksum,CAST(:metadata AS jsonb))
        ON CONFLICT (id) DO NOTHING"""),
        {
            "id": retrieval_id,
            "edition": edition,
            "run": retrieval["run_id"],
            "time": datetime.fromisoformat(retrieval["fetched_at"]),
            "url": retrieval["image_url"],
            "path": retrieval["storage_path"],
            "checksum": retrieval["checksum"],
            "metadata": metadata,
        },
    )
