"""Shared rule for tests that need the fetched WMO IWXXM XSD schemas.

Locally a missing install skips those tests with the reason. In CI (``CI`` is set by
GitHub Actions) it fails, because CI fetches the schemas before pytest and a skip
there would hide a broken fetch step.
"""

import os

import pytest

from src.eregister import iwxxm

MISSING_MESSAGE = (
    "IWXXM XSD schemas not installed: run `python -m scripts.fetch_iwxxm_schemas` "
    "in apps/api/fastapi"
)


def require_schemas() -> None:
    if iwxxm.schemas_installed():
        return
    if os.environ.get("CI"):
        pytest.fail(MISSING_MESSAGE)
    pytest.skip(MISSING_MESSAGE)
