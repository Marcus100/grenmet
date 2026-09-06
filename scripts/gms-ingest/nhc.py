"""Compatibility entrypoint; prefer uv run --frozen --package gms-ingest nhc."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))
from gms_ingest.cli import main  # noqa: E402

if __name__ == "__main__":
    arguments = sys.argv[1:]
    if not arguments or arguments[0] not in {"collect", "status", "point"}:
        arguments.insert(0, "collect")
    sys.exit(main(arguments))
