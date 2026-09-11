#!/usr/bin/env python3
"""Download and verify a manifest into a NEW directory; never modify live stores."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys


def restore(manifest, destination):
    if manifest["environment"] not in {"staging", "production"}:
        raise ValueError("Invalid manifest environment")
    destination = Path(destination)
    # mkdir is exclusive; existing files, directories and symlinks are rejected.
    destination.mkdir(mode=0o700)
    for artifact in manifest["artifacts"]:
        key = artifact["key"]
        parts = Path(key).parts
        if len(parts) < 4 or parts[0] != manifest["environment"] or parts[1] not in {"objects", "sutron", "weather"} or ".." in parts:
            raise ValueError("Invalid backup artifact path")
        path = destination.joinpath(*parts[3:])
        path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        with path.open("xb") as output:
            subprocess.run(["aws", "s3", "cp", f"s3://{os.environ['DO_SPACES_BUCKET']}/{key}", "-", "--endpoint-url", os.environ["DO_SPACES_ENDPOINT"], "--only-show-errors"], stdout=output, check=True)
        with path.open("rb") as source:
            digest = hashlib.file_digest(source, "sha256").hexdigest()
        if path.stat().st_size != artifact["bytes"] or digest != artifact["sha256"]:
            raise ValueError("Restored artifact checksum/size mismatch")
    (destination / "verified-manifest.json").write_text(json.dumps(manifest, indent=2))
    print("All downloaded artifacts verified; use isolated application stores for restore testing")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", help="Downloaded success.json from the selected backup batch")
    parser.add_argument("destination", help="New isolated local directory; must not exist")
    args = parser.parse_args()
    try:
        restore(json.loads(Path(args.manifest).read_text()), args.destination)
    except (KeyError, ValueError, OSError, subprocess.SubprocessError):
        print("Restore verification failed; existing application stores were not modified", file=sys.stderr)
        sys.exit(1)
