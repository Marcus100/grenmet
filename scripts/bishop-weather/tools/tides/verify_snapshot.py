#!/usr/bin/env python3
"""Verify every downloaded artifact against a tide snapshot manifest."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        while chunk := stream.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("snapshot", type=Path)
    args = parser.parse_args()
    snapshot = args.snapshot.resolve()
    manifest = json.loads((snapshot / "manifest.json").read_text(encoding="utf-8"))
    failed: list[str] = []
    verified = 0
    for record in manifest["records"]:
        source_id = record["source_id"]
        if record["status"] != "downloaded":
            failed.append(f"{source_id}: manifest status {record['status']}")
            continue
        path = snapshot / record["relative_path"]
        if not path.is_file():
            failed.append(f"{source_id}: missing file")
            continue
        actual = sha256(path)
        if actual != record["sha256"]:
            failed.append(f"{source_id}: SHA-256 mismatch")
            continue
        verified += 1
    print(
        json.dumps(
            {
                "snapshot": str(snapshot),
                "verified": verified,
                "failed": len(failed),
                "failures": failed,
            },
            indent=2,
        )
    )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
