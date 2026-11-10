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
"""

import argparse
import hashlib
import json
import os
import shutil
import sys
import tempfile
from pathlib import Path
from typing import Any

import httpx

API_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = API_ROOT / "src" / "eregister" / "iwxxm_schema_manifest.json"
DESTINATION = API_ROOT / "src" / "eregister" / "iwxxm_xsd" / "2025-2"
TIMEOUT_SECONDS = 60
MAX_FILE_BYTES = 8 * 1024 * 1024
CHUNK_BYTES = 1024 * 1024


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


def download_pinned(manifest: dict[str, Any]) -> dict[str, bytes]:
    """Every pinned file, fetched one by one from the tag (the release archive omits
    externalSchema through .gitattributes export-ignore, so it cannot be used)."""
    base: str = manifest["raw_base"]
    found: dict[str, bytes] = {}
    with httpx.Client(
        timeout=TIMEOUT_SECONDS,
        follow_redirects=True,
        headers={"User-Agent": "barrels-eregister-iwxxm"},
    ) as client:
        for relative in manifest["files"]:
            response = client.get(base + relative)
            response.raise_for_status()
            if len(response.content) > MAX_FILE_BYTES:
                raise ValueError(f"{relative} is larger than the allowed size")
            found[relative] = response.content
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
