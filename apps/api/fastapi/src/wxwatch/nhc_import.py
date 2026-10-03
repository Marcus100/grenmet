"""Import one existing NHC manifest. Never fetch, modify files or infer validity."""

import hashlib
import json
from datetime import UTC, datetime
from io import BytesIO
from pathlib import Path
from typing import Any

from PIL import Image, UnidentifiedImageError
from sqlalchemy import text
from sqlalchemy.engine import Connection, Engine

from .catalogue import identifier

MAX_BYTES = 10 * 1024 * 1024


def read_local(root: Path, relative: str) -> bytes:
    if (
        not isinstance(relative, str)
        or "\\" in relative
        or any(p in {"", ".", ".."} for p in relative.split("/"))
    ):
        raise ValueError("Unsafe archive path")
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()) or not path.is_file():
        raise ValueError("Missing file or path outside archive root")
    with path.open("rb") as stream:
        body = stream.read(MAX_BYTES + 1)
    if not body or len(body) > MAX_BYTES:
        raise ValueError("Empty or oversized archive artifact")
    return body


def timestamp(value: Any, required: bool = False) -> datetime | None:
    if value is None and not required:
        return None
    if not isinstance(value, str):
        raise ValueError("Missing timestamp")
    result = datetime.fromisoformat(value)
    if result.tzinfo is None:
        raise ValueError("Timestamp requires timezone")
    return result.astimezone(UTC)


def prepare(root: Path, manifest_path: str) -> list[dict[str, Any]]:
    manifest_bytes = read_local(root, manifest_path)
    manifest = json.loads(manifest_bytes)
    if (
        manifest.get("schema_version") != 2
        or not manifest.get("run_id")
        or not isinstance(manifest.get("products"), dict)
    ):
        raise ValueError("Expected a version 2 per-run NHC manifest")
    if len(manifest["products"]) > 500:
        raise ValueError("Manifest exceeds 500 products")
    records = []
    for key, record in manifest["products"].items():
        is_image = record.get("kind") == "image"
        if not is_image and (
            record.get("group") not in {"text", "storms"}
            or record.get("kind") not in {"text", "bulletin", "outlook"}
        ):
            continue
        if record.get("id") != key:
            raise ValueError("Manifest product identity mismatch")
        entry = {
            "record": record,
            "run": manifest["run_id"],
            "key": key,
            "manifest_sha": hashlib.sha256(manifest_bytes).hexdigest(),
            "attempted": timestamp(record.get("attempted_at"), True),
            "outcome": "failed",
        }
        if (
            record.get("status") != "success"
            or record.get("collection_status") != "success"
            or record.get("decoding_status") != "success"
        ):
            records.append(entry)
            continue
        source = record["source"]
        raw = read_local(root, source["raw_file"])
        sha = hashlib.sha256(raw).hexdigest()
        if (
            sha != source.get("sha256")
            or len(raw) != source.get("size")
            or sha != record.get("decoded_source_sha256")
        ):
            raise ValueError(f"Original checksum/size/provenance mismatch: {key}")
        decoded_bytes = read_local(root, record["decoded_file"])
        decoded = json.loads(decoded_bytes)
        image_metadata = {}
        if is_image:
            if decoded.get("image") != source["raw_file"]:
                raise ValueError(f"Decoded image provenance mismatch: {key}")
            try:
                with Image.open(BytesIO(raw)) as image:
                    media = {
                        "PNG": "image/png",
                        "JPEG": "image/jpeg",
                        "GIF": "image/gif",
                        "WEBP": "image/webp",
                    }.get(image.format or "")
                    if media is None:
                        raise ValueError("Unsupported image format")
                    image_metadata = {
                        "media": media,
                        "width": image.width,
                        "height": image.height,
                        "frames": getattr(image, "n_frames", 1),
                    }
                    image.verify()
            except (
                OSError,
                SyntaxError,
                UnidentifiedImageError,
                Image.DecompressionBombError,
            ) as exc:
                raise ValueError(f"Invalid NHC image: {key}") from exc
        elif not isinstance(decoded.get("text"), str) or not decoded["text"].strip():
            raise ValueError(f"Decoded bulletin text missing: {key}")
        status = source.get("http_status")
        if status not in {200, 304}:
            raise ValueError("Unsupported successful HTTP status")
        entry.update(
            image_metadata=image_metadata,
            source=source,
            sha=sha,
            size=len(raw),
            decoded=decoded,
            decoded_sha=hashlib.sha256(decoded_bytes).hexdigest(),
            issued=timestamp(record.get("issued_at")),
            retrieved=timestamp(source.get("retrieved_at"), True),
            checked=timestamp(source.get("checked_at"), status == 304),
            outcome="checked_unchanged" if status == 304 else "downloaded",
        )
        records.append(entry)
    return records


def write_record(c: Connection, entry: dict[str, Any], backend: str) -> None:
    record = entry["record"]
    edition = None
    if entry["outcome"] != "failed":
        source_id = identifier("source", "nhc")
        key = "nhc:" + entry["key"]
        product = identifier("product", key)
        # Source registry identity + storm + issue evidence + bytes retain corrections.
        edition = identifier(
            "nhc-edition",
            json.dumps(
                [key, record.get("storm_id"), str(entry["issued"]), entry["sha"]]
            ),
        )
        asset = identifier("asset", entry["sha"])
        c.execute(
            text(
                "INSERT INTO archive_sources(id,key,name,role) VALUES (:id,'nhc','National Hurricane Center','issuer') ON CONFLICT DO NOTHING"
            ),
            {"id": source_id},
        )
        c.execute(
            text("""INSERT INTO archive_products(id,source_id,key,title,product_type,identity_basis)
            VALUES (:id,:source,:key,:title,:product_type,'nhc_registry') ON CONFLICT DO NOTHING"""),
            {
                "id": product,
                "source": source_id,
                "key": key,
                "title": record.get("code") or entry["key"],
                "product_type": "raster_image"
                if record.get("kind") == "image"
                else "text_bulletin",
            },
        )
        c.execute(
            text("""INSERT INTO archive_editions(id,product_id,issued_at,nominal_time,time_basis,first_received_at,source_metadata)
            VALUES (:id,:product,:issued,:issued,:basis,:received,CAST(:metadata AS jsonb))
            ON CONFLICT(id) DO UPDATE SET first_received_at=least(archive_editions.first_received_at,EXCLUDED.first_received_at)"""),
            {
                "id": edition,
                "product": product,
                "issued": entry["issued"],
                "basis": "source_issue" if entry["issued"] else "unknown",
                "received": entry["retrieved"],
                "metadata": json.dumps(record),
            },
        )
        c.execute(
            text(
                """INSERT INTO archive_assets(id,sha256,byte_size,media_type,width,height,frame_count) VALUES (:id,:sha,:size,:media,:width,:height,:frames) ON CONFLICT DO NOTHING"""
            ),
            {
                "id": asset,
                "sha": entry["sha"],
                "size": entry["size"],
                "width": entry["image_metadata"].get("width"),
                "height": entry["image_metadata"].get("height"),
                "frames": entry["image_metadata"].get("frames"),
                "media": entry["image_metadata"].get("media")
                or entry["source"].get("content_type")
                or "application/octet-stream",
            },
        )
        c.execute(
            text(
                "INSERT INTO archive_edition_assets(edition_id,asset_id,role) VALUES (:edition,:asset,'original') ON CONFLICT DO NOTHING"
            ),
            {"edition": edition, "asset": asset},
        )
        path = entry["source"]["raw_file"]
        previous = c.scalar(
            text(
                "SELECT asset_id FROM archive_replicas WHERE backend_key=:backend AND object_key=:path"
            ),
            {"backend": backend, "path": path},
        )
        if previous is not None and previous != asset:
            raise ValueError("Replica path already represents different bytes")
        c.execute(
            text("""INSERT INTO archive_replicas(id,asset_id,backend_key,object_key,state,verified_at,verified_sha256)
            VALUES (:id,:asset,:backend,:path,'verified',now(),:sha)
            ON CONFLICT(backend_key,object_key) DO UPDATE SET state='verified',verified_at=now(),verified_sha256=EXCLUDED.verified_sha256"""),
            {
                "id": identifier("replica", backend + ":" + path),
                "asset": asset,
                "backend": backend,
                "path": path,
                "sha": entry["sha"],
            },
        )
        if record.get("kind") != "image":
            c.execute(
                text("""INSERT INTO archive_nhc_text(edition_id,storm_id,bulletin_code,bulletin_text,decoded_sha256,decoded_metadata)
                VALUES (:edition,:storm,:code,:body,:sha,CAST(:metadata AS jsonb)) ON CONFLICT DO NOTHING"""),
                {
                    "edition": edition,
                    "storm": record.get("storm_id"),
                    "code": record.get("code"),
                    "body": entry["decoded"]["text"],
                    "sha": entry["decoded_sha"],
                    "metadata": json.dumps(entry["decoded"]),
                },
            )
    event = identifier(
        "nhc-event", json.dumps([entry["run"], entry["key"], record], sort_keys=True)
    )
    c.execute(
        text("""INSERT INTO archive_nhc_events(id,run_key,product_key,edition_id,outcome,attempted_at,retrieved_at,checked_at,manifest_sha256,source_metadata)
        VALUES (:id,:run,:key,:edition,:outcome,:attempted,:retrieved,:checked,:manifest,CAST(:metadata AS jsonb)) ON CONFLICT DO NOTHING"""),
        {
            "id": event,
            "run": entry["run"],
            "key": entry["key"],
            "edition": edition,
            "outcome": entry["outcome"],
            "attempted": entry["attempted"],
            "retrieved": entry.get("retrieved"),
            "checked": entry.get("checked"),
            "manifest": entry["manifest_sha"],
            "metadata": json.dumps(record),
        },
    )


def import_manifest(
    root: Path,
    manifest_path: str,
    *,
    engine: Engine | None = None,
    backend: str = "nhc-local",
) -> dict[str, Any]:
    if not backend or backend == "local-primary":
        raise ValueError("Use a distinct NHC storage backend key")
    entries = prepare(root, manifest_path)
    if engine is not None:
        with engine.begin() as c:
            c.execute(text("SELECT pg_advisory_xact_lock(73190507)"))
            for entry in entries:
                write_record(c, entry, backend)
    return {
        "preview": engine is None,
        "processed": len(entries),
        **{
            kind: sum(e["outcome"] == kind for e in entries)
            for kind in ("downloaded", "checked_unchanged", "failed")
        },
    }
