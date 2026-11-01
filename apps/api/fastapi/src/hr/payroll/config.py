"""Payslip signing keys (slice 4).

``PAYSLIP_HMAC_KEYS`` is a comma-separated list of ``keyid:secret`` pairs, the
first one current. Each payslip stores the id of the key that signed it, so
rotation is: add a new key at the front, keep the old ones until nothing signed
with them needs checking. A dedicated setting: never derived from
``SECRET_KEY`` or any other key. Nothing here logs or returns a secret.
"""

import re

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

KEY_ID = re.compile(r"[A-Za-z0-9_-]{1,32}")
MIN_SECRET_LENGTH = 32


class PayslipKeyError(ValueError):
    """The key list is malformed. The message never contains a secret."""


def parse_keys(raw: str) -> list[tuple[str, str]]:
    """``"k2:secret,k1:secret"`` -> ``[("k2", ...), ("k1", ...)]``, validated."""
    if not raw.strip():
        return []
    keys: list[tuple[str, str]] = []
    for position, item in enumerate(raw.split(","), start=1):
        key_id, separator, secret = item.strip().partition(":")
        if not separator or not KEY_ID.fullmatch(key_id):
            raise PayslipKeyError(
                f"PAYSLIP_HMAC_KEYS entry {position} must look like keyid:secret "
                "(key id: letters, digits, _ or -, up to 32)"
            )
        if len(secret) < MIN_SECRET_LENGTH or any(c.isspace() for c in secret):
            raise PayslipKeyError(
                f"PAYSLIP_HMAC_KEYS secret for '{key_id}' must be at least "
                f"{MIN_SECRET_LENGTH} characters with no spaces"
            )
        if any(key_id == existing for existing, _ in keys):
            raise PayslipKeyError(f"PAYSLIP_HMAC_KEYS repeats key id '{key_id}'")
        keys.append((key_id, secret))
    return keys


class PayslipConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.local", env_ignore_empty=True, extra="ignore"
    )

    PAYSLIP_HMAC_KEYS: SecretStr = SecretStr("")

    @field_validator("PAYSLIP_HMAC_KEYS")
    @classmethod
    def _check(cls, value: SecretStr) -> SecretStr:
        parse_keys(value.get_secret_value())
        return value


payslip_settings = PayslipConfig()
