"""Fetch the pinned WMO IWXXM 2025-2 schemas for offline validation.

The schemas are not committed to this repository: the upstream project declares no
licence and WMO asks for permission to reproduce its materials. Instead this script
downloads each pinned file from the wmo-im/iwxxm tag v2025-2, checks it against the
SHA-256 manifest committed in src/eregister/iwxxm_schema_manifest.json, and writes the
files into src/eregister/iwxxm_xsd/2025-2, which is gitignored.

    python -m scripts.fetch_iwxxm_schemas          # fetch when missing or changed
    python -m scripts.fetch_iwxxm_schemas --check  # verify what is installed; no network

Run it from apps/api/fastapi with the project environment (``uv run --frozen --package
fast-back python -m scripts.fetch_iwxxm_schemas``); the Docker and CI steps do that.

Download resilience (the image build runs this as its last layer, and raw.githubusercontent
.com sometimes answers 503 or 429): each file is tried up to 5 times. Retries happen on
HTTP 5xx, HTTP 429 and transport errors (connection, timeout, server disconnect); any other
4xx, and client-side protocol errors (an unsupported URL), fail at once. The wait is
exponential (1 s, 2 s, 4 s, 8 s, capped at 60 s) with equal jitter, and a Retry-After header
(seconds or HTTP date) is honoured as a minimum wait, capped at 60 s. At most 8 requests run
at once. When the retries are spent the script exits 1 and names the file and the last
status or error. The first file to fail stops the others: waiting downloads wake up and
stop, so a failing run ends promptly. Nothing about what is fetched changes: the same pinned tag, the
same 100 files, each checked against its SHA-256 before anything is installed.
"""

import argparse
import hashlib
import json
import os
import random
import shutil
import sys
import tempfile
import threading
import time
from collections.abc import Callable
from concurrent.futures import ThreadPoolExecutor, as_completed
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any

import httpx

API_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = API_ROOT / "src" / "eregister" / "iwxxm_schema_manifest.json"
DESTINATION = API_ROOT / "src" / "eregister" / "iwxxm_xsd" / "2025-2"
TIMEOUT_SECONDS = 60
MAX_FILE_BYTES = 8 * 1024 * 1024
CHUNK_BYTES = 1024 * 1024
RETRY_ATTEMPTS = 5
RETRY_BASE_SECONDS = 1.0
RETRY_CAP_SECONDS = 60.0
MAX_PARALLEL_DOWNLOADS = 8


class DownloadError(ValueError):
    """A pinned file could not be downloaded; the message names the file."""


def wait_unless_stopped(seconds: float, stop: threading.Event) -> None:
    """Back-off wait that ends early when another file has already failed."""
    stop.wait(seconds)


def load_manifest() -> dict[str, Any]:
    manifest: dict[str, Any] = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    return manifest


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(CHUNK_BYTES), b""):
            digest.update(chunk)
    return digest.hexdigest()


def installed_problems(files: dict[str, str]) -> list[str]:
    """What is wrong with the installed copy (an empty list means it is complete and exact)."""
    problems: list[str] = []
    for relative, expected in files.items():
        target = DESTINATION / relative
        if not target.is_file():
            problems.append(f"missing {relative}")
        elif sha256_of(target) != expected:
            problems.append(f"changed {relative}")
    return problems


def is_retryable(status: int) -> bool:
    return status == 429 or status >= 500


def backoff_seconds(attempt: int, jitter: Callable[[], float]) -> float:
    """Equal jitter: between half and all of the exponential step for this attempt."""
    step = min(RETRY_CAP_SECONDS, RETRY_BASE_SECONDS * 2 ** (attempt - 1))
    return step / 2 + jitter() * step / 2


def retry_after_seconds(
    response: httpx.Response, clock: Callable[[], float]
) -> float | None:
    value = response.headers.get("Retry-After")
    if value is None:
        return None
    value = value.strip()
    if value.isdigit():
        return float(value)
    try:
        when = parsedate_to_datetime(value)
    except TypeError, ValueError:
        return None
    return max(0.0, when.timestamp() - clock())


def fetch_one(
    client: httpx.Client,
    relative: str,
    url: str,
    *,
    sleep: Callable[[float, threading.Event], None],
    clock: Callable[[], float],
    jitter: Callable[[], float],
    stop: threading.Event,
) -> bytes:
    """One file, with the retry rules in the module docstring."""
    last = "no response"
    for attempt in range(1, RETRY_ATTEMPTS + 1):
        if stop.is_set():
            raise DownloadError(f"{relative} stopped: another pinned file failed")
        response: httpx.Response | None = None
        try:
            response = client.get(url)
        except (httpx.UnsupportedProtocol, httpx.LocalProtocolError) as error:
            raise DownloadError(f"{relative} not retried: {error}") from error
        except httpx.TransportError as error:
            last = f"{type(error).__name__}: {error}"
        else:
            if response.status_code < 400:
                if len(response.content) > MAX_FILE_BYTES:
                    raise DownloadError(f"{relative} is larger than the allowed size")
                return response.content
            if not is_retryable(response.status_code):
                raise DownloadError(
                    f"{relative} returned HTTP {response.status_code}; not retried"
                )
            last = f"HTTP {response.status_code}"
        if attempt == RETRY_ATTEMPTS:
            break
        delay = backoff_seconds(attempt, jitter)
        advised = retry_after_seconds(response, clock) if response is not None else None
        if advised is not None:
            delay = max(delay, min(advised, RETRY_CAP_SECONDS))
        sleep(delay, stop)
    raise DownloadError(
        f"{relative} failed after {RETRY_ATTEMPTS} attempts; last status {last}"
    )


def download_pinned(
    manifest: dict[str, Any],
    *,
    transport: httpx.BaseTransport | None = None,
    sleep: Callable[[float, threading.Event], None] = wait_unless_stopped,
    clock: Callable[[], float] = time.time,
    jitter: Callable[[], float] = random.random,
) -> dict[str, bytes]:
    """Every pinned file, fetched one by one from the tag (the release archive omits
    externalSchema through .gitattributes export-ignore, so it cannot be used).

    At most MAX_PARALLEL_DOWNLOADS requests run at once. ``transport``, ``sleep``,
    ``clock`` and ``jitter`` exist so the tests can run without a network or waiting.
    """
    base: str = manifest["raw_base"]
    found: dict[str, bytes] = {}
    stop = threading.Event()
    with (
        httpx.Client(
            transport=transport,
            timeout=TIMEOUT_SECONDS,
            follow_redirects=True,
            headers={"User-Agent": "barrels-eregister-iwxxm"},
            limits=httpx.Limits(max_connections=MAX_PARALLEL_DOWNLOADS),
        ) as client,
        ThreadPoolExecutor(max_workers=MAX_PARALLEL_DOWNLOADS) as pool,
    ):
        futures = {
            pool.submit(
                fetch_one,
                client,
                relative,
                base + relative,
                sleep=sleep,
                clock=clock,
                jitter=jitter,
                stop=stop,
            ): relative
            for relative in manifest["files"]
        }
        try:
            for future in as_completed(futures):
                found[futures[future]] = future.result()
        finally:
            # On the first failure, wake the waiting downloads and drop the queued ones.
            stop.set()
            for future in futures:
                future.cancel()
    return found


def fetch(manifest: dict[str, Any]) -> None:
    files: dict[str, str] = manifest["files"]
    print(f"downloading {len(files)} files from {manifest['raw_base']}")
    found = download_pinned(manifest)
    for relative, expected in files.items():
        actual = hashlib.sha256(found[relative]).hexdigest()
        if actual != expected:
            raise ValueError(f"checksum mismatch for {relative}")
    # Stage next to the destination, then swap, so a failed run never leaves a half copy.
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    stage = Path(tempfile.mkdtemp(dir=DESTINATION.parent, prefix=".fetch-"))
    try:
        for relative, data in found.items():
            target = stage / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
        if DESTINATION.exists():
            shutil.rmtree(DESTINATION)
        os.replace(stage, DESTINATION)
    finally:
        if stage.exists():
            shutil.rmtree(stage)
    print(f"installed {len(files)} files in {DESTINATION}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--check",
        action="store_true",
        help="verify the installed copy only; no network",
    )
    args = parser.parse_args()
    manifest = load_manifest()
    files: dict[str, str] = manifest["files"]
    problems = installed_problems(files)
    if args.check:
        if problems:
            print("IWXXM schemas not complete:", *problems[:5], sep="\n  ")
            return 1
        print(f"IWXXM schemas installed and exact ({len(files)} files)")
        return 0
    if not problems:
        print(f"IWXXM schemas already installed and exact ({len(files)} files)")
        return 0
    try:
        fetch(manifest)
    except (OSError, ValueError, httpx.HTTPError) as error:
        print(f"could not install the IWXXM schemas: {error}", file=sys.stderr)
        return 1
    remaining = installed_problems(files)
    if remaining:
        print(
            "IWXXM schemas still not exact:",
            *remaining[:5],
            sep="\n  ",
            file=sys.stderr,
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
