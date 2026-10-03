#!/usr/bin/env python3
"""Report static UI references to OpenAPI operations; never infer readiness.

Usage: python3 scripts/audit/api-ui-coverage.py
JSON is written to stdout. No repository files are modified.
"""

import argparse
import json
import re
import subprocess
from datetime import datetime, timezone
from pathlib import Path

METHODS = {"get", "post", "put", "patch", "delete", "head", "options", "trace"}
EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".mjs"}


def path_pattern(path):
    """Match literal or template paths, including the staff proxy prefix."""
    variants = [path]
    if path.startswith("/api/v1/"):
        variants.append(path.replace("/api/v1/", "/_backend/", 1))
    if path.startswith("/api/v1/wxproducts/"):
        variants.append(path.replace("/api/v1/wxproducts/", "/_backend/weather/", 1))
    parts = []
    for variant in variants:
        segments = re.split(r"(\{[^}]+\})", variant)
        parts.append("".join(
            r"(?:\$\{[^}]+\}|[^/\s'\"`?{}]+)"
            if segment.startswith("{") else re.escape(segment)
            for segment in segments
        ))
    return re.compile(r"(?:" + "|".join(parts) + r")(?=[?\s'\"`]|$)")


def audit(root):
    spec = json.loads((root / "apps/api/fastapi/openapi.json").read_text())
    sources = []
    for app in sorted((root / "apps/web").iterdir()):
        for source in sorted((app / "src").rglob("*")):
            if source.suffix not in EXTENSIONS:
                continue
            if any(part in {"__tests__", "__mocks__"} for part in source.parts):
                continue
            if re.search(r"\.(test|spec)\.", source.name):
                continue
            sources.append((str(source.relative_to(root)), source.read_text().splitlines()))
    operations = []
    for path, item in sorted(spec["paths"].items()):
        for method, operation in sorted(item.items()):
            if method not in METHODS:
                continue
            operation_id = operation.get("operationId", "")
            # Kubb client filenames expose the generated identifier without
            # assuming operationId casing or treating schema imports as calls.
            client = root / "packages/api-client/src/gen/clients" / f"{operation_id}.ts"
            symbol = re.compile(r"\b(?:" + re.escape(operation_id)
                                + r"|use" + re.escape(operation_id[:1].upper() + operation_id[1:])
                                + r")\b") if operation_id and client.exists() else None
            literal = path_pattern(path)
            references = []
            for filename, lines in sources:
                for number, line in enumerate(lines, 1):
                    if symbol and symbol.search(line):
                        references.append({"file": filename, "line": number,
                                           "kind": "generated-symbol"})
                    elif literal.search(line):
                        references.append({"file": filename, "line": number,
                                           "kind": "path-candidate-method-unverified"})
            operations.append({"method": method.upper(), "path": path,
                               "operationId": operation_id, "references": references,
                               "workflow_verified": False})
    revision = subprocess.run(["git", "rev-parse", "HEAD"], cwd=root,
                              check=True, capture_output=True, text=True).stdout.strip()
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "revision": revision,
        "limitations": [
            "Static references are candidates, not executed calls or workflow verification.",
            "Path candidates do not establish HTTP method or proxy forwarding correctness.",
            "Dynamically composed paths, wrappers and aliases may require manual tracing.",
            "Tests and mocks are excluded; generated-symbol imports may be unused.",
        ],
        "total_operations": len(operations),
        "operations_with_candidates": sum(bool(op["references"]) for op in operations),
        "operations": operations,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(__file__).resolve().parents[2])
    args = parser.parse_args()
    print(json.dumps(audit(args.root), indent=2))
