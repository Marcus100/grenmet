"""/scalar is registered only where the OpenAPI schema is served (issue #1414).

The app is built at import time from ENVIRONMENT, so each case runs in a fresh
interpreter. Running in-process would only ever see the test session's value.
"""

import os
import secrets
import subprocess
import sys
from pathlib import Path

import pytest

from src.main import SHOW_DOCS_ENVIRONMENTS

FASTAPI_ROOT = Path(__file__).resolve().parents[1]


_THROWAWAY_SECRETS = (
    ("POSTGRES_PASSWORD", 24),
    ("FIRST_SUPERUSER_PASSWORD", 24),
    ("SECRET_KEY", 48),
)


def _scalar_registered_for(environment: str) -> bool:
    # Production validation rejects default secrets: generate throwaway ones per run
    # (built by name, so no key-shaped literal sits in the source for secret scanning).
    throwaway = {
        name: secrets.token_urlsafe(length) for name, length in _THROWAWAY_SECRETS
    }
    env = {
        **os.environ,
        **throwaway,
        "ENVIRONMENT": environment,
        # Skips the TOTP key requirement; this probe never signs in.
        "AUTH_PRIVILEGED_MFA_MODE": "disabled",
        "BCRYPT_ROUNDS": "12",
    }
    result = subprocess.run(
        [
            sys.executable,
            "-c",
            "from src.main import app\n"
            "print('SCALAR=' + str(any(getattr(r, 'path', None) == '/scalar'"
            " for r in app.routes)))\n",
        ],
        cwd=FASTAPI_ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=180,
        check=False,
    )
    assert result.returncode == 0, (
        f"probe for {environment} failed:\n{result.stderr[-2000:]}"
    )
    for line in result.stdout.splitlines():
        if line.startswith("SCALAR="):
            return line.removeprefix("SCALAR=") == "True"
    raise AssertionError(
        f"probe printed no SCALAR line: {result.stdout!r} {result.stderr!r}"
    )


@pytest.mark.parametrize("environment", ["local", "staging", "production"])
def test_scalar_route_matches_docs_environment(environment: str) -> None:
    assert _scalar_registered_for(environment) == (
        environment in SHOW_DOCS_ENVIRONMENTS
    )
