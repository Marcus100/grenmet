"""Fail before API tests can import code from another agent's worktree."""

import sys
from importlib.util import find_spec
from pathlib import Path


def check_imports(root: Path) -> list[str]:
    errors: list[str] = []
    for name in ("src", "gms_ingest"):
        spec = find_spec(name)
        if spec is None:
            # This workspace member is optional for fast-back-only test runs.
            # If installed, its editable source must still belong to this tree.
            if name == "gms_ingest":
                continue
            errors.append(f"Cannot resolve {name} in the API test interpreter")
            continue
        paths = list(spec.submodule_search_locations or [])
        if spec.origin and spec.origin not in {"built-in", "frozen"}:
            paths.append(spec.origin)
        if not paths:
            errors.append(f"Cannot establish a source location for {name}")
        for path in paths:
            resolved = Path(path).resolve()
            if not resolved.is_relative_to(root):
                errors.append(
                    f"{name} resolves outside the current worktree: {resolved} "
                    f"(expected under {root})"
                )
    return errors


if __name__ == "__main__":
    root = Path(sys.argv[1]).resolve()
    failures = check_imports(root)
    for failure in failures:
        print(f"API import isolation: {failure}", file=sys.stderr)
    sys.exit(bool(failures))
