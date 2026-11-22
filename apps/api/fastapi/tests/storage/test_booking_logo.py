"""Booking logos: metadata is removed when the upload completes (issue #1622).

The stripper is tested on real files (EXIF with a GPS block, PNG text chunks, an
orientation tag). The completion path runs through the upload routes against a fake
store that keeps the bytes, so the stored object itself is checked.
"""

import io
import uuid
from collections.abc import Iterator
from typing import Any
from urllib.parse import urlparse

import httpx
import pytest
from PIL import Image
from PIL.PngImagePlugin import PngInfo
from sqlalchemy.ext.asyncio import AsyncSession

from src.organisations.models import MembershipRole
from src.storage import service as storage
from src.storage.image_metadata import ImageRejectedError, strip_metadata
from src.storage.models import OrgUpload
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org
from tests.storage.test_uploads import FakeStore

UPLOADS = "/api/v1/storage/uploads"
GPS_IFD = 0x8825
MAKE = 0x010F
ORIENTATION = 0x0112


def _jpeg_with_location(size: tuple[int, int] = (40, 30)) -> bytes:
    exif = Image.Exif()
    exif[MAKE] = "Phone Maker"
    exif.get_ifd(GPS_IFD)[1] = "N"
    exif.get_ifd(GPS_IFD)[2] = (12.0, 3.0, 0.0)
    buffer = io.BytesIO()
    Image.new("RGB", size, (200, 30, 30)).save(buffer, "JPEG", exif=exif.tobytes())
    return buffer.getvalue()


def _png_with_text(author: str) -> bytes:
    info = PngInfo()
    info.add_text("Author", author)
    buffer = io.BytesIO()
    Image.new("RGB", (32, 32), (0, 80, 160)).save(buffer, "PNG", pnginfo=info)
    return buffer.getvalue()


def _metadata_of(raw: bytes) -> tuple[Image.Image, dict[str, Any], int]:
    image = Image.open(io.BytesIO(raw))
    image.load()
    return image, dict(image.info), len(image.getexif())


def test_exif_with_a_location_is_gone_and_the_picture_is_kept() -> None:
    raw = _jpeg_with_location()
    assert _metadata_of(raw)[2] > 0  # the fixture really carries EXIF

    clean = strip_metadata(raw, "image/jpeg")

    image, info, exif_entries = _metadata_of(clean)
    assert image.format == "JPEG"
    assert image.size == (40, 30)
    assert exif_entries == 0
    assert "exif" not in info
    assert b"Phone Maker" not in clean


def test_png_text_chunks_are_removed() -> None:
    clean = strip_metadata(_png_with_text("Jane Example"), "image/png")
    image, info, _ = _metadata_of(clean)
    assert image.format == "PNG"
    assert "Author" not in info
    assert b"Jane Example" not in clean


def test_orientation_is_applied_before_the_tag_is_dropped() -> None:
    # 40 wide, 20 high, stored with orientation 6 (turn 90 degrees to show upright).
    exif = Image.Exif()
    exif[ORIENTATION] = 6
    buffer = io.BytesIO()
    Image.new("RGB", (40, 20)).save(buffer, "JPEG", exif=exif.tobytes())
    assert _metadata_of(buffer.getvalue())[0].size == (40, 20)

    clean = strip_metadata(buffer.getvalue(), "image/jpeg")
    image, _, exif_entries = _metadata_of(clean)
    assert image.size == (20, 40)
    assert exif_entries == 0


def test_webp_is_kept_as_webp() -> None:
    buffer = io.BytesIO()
    Image.new("RGB", (16, 16), (1, 2, 3)).save(buffer, "WEBP")
    clean = strip_metadata(buffer.getvalue(), "image/webp")
    assert Image.open(io.BytesIO(clean)).format == "WEBP"


@pytest.mark.parametrize(
    ("raw", "content_type", "message"),
    [
        (_png_with_text("x"), "image/gif", "Only JPEG, PNG and WebP"),
        (_png_with_text("x"), "image/jpeg", "not the image type"),
        (b"not an image at all", "image/png", "not a readable image"),
    ],
)
def test_bytes_that_are_not_the_declared_image_are_refused(
    raw: bytes, content_type: str, message: str
) -> None:
    with pytest.raises(ImageRejectedError, match=message):
        strip_metadata(raw, content_type)


class ByteStore(FakeStore):
    """The fake store keeps object bytes too, so the stripped file can be read back."""

    def __init__(self) -> None:
        super().__init__()
        self.blobs: dict[str, bytes] = {}

    def get_object(self, key: str) -> bytes:
        return self.blobs[key]

    def delete_object(self, key: str) -> None:
        super().delete_object(key)
        self.blobs.pop(key, None)

    def put_object(
        self, key: str, data: bytes, *, content_type: str | None = None
    ) -> None:
        self.blobs[key] = data
        self.objects[key] = {"ContentLength": len(data), "ContentType": content_type}


@pytest.fixture
def byte_store(monkeypatch: pytest.MonkeyPatch) -> Iterator[ByteStore]:
    fake = ByteStore()
    monkeypatch.setattr(storage, "storage_service", fake)
    yield fake


async def _upload(
    client: httpx.AsyncClient,
    store: ByteStore,
    headers: dict[str, str],
    raw: bytes,
    content_type: str = "image/jpeg",
) -> tuple[str, str]:
    ticket = (
        await client.post(
            UPLOADS,
            json={
                "app": "bookings",
                "purpose": "booking-logo",
                "content_type": content_type,
                "size_bytes": len(raw),
            },
            headers=headers,
        )
    ).json()
    key = urlparse(ticket["url"]).path.removeprefix("/test-space/")
    store.blobs[key] = raw
    store.objects[key] = {"ContentLength": len(raw), "ContentType": content_type}
    return ticket["id"], key


async def test_completing_a_logo_upload_strips_its_metadata(
    async_client: httpx.AsyncClient, db_async: AsyncSession, byte_store: ByteStore
) -> None:
    owner = await make_user(db_async)
    org = await make_org(
        db_async,
        "Logo Co",
        members=((owner, MembershipRole.OWNER),),
        apps=("bookings",),
    )
    headers = headers_for(owner, org.id)
    raw = _jpeg_with_location()
    upload_id, key = await _upload(async_client, byte_store, headers, raw)

    response = await async_client.post(
        f"{UPLOADS}/{upload_id}/complete", headers=headers
    )

    assert response.status_code == 200, response.text
    stored = byte_store.blobs[key]
    assert stored != raw
    assert _metadata_of(stored)[2] == 0
    assert b"Phone Maker" not in stored
    row = await db_async.get(OrgUpload, uuid.UUID(upload_id))
    assert row is not None
    assert (row.status, row.size_bytes) == ("complete", len(stored))


async def test_a_logo_that_is_not_really_an_image_is_deleted(
    async_client: httpx.AsyncClient, db_async: AsyncSession, byte_store: ByteStore
) -> None:
    owner = await make_user(db_async)
    org = await make_org(
        db_async,
        "Fake Co",
        members=((owner, MembershipRole.OWNER),),
        apps=("bookings",),
    )
    headers = headers_for(owner, org.id)
    upload_id, key = await _upload(
        async_client, byte_store, headers, b"%PDF-1.4 not a picture", "image/jpeg"
    )

    response = await async_client.post(
        f"{UPLOADS}/{upload_id}/complete", headers=headers
    )

    assert response.status_code == 422, response.text
    assert key not in byte_store.blobs
    assert key in byte_store.deleted
