"""Storage service tests — config gating + local presigned-URL signing (no network)."""

import pytest

from src.storage.config import StorageConfig
from src.storage.service import StorageNotConfiguredError, StorageService


def _configured() -> StorageService:
    return StorageService(
        StorageConfig(
            STORAGE_ENDPOINT_URL="https://nyc3.digitaloceanspaces.com",
            STORAGE_REGION="nyc3",
            STORAGE_BUCKET="test-space",
            STORAGE_ACCESS_KEY_ID="AKIATESTKEY",
            STORAGE_SECRET_ACCESS_KEY="secretdummy",
            STORAGE_PUBLIC_BASE_URL="https://test-space.nyc3.cdn.digitaloceanspaces.com",
        )
    )


def test_disabled_when_unconfigured() -> None:
    cfg = StorageConfig(
        STORAGE_ENDPOINT_URL=None,
        STORAGE_BUCKET=None,
        STORAGE_ACCESS_KEY_ID=None,
        STORAGE_SECRET_ACCESS_KEY=None,
    )
    assert cfg.enabled is False


def test_operations_raise_when_unconfigured() -> None:
    service = StorageService(
        StorageConfig(
            STORAGE_ENDPOINT_URL=None,
            STORAGE_BUCKET=None,
            STORAGE_ACCESS_KEY_ID=None,
            STORAGE_SECRET_ACCESS_KEY=None,
        )
    )
    with pytest.raises(StorageNotConfiguredError):
        service.presigned_upload_url("avatars/u1.png")


def test_presigned_upload_url_signs_locally() -> None:
    service = _configured()
    url = service.presigned_upload_url("avatars/u1.png", content_type="image/png")
    assert url.startswith("https://")
    assert "avatars/u1.png" in url
    assert "test-space" in url
    assert "X-Amz-Signature" in url


def test_presigned_download_url_signs_locally() -> None:
    service = _configured()
    url = service.presigned_download_url("cap/alert-123.pdf")
    assert "cap/alert-123.pdf" in url
    assert "X-Amz-Signature" in url


def test_public_url_uses_cdn_base() -> None:
    service = _configured()
    assert service.public_url("avatars/u1.png") == (
        "https://test-space.nyc3.cdn.digitaloceanspaces.com/avatars/u1.png"
    )


def test_public_url_falls_back_to_endpoint() -> None:
    service = StorageService(
        StorageConfig(
            STORAGE_ENDPOINT_URL="https://nyc3.digitaloceanspaces.com",
            STORAGE_BUCKET="test-space",
            STORAGE_ACCESS_KEY_ID="x",
            STORAGE_SECRET_ACCESS_KEY="y",
            STORAGE_PUBLIC_BASE_URL=None,
        )
    )
    assert service.public_url("k.txt") == (
        "https://nyc3.digitaloceanspaces.com/test-space/k.txt"
    )
