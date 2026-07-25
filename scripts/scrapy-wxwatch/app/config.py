from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Mapping


class StorageConfigurationError(ValueError):
    """Raised when object-storage settings are incomplete or invalid."""


@dataclass(frozen=True, slots=True)
class ImageStorageConfig:
    """Validated storage settings exposed in Scrapy's native format."""

    images_store: str
    endpoint_url: str | None = None
    region: str | None = None
    access_key_id: str | None = None
    secret_access_key: str | None = None
    object_acl: str = "private"

    @classmethod
    def from_env(
        cls,
        environ: Mapping[str, str],
        *,
        default_local_store: Path | None = None,
    ) -> ImageStorageConfig:
        cloud_keys = (
            "STORAGE_ENDPOINT_URL",
            "STORAGE_BUCKET",
            "STORAGE_ACCESS_KEY_ID",
            "STORAGE_SECRET_ACCESS_KEY",
        )
        values = {key: environ.get(key, "").strip() for key in cloud_keys}
        configured_count = sum(bool(value) for value in values.values())

        if configured_count not in {0, len(cloud_keys)}:
            missing = ", ".join(key for key, value in values.items() if not value)
            raise StorageConfigurationError(
                f"Incomplete object-storage configuration; missing: {missing}"
            )

        if configured_count == 0:
            local_store = environ.get("IMAGES_STORE", "").strip()
            if not local_store:
                local_store = str(default_local_store or Path.cwd() / "data" / "images")
            return cls(images_store=local_store)

        prefix = environ.get("STORAGE_PREFIX", "wxwatch").strip().strip("/")
        prefix_path = f"{prefix}/" if prefix else ""
        object_acl = environ.get("STORAGE_OBJECT_ACL", "private").strip()
        if object_acl not in {"private", "public-read"}:
            raise StorageConfigurationError(
                "STORAGE_OBJECT_ACL must be 'private' or 'public-read'"
            )

        return cls(
            images_store=f"s3://{values['STORAGE_BUCKET']}/{prefix_path}",
            endpoint_url=values["STORAGE_ENDPOINT_URL"],
            region=environ.get("STORAGE_REGION", "us-east-1").strip() or "us-east-1",
            access_key_id=values["STORAGE_ACCESS_KEY_ID"],
            secret_access_key=values["STORAGE_SECRET_ACCESS_KEY"],
            object_acl=object_acl,
        )

    def as_scrapy_settings(self) -> dict[str, str]:
        settings = {"IMAGES_STORE": self.images_store}
        if self.endpoint_url is None:
            return settings

        settings.update(
            {
                "AWS_ENDPOINT_URL": self.endpoint_url,
                "AWS_REGION_NAME": self.region or "us-east-1",
                "AWS_ACCESS_KEY_ID": self.access_key_id or "",
                "AWS_SECRET_ACCESS_KEY": self.secret_access_key or "",
                "IMAGES_STORE_S3_ACL": self.object_acl,
            }
        )
        return settings
