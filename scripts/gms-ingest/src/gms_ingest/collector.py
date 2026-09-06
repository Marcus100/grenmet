"""Run-once collection with independent product publication."""

import fcntl
import hashlib
import re
import uuid
from dataclasses import asdict, replace
from datetime import UTC, datetime
from email.utils import parsedate_to_datetime
from urllib.error import HTTPError

from . import discovery, registry, text
from .download import Downloader
from .storage import artifact_key, atomic_json, read_json, utc_now


def decode(product, path, destination, bbox, metadata):
    if product.kind == "grid":
        from . import grids

        result = grids.decode(path, destination / "grid.nc", bbox)
        result["netcdf"] = "grid.nc"
        return result
    raw = path.read_bytes()
    if product.kind == "storms":
        return {"storms": text.parse_storms(raw)}
    if product.kind == "outlook":
        return text.parse_outlook(raw)
    if product.kind == "bulletin":
        return text.bulletin(raw, product.code)
    if product.kind in {"gis-feed", "graphics-feed"}:
        return {"items": text.rss_items(raw)}
    if product.kind in {"storm-page", "grid-index"}:
        return {"html": raw.decode("utf-8", errors="replace")}
    if product.kind == "image":
        if not (
            raw.startswith(
                (b"\x89PNG\r\n\x1a\n", b"GIF87a", b"GIF89a", b"\xff\xd8\xff")
            )
        ):
            raise ValueError("Expected PNG, GIF or JPEG image")
        return {"image": metadata["raw_file"], "issued_at": product.issued_at}
    if product.kind == "vector":
        from . import maps

        result, assets = maps.decode(raw, product.url)
        destination.mkdir(parents=True, exist_ok=True)
        for href, body in assets.items():
            filename = hashlib.sha256(body).hexdigest()
            (destination / filename).write_bytes(body)
            for overlay in result["overlays"]:
                if overlay["href"] == href:
                    overlay["embedded_file"] = filename
        atomic_json(destination / "features.geojson", result)
        result["geojson"] = "features.geojson"
        return result
    body = text.html_text(raw)
    if not re.search(r"\b[A-Z]{4}\d{2}\s+[A-Z]{4}\s+\d{6}\b", body):
        raise ValueError("Expected a meteorological bulletin, not a web error page")
    reference = metadata["retrieved_at"]
    if metadata.get("last_modified"):
        reference = parsedate_to_datetime(metadata["last_modified"]).isoformat()
    issued = product.issued_at or text.issue_time(body, reference)
    result = {"text": body, "issued_at": issued, "sections": text.sections(body)}
    if product.kind in {"hdob", "vortex", "dropsonde"}:
        from . import recon

        result.update(recon.decode(product.kind, body, issued or reference))
    return result


def is_stale(record):
    date = record.get("issued_at")
    if not date:
        return None
    age = (
        datetime.now(UTC) - datetime.fromisoformat(date.replace("Z", "+00:00"))
    ).total_seconds()
    limit = {
        "text": 12,
        "storms": 12,
        "maps": 12,
        "charts": 24,
        "grids": 18,
        "recon": 6,
    }[record["group"]]
    return age > limit * 3600 or age < -3600


def collect(root, groups, bbox=registry.DEFAULT_BBOX, downloader_factory=Downloader):
    root.mkdir(parents=True, exist_ok=True)
    with (root / ".collector.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as error:
            raise RuntimeError(
                "Another collector owns this output directory"
            ) from error
        run_id = (
            datetime.now(UTC).strftime("%Y%m%dT%H%M%S%fZ") + "-" + uuid.uuid4().hex[:8]
        )
        run = root / "runs" / run_id
        run.mkdir(parents=True)
        previous = read_json(root / "latest.json", {})
        products = dict(previous.get("products", {}))
        cache = read_json(root / "http-cache.json", {})
        downloader = downloader_factory(root, cache)
        queue = registry.sources(groups)
        attempted, outcomes = set(), {}
        storm_list = None
        errors = []

        def enqueue(children, parent):
            queue.extend(replace(child, parent_id=parent.id) for child in children)

        while queue:
            product = queue.pop(0)
            if product.id in attempted:
                continue
            if len(attempted) >= 500:
                errors.append(
                    "Discovery exceeds 500 products; remaining products not attempted"
                )
                break
            attempted.add(product.id)
            old = products.get(product.id, {})
            record = {
                **old,
                **asdict(product),
                "attempted_at": utc_now(),
                "status": "failed",
                "active": True,
                "collection_status": "failed",
                "decoding_status": "not_attempted",
            }
            record.pop("error", None)
            record["issued_at"] = old.get("issued_at")
            try:
                metadata = downloader.fetch(product)
                record["source"] = metadata
                record["collection_status"] = "success"
                record["decoding_status"] = "failed"
                key = artifact_key(metadata["sha256"], product.kind, bbox)
                destination = root / "decoded" / key
                result_file = destination / "result.json"
                result = read_json(result_file)
                if result is None:
                    result = decode(
                        product,
                        root / metadata["raw_file"],
                        destination,
                        bbox,
                        metadata,
                    )
                    if result.get("text"):
                        destination.mkdir(parents=True, exist_ok=True)
                        (destination / "bulletin.txt").write_text(
                            result["text"], encoding="utf-8"
                        )
                        result["text_file"] = "bulletin.txt"
                    atomic_json(result_file, result)
                record.update(
                    status="success",
                    decoding_status="success",
                    last_success_at=utc_now(),
                    decoded_file=str(result_file.relative_to(root)),
                    issued_at=result.get("issued_at") or product.issued_at,
                    decoded_source_sha256=metadata["sha256"],
                )
                if product.kind == "grid":
                    records = result.get("records", [])
                    if records and records[0].get("dataDate") is not None:
                        cycle = (
                            str(records[0]["dataDate"])
                            + f"{int(records[0]['dataTime']):04d}"
                        )
                        record["issued_at"] = (
                            datetime.strptime(cycle, "%Y%m%d%H%M")
                            .replace(tzinfo=UTC)
                            .isoformat()
                        )
                record["stale"] = is_stale(record)
                if product.kind == "storms":
                    storm_list = result["storms"]
                    enqueue(discovery.storm_products(storm_list, groups), product)
                    if "grids" in groups:
                        enqueue(discovery.grid_indexes(storm_list), product)
                elif product.kind == "grid-index":
                    enqueue(
                        discovery.indexed_grids(
                            result["html"], product, storm_list or []
                        ),
                        product,
                    )
                elif product.kind in {"gis-feed", "graphics-feed"}:
                    enqueue(
                        (
                            p
                            for p in discovery.feed_products(
                                result["items"], product.kind == "graphics-feed"
                            )
                            if p.group in groups
                        ),
                        product,
                    )
                elif product.kind == "storm-page":
                    enqueue(
                        (
                            p
                            for p in discovery.page_products(
                                result["html"].encode(), product
                            )
                            if p.group in groups
                        ),
                        product,
                    )
                elif product.kind == "vector":
                    for url in result.get("links", []):
                        linked = discovery.make_product(
                            url,
                            "linked",
                            product.group,
                            product.storm_id,
                            product.issued_at,
                        )
                        if linked:
                            enqueue([linked], product)
                if product.kind == "outlook":
                    previous["outlook"] = result
                    if "storms" in groups:
                        enqueue(
                            discovery.advisory_products(
                                text.rss_items(
                                    (root / metadata["raw_file"]).read_bytes()
                                )
                            ),
                            product,
                        )
            except Exception as error:
                # An external product must not prevent independent products from publishing.
                record["error"] = f"{type(error).__name__}: {error}"
                record["status"] = (
                    "unavailable"
                    if product.optional
                    and isinstance(error, HTTPError)
                    and error.code in (404, 410)
                    else "failed"
                )
                if isinstance(error, HTTPError):
                    record["http_status"] = error.code
                record["stale"] = True if old.get("decoded_file") else None
                if record["status"] == "failed":
                    errors.append(product.id)
            products[product.id] = record
            outcomes[product.id] = record
            # Persist completed work even if a later download is interrupted.
            atomic_json(root / "http-cache.json", cache)
            atomic_json(
                run / "manifest.json",
                {
                    "schema_version": 2,
                    "run_id": run_id,
                    "status": "running",
                    "products": outcomes,
                    "errors": errors,
                },
            )
        if storm_list is not None:
            active = {storm["id"].lower() for storm in storm_list}
            previous["storms"] = storm_list
            for key, record in list(products.items()):
                if record.get("storm_id") and record["storm_id"].lower() not in active:
                    products[key] = {**record, "active": False, "status": "inactive"}
        # Explicit chart season switching, not speculative treatment of missing downloads.
        for _ in range(len(products)):
            changed = False
            for key, record in list(products.items()):
                parent = products.get(record.get("parent_id"), {})
                removed = (
                    record.get("parent_id") in outcomes
                    and parent.get("status") == "success"
                    and key not in attempted
                )
                if (
                    record.get("group") in groups
                    and record.get("active", True)
                    and parent
                    and (removed or parent.get("active") is False)
                ):
                    products[key] = {**record, "active": False, "status": "inactive"}
                    changed = True
            if not changed:
                break
        for key, record in list(products.items()):
            if (
                record.get("group") == "charts"
                and "charts" in groups
                and key not in attempted
            ):
                products[key] = {**record, "active": False, "status": "inactive"}
        index = {
            "schema_version": 2,
            "provider": "NHC",
            "run_id": run_id,
            "updated_at": utc_now(),
            "storms": previous.get("storms", []),
            "outlook": previous.get("outlook"),
            "products": products,
        }
        manifest = {
            "schema_version": 2,
            "run_id": run_id,
            "groups": sorted(groups),
            "bbox": list(bbox),
            "status": "partial" if errors else "success",
            "errors": errors,
            "products": outcomes,
        }
        atomic_json(run / "manifest.json", manifest)
        atomic_json(root / "http-cache.json", cache)
        atomic_json(root / "latest.json", index)
        return not errors, run
