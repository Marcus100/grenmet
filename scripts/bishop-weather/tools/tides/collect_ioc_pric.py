#!/usr/bin/env python3
"""Archive timestamped PRIC observations from the authenticated IOC API.

The research endpoint is collected sensor-by-sensor with all automatic QC flags
retained. Filters are disabled so the archive preserves values and their flags;
downstream preparation decides which records are fit for a given use.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
import shutil
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import UTC, date, datetime
from pathlib import Path


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT_ROOT = (
    REPOSITORY_ROOT
    / "raw"
    / "02-atmosphere-aviation"
    / "datasets"
    / "tide-gauges"
    / "pric"
    / "ioc-api-snapshots"
)
API_ROOT = "https://api.ioc-sealevelmonitoring.org"
USER_AGENT = "GMS-PRIC-data-archive/0.1 (authoritative-source preservation)"


def parse_date(value: str) -> date:
    return date.fromisoformat(value)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--start", type=parse_date, default=date(2011, 5, 10))
    parser.add_argument("--stop", type=parse_date, default=date.today())
    parser.add_argument(
        "--sensor",
        action="append",
        default=[],
        help="IOC sensor code; repeat as needed. Defaults to rad, prs, and bub.",
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("IOC_SEALEVEL_API_KEY"),
        help="IOC API key; prefer the IOC_SEALEVEL_API_KEY environment variable.",
    )
    parser.add_argument(
        "--output-root", type=Path, default=DEFAULT_OUTPUT_ROOT
    )
    parser.add_argument("--snapshot-id")
    parser.add_argument(
        "--resume",
        action="store_true",
        help="Resume an existing --snapshot-id and reuse verified JSON pages.",
    )
    parser.add_argument(
        "--fit-to-sample-rate",
        action="store_true",
        help=(
            "Ask IOC to round observations into expected sampling slots. "
            "Disabled by default so the source archive preserves native timing."
        ),
    )
    parser.add_argument("--retries", type=int, default=3)
    parser.add_argument(
        "--days-per-page",
        type=int,
        default=30,
        help="Days requested per API page (1-365; default 30 for high-frequency data).",
    )
    parser.add_argument(
        "--workers",
        type=int,
        default=3,
        help="Concurrent API requests (1-4; default 3, one lane per PRIC sensor).",
    )
    parser.add_argument("--direct", action="store_true")
    parser.add_argument("--timeout", type=float, default=120.0)
    return parser.parse_args()


def research_urls(
    start: date,
    stop: date,
    sensors: list[str],
    days_per_page: int = 365,
    fit_to_sample_rate: bool = False,
) -> list[tuple[str, str, int]]:
    if stop <= start:
        raise ValueError("--stop must be after --start")
    pages = math.ceil((stop - start).days / days_per_page)
    result: list[tuple[str, str, int]] = []
    # Interleave sensors by page so a partial/resumed run samples every PRIC
    # water-level channel early instead of exhausting one sensor first.
    for page in range(1, pages + 1):
        for sensor in sensors:
            parameters = [
                ("timestart", start.isoformat()),
                ("timestop", stop.isoformat()),
                ("days_per_page", str(days_per_page)),
                ("page", str(page)),
                ("includesensors[]", sensor),
                ("subtract_30d_average", "false"),
                ("flag_qc", "true"),
                ("filter_completeness", "false"),
                ("filter_distinctness", "false"),
                ("filter_shift", "false"),
                ("filter_out_of_range", "false"),
                ("filter_exceeded_neighbours", "false"),
                ("filter_spikes_via_median", "false"),
                ("filter_flat_line", "false"),
                (
                    "fit_to_sample_rate",
                    "true" if fit_to_sample_rate else "false",
                ),
            ]
            query = urllib.parse.urlencode(parameters)
            url = (
                f"{API_ROOT}/v2/research/stations/pric/sensors/one-sensor/data?"
                f"{query}"
            )
            result.append((sensor, url, page))
    return result


def download_json(
    opener: urllib.request.OpenerDirector,
    url: str,
    api_key: str,
    destination: Path,
    timeout: float,
) -> dict[str, object]:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".json.part")
    temporary.unlink(missing_ok=True)
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
            "X-API-KEY": api_key,
        },
    )
    digest = hashlib.sha256()
    byte_count = 0
    started = datetime.now(UTC)
    with opener.open(request, timeout=timeout) as response, temporary.open("xb") as stream:
        while chunk := response.read(1024 * 1024):
            stream.write(chunk)
            digest.update(chunk)
            byte_count += len(chunk)
        status = getattr(response, "status", None)
        content_type = response.headers.get("Content-Type")
    # Validate that the archive is JSON before promoting the temporary file.
    with temporary.open(encoding="utf-8") as stream:
        json.load(stream)
    shutil.move(str(temporary), str(destination))
    return {
        "url": url,
        "relative_path": destination.as_posix(),
        "status": "downloaded",
        "http_status": status,
        "content_type": content_type,
        "bytes": byte_count,
        "sha256": digest.hexdigest(),
        "retrieval_started_utc": started.isoformat(),
        "retrieval_completed_utc": datetime.now(UTC).isoformat(),
        "retrieval_mode": "network",
    }


def existing_json_record(url: str, destination: Path) -> dict[str, object]:
    """Validate and checksum a completed page before reusing it."""
    digest = hashlib.sha256()
    byte_count = 0
    with destination.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
            byte_count += len(chunk)
    with destination.open(encoding="utf-8") as stream:
        json.load(stream)
    return {
        "url": url,
        "relative_path": destination.as_posix(),
        "status": "downloaded",
        "http_status": 200,
        "content_type": "application/json",
        "bytes": byte_count,
        "sha256": digest.hexdigest(),
        "retrieval_completed_utc": datetime.now(UTC).isoformat(),
        "retrieval_mode": "reused",
    }


def download_with_retries(
    opener: urllib.request.OpenerDirector,
    url: str,
    api_key: str,
    destination: Path,
    timeout: float,
    retries: int,
) -> dict[str, object]:
    if retries < 0:
        raise ValueError("--retries must be zero or greater")
    for attempt in range(1, retries + 2):
        try:
            record = download_json(opener, url, api_key, destination, timeout)
            record["attempts"] = attempt
            return record
        except Exception:
            if attempt > retries:
                raise
            time.sleep(min(2 ** (attempt - 1), 10))
    raise AssertionError("unreachable")


def main() -> int:
    args = parse_args()
    if not 1 <= args.days_per_page <= 365:
        raise SystemExit("--days-per-page must be between 1 and 365")
    if not 1 <= args.workers <= 4:
        raise SystemExit("--workers must be between 1 and 4")
    if not args.api_key:
        print(
            "IOC API key missing. Set IOC_SEALEVEL_API_KEY or pass --api-key.",
            file=sys.stderr,
        )
        return 2
    sensors = args.sensor or ["rad", "prs", "bub"]
    snapshot_id = args.snapshot_id or datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    snapshot = args.output_root.resolve() / snapshot_id
    snapshot.mkdir(parents=True, exist_ok=args.resume)
    opener = urllib.request.build_opener(
        urllib.request.ProxyHandler({}) if args.direct else urllib.request.ProxyHandler()
    )

    urls = research_urls(
        args.start,
        args.stop,
        sensors,
        days_per_page=args.days_per_page,
        fit_to_sample_rate=args.fit_to_sample_rate,
    )

    def collect_one(
        index: int, sensor: str, url: str, page: int
    ) -> tuple[int, dict[str, object]]:
        destination = snapshot / "research" / sensor / f"page-{page:03}.json"
        try:
            if args.resume and destination.exists():
                record = existing_json_record(url, destination)
            else:
                record = download_with_retries(
                    opener,
                    url,
                    args.api_key,
                    destination,
                    args.timeout,
                    args.retries,
                )
            record["relative_path"] = str(destination.relative_to(snapshot))
        except Exception as error:
            record = {
                "url": url,
                "relative_path": str(destination.relative_to(snapshot)),
                "status": "failed",
                "error_type": type(error).__name__,
                "error": str(error),
                "retrieval_completed_utc": datetime.now(UTC).isoformat(),
            }
        record.update({"sensor": sensor, "page": page})
        return index, record

    indexed_records: dict[int, dict[str, object]] = {}
    with ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {
            executor.submit(collect_one, index, sensor, url, page): (
                index,
                sensor,
                url,
                page,
            )
            for index, (sensor, url, page) in enumerate(urls, 1)
        }
        for completed, future in enumerate(as_completed(futures), 1):
            index, sensor, url, page = futures[future]
            try:
                record_index, record = future.result()
            except Exception as error:
                record_index = index
                record = {
                    "url": url,
                    "relative_path": str(
                        (
                            snapshot
                            / "research"
                            / sensor
                            / f"page-{page:03}.json"
                        ).relative_to(snapshot)
                    ),
                    "status": "failed",
                    "error_type": type(error).__name__,
                    "error": str(error),
                    "retrieval_completed_utc": datetime.now(UTC).isoformat(),
                    "sensor": sensor,
                    "page": page,
                }
            indexed_records[record_index] = record
            print(
                f"[{completed:03}/{len(urls):03}] {sensor} page {page}: "
                f"{record['status']}",
                flush=True,
            )
    records = [indexed_records[index] for index in sorted(indexed_records)]

    manifest = {
        "schema_version": "1.0",
        "station": "PRIC",
        "endpoint": "IOC SLSMF research API v2, one-sensor",
        "start_inclusive": args.start.isoformat(),
        "stop_exclusive": args.stop.isoformat(),
        "sensors": sensors,
        "qc_policy": (
            "All endpoint filters disabled and flag_qc enabled. "
            f"fit_to_sample_rate={str(args.fit_to_sample_rate).lower()}; "
            "preserve first, regularize and filter downstream."
        ),
        "fit_to_sample_rate": args.fit_to_sample_rate,
        "days_per_page": args.days_per_page,
        "workers": args.workers,
        "completed_utc": datetime.now(UTC).isoformat(),
        "records": records,
        "summary": {
            "requested": len(records),
            "downloaded": sum(record["status"] == "downloaded" for record in records),
            "failed": sum(record["status"] == "failed" for record in records),
            "reused": sum(
                record.get("retrieval_mode") == "reused" for record in records
            ),
            "bytes": sum(int(record.get("bytes", 0)) for record in records),
        },
    }
    manifest_path = snapshot / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=True) + "\n", encoding="utf-8"
    )
    print(f"Manifest: {manifest_path}")
    return 1 if manifest["summary"]["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
