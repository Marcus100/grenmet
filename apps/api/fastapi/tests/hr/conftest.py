"""HR test defaults."""

import pytest
from pydantic import SecretStr

from src.hr.payroll import config

#: A synthetic signing key so payslips can be issued in tests.
TEST_PAYSLIP_KEY = "test1:" + "k" * 40


@pytest.fixture(autouse=True)
def payslip_signing_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        config.payslip_settings, "PAYSLIP_HMAC_KEYS", SecretStr(TEST_PAYSLIP_KEY)
    )
