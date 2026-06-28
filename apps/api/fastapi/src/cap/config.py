"""CAP-domain settings (decoupled from global Settings).

XML signing is config-gated: when both cert and key are absent, signing is a no-op
(graceful, mirroring the original capcomposer behaviour).
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class CapConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_ignore_empty=True,
        extra="ignore",
    )

    # PEM contents (preferred for secrets managers) OR a file path. When unset,
    # CAP XML is published unsigned.
    CAP_SIGNING_CERT: str | None = None
    CAP_SIGNING_KEY: str | None = None
    # Human-readable reference recorded on signed snapshots (e.g. key id / alias).
    CAP_SIGNING_KEY_REF: str = "cap-signing-key"

    @property
    def signing_enabled(self) -> bool:
        return bool(self.CAP_SIGNING_CERT and self.CAP_SIGNING_KEY)


cap_config = CapConfig()
