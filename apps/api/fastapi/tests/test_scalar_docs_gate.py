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

_PROBE = (
    "from src.main import app\n"
    "print('SCALAR=' + str(any(getattr(r, 'path', None) == '/scalar' for r in app.routes)))\n"
)


def _scalar_registered_for(environment: str) -> bool:
    env = {
        **os.environ,
        "ENVIRONMENT": environment,
        # Production validation rejects default secrets; generate throwaway ones per run.
        "POSTGRES_PASSWORD": secrets.token_urlsafe(24),
        "FIRST_SUPERUSER_PASSWORD": secrets.token_urlsafe(24),
        "SECRET_KEY": secrets.token_urlsafe(48),
        # Skips the TOTP key requirement; this probe never signs in.
        "AUTH_PRIVILEGED_MFA_MODE": "disabled",
        "BCRYPT_ROUNDS": "12",
    }
    result = subprocess.run(
        [sys.executable, "-c", _PROBE],
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
