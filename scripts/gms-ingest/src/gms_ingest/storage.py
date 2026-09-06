"""Content-addressed originals and atomic publication."""

import hashlib
import json
import os
import tempfile
from datetime import UTC, datetime
from pathlib import Path


def utc_now():
    return datetime.now(UTC).isoformat()


def read_json(path, default=None):
    if not path.exists():
        return default
    return json.loads(path.read_text())


def atomic_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(dir=path.parent, prefix=".write-")
    try:
        with os.fdopen(descriptor, "w") as stream:
            json.dump(value, stream, indent=2, ensure_ascii=False, allow_nan=False)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        Path(temporary).replace(path)
    finally:
        Path(temporary).unlink(missing_ok=True)


def artifact_key(source_hash, kind, bbox):
    options = json.dumps(
        {"sha256": source_hash, "kind": kind, "bbox": bbox, "decoder": 2},
        sort_keys=True,
    )
    return hashlib.sha256(options.encode()).hexdigest()
