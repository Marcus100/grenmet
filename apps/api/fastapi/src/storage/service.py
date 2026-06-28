"""S3-compatible object storage (DigitalOcean Spaces).

boto3 is synchronous. Presigned-URL generation is purely local (no network) and is
safe to call from async code directly. Network operations (``put_object``,
``delete_object``) must be wrapped in ``fastapi.concurrency.run_in_threadpool`` when
called from an async route.

Reused by user images (avatars) and CAP outputs (PDFs, static maps, social images).
"""

from __future__ import annotations

import logging
from typing import Any, cast

import boto3  # type: ignore[import-untyped]
from botocore.config import Config as BotoConfig  # type: ignore[import-untyped]

from src.storage.config import StorageConfig, storage_settings

logger = logging.getLogger(__name__)


class StorageNotConfiguredError(RuntimeError):
    """Raised when a storage operation is attempted without full configuration."""


class StorageService:
    def __init__(self, config: StorageConfig | None = None) -> None:
        self._config = config or storage_settings
        self._client: Any | None = None

    def _require_configured(self) -> None:
        if not self._config.enabled:
            raise StorageNotConfiguredError(
                "Object storage is not configured. Set STORAGE_ENDPOINT_URL, "
                "STORAGE_BUCKET, STORAGE_ACCESS_KEY_ID and STORAGE_SECRET_ACCESS_KEY."
            )

    @property
    def bucket(self) -> str:
        self._require_configured()
        return cast(str, self._config.STORAGE_BUCKET)

    @property
    def client(self) -> Any:
        self._require_configured()
        if self._client is None:
            self._client = boto3.client(
                "s3",
                endpoint_url=self._config.STORAGE_ENDPOINT_URL,
                region_name=self._config.STORAGE_REGION,
                aws_access_key_id=self._config.STORAGE_ACCESS_KEY_ID,
                aws_secret_access_key=self._config.STORAGE_SECRET_ACCESS_KEY,
                config=BotoConfig(signature_version="s3v4"),
            )
        return self._client

    def _expiry(self, expires_in: int | None) -> int:
        return expires_in or self._config.STORAGE_PRESIGN_EXPIRY_SECONDS

    def presigned_upload_url(
        self, key: str, *, content_type: str | None = None, expires_in: int | None = None
    ) -> str:
        """Presigned PUT URL for a client to upload directly to storage (local signing)."""
        params: dict[str, Any] = {"Bucket": self.bucket, "Key": key}
        if content_type:
            params["ContentType"] = content_type
        return cast(
            str,
            self.client.generate_presigned_url(
                "put_object", Params=params, ExpiresIn=self._expiry(expires_in)
            ),
        )

    def presigned_download_url(self, key: str, *, expires_in: int | None = None) -> str:
        """Presigned GET URL for a client to download a private object (local signing)."""
        return cast(
            str,
            self.client.generate_presigned_url(
                "get_object",
                Params={"Bucket": self.bucket, "Key": key},
                ExpiresIn=self._expiry(expires_in),
            ),
        )

    def public_url(self, key: str) -> str:
        """Stable public URL for an object (CDN base if configured, else endpoint/bucket)."""
        self._require_configured()
        base = self._config.STORAGE_PUBLIC_BASE_URL or (
            f"{self._config.STORAGE_ENDPOINT_URL}/{self.bucket}"
        )
        return f"{base.rstrip('/')}/{key.lstrip('/')}"

    def put_object(
        self, key: str, data: bytes, *, content_type: str | None = None
    ) -> None:
        """Upload bytes (network I/O — wrap in run_in_threadpool from async code)."""
        extra: dict[str, Any] = {}
        if content_type:
            extra["ContentType"] = content_type
        self.client.put_object(Bucket=self.bucket, Key=key, Body=data, **extra)
        logger.info("Stored object", extra={"key": key})

    def delete_object(self, key: str) -> None:
        """Delete an object (network I/O — wrap in run_in_threadpool from async code)."""
        self.client.delete_object(Bucket=self.bucket, Key=key)
        logger.info("Deleted object", extra={"key": key})


storage_service = StorageService()
