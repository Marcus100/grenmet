"""Object-storage settings (DigitalOcean Spaces / any S3-compatible backend).

Decoupled from global Settings (fastapi-best-practices), mirroring email_config.py.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class StorageConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_ignore_empty=True,
        extra="ignore",
    )

    # S3-compatible endpoint, e.g. https://nyc3.digitaloceanspaces.com
    STORAGE_ENDPOINT_URL: str | None = None
    # Region label (DO uses e.g. "nyc3"); boto3 requires some region_name.
    STORAGE_REGION: str = "us-east-1"
    # Bucket / Space name.
    STORAGE_BUCKET: str | None = None
    STORAGE_ACCESS_KEY_ID: str | None = None
    STORAGE_SECRET_ACCESS_KEY: str | None = None
    # Public/CDN base URL for objects, e.g.
    # https://<space>.nyc3.cdn.digitaloceanspaces.com  (no trailing slash needed).
    # When unset, public_url() falls back to "<endpoint>/<bucket>".
    STORAGE_PUBLIC_BASE_URL: str | None = None
    STORAGE_PRESIGN_EXPIRY_SECONDS: int = 3600

    @property
    def enabled(self) -> bool:
        return bool(
            self.STORAGE_ENDPOINT_URL
            and self.STORAGE_BUCKET
            and self.STORAGE_ACCESS_KEY_ID
            and self.STORAGE_SECRET_ACCESS_KEY
        )


storage_settings = StorageConfig()
