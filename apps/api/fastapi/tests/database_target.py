"""One naming and ownership contract for disposable test databases."""

import re
from collections.abc import MutableMapping
from uuid import uuid4


def database_target(base: str, run_id: str, worker: str = "") -> str:
    if not re.fullmatch(r"[a-z][a-z0-9_]{0,15}", base):
        raise ValueError("Invalid test database base")
    if not re.fullmatch(r"[a-f0-9]{32}", run_id):
        raise ValueError("Invalid test run identifier")
    if worker and not re.fullmatch(r"gw[0-9]{1,4}", worker):
        raise ValueError("Invalid test worker identifier")
    return f"{base}_test_{run_id}" + (f"_{worker}" if worker else "")


def configure_database(environment: MutableMapping[str, str]) -> str:
    base = environment.setdefault(
        "VERIFY_DB_BASE", environment.get("POSTGRES_DB") or "app"
    )
    run_id = environment.setdefault("VERIFY_RUN_ID", uuid4().hex)
    target = database_target(base, run_id, environment.get("PYTEST_XDIST_WORKER", ""))
    environment["POSTGRES_DB"] = target
    return target


def require_owned_database(target: str, environment: MutableMapping[str, str]) -> None:
    expected = database_target(
        environment["VERIFY_DB_BASE"],
        environment["VERIFY_RUN_ID"],
        environment.get("PYTEST_XDIST_WORKER", ""),
    )
    if target != expected:
        raise RuntimeError(
            "Refusing database operation outside this test run and worker"
        )
