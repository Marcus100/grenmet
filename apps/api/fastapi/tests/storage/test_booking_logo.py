"""Logos: metadata is removed when the upload completes (issue #1622).

The stripper is tested on real files (EXIF with a GPS block, PNG text and XMP chunks, an
ICC profile, an orientation tag, palette and colour-key transparency). The completion
path runs through the upload routes against a fake store that keeps the bytes, so the
stored object itself is checked. Organiser logos follow the same rule.
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
from src.storage.uploads import (
    BOOKING_LOGO_MAX_PIXELS,
    ORGANISER_LOGO_MAX_PIXELS,
)
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org
from tests.storage.test_uploads import FakeStore

UPLOADS = "/api/v1/storage/uploads"
GPS_IFD = 0x8825
MAKE = 0x010F
ORIENTATION = 0x0112
CAP = BOOKING_LOGO_MAX_PIXELS


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


def _png_with_xmp_and_icc() -> bytes:
    info = PngInfo()
    info.add_itxt("XML:com.adobe.xmp", "<x:xmpmeta>Jane Example</x:xmpmeta>")
    buffer = io.BytesIO()
    Image.new("RGB", (16, 16), (0, 80, 160)).save(
        buffer, "PNG", pnginfo=info, icc_profile=b"FAKE-ICC-PROFILE"
    )
    return buffer.getvalue()


def _metadata_of(raw: bytes) -> tuple[Image.Image, dict[str, Any], int]:
    image = Image.open(io.BytesIO(raw))
    image.load()
    return image, dict(image.info), len(image.getexif())


def _alpha_at(raw: bytes, xy: tuple[int, int]) -> int:
    return Image.open(io.BytesIO(raw)).convert("RGBA").getpixel(xy)[3]


def test_exif_with_a_location_is_gone_and_the_picture_is_kept() -> None:
    raw = _jpeg_with_location()
    assert _metadata_of(raw)[2] > 0  # the fixture really carries EXIF

    clean = strip_metadata(raw, "image/jpeg", max_pixels=CAP)

    image, info, exif_entries = _metadata_of(clean)
    assert image.format == "JPEG"
    assert image.size == (40, 30)
    assert exif_entries == 0
    assert "exif" not in info
    assert b"Phone Maker" not in clean


def test_png_text_xmp_and_icc_are_removed() -> None:
    text_clean = strip_metadata(
        _png_with_text("Jane Example"), "image/png", max_pixels=CAP
    )
    image, info, _ = _metadata_of(text_clean)
    assert image.format == "PNG"
    assert "Author" not in info
    assert b"Jane Example" not in text_clean

    raw = _png_with_xmp_and_icc()
    assert "icc_profile" in _metadata_of(raw)[1]  # the fixture really carries them
    clean = strip_metadata(raw, "image/png", max_pixels=CAP)
    _, info, _ = _metadata_of(clean)
    assert "icc_profile" not in info
    assert not any("xmp" in key.lower() for key in info)
    assert b"Jane Example" not in clean


def test_palette_transparency_survives_the_strip() -> None:
    image = Image.new("P", (8, 8), 0)
    image.putpalette([255, 0, 0, 0, 0, 255] + [0] * 762)
    image.putpixel((4, 4), 1)
    buffer = io.BytesIO()
    image.save(buffer, "PNG", transparency=0)

    clean = strip_metadata(buffer.getvalue(), "image/png", max_pixels=CAP)

    assert _alpha_at(clean, (0, 0)) == 0  # the transparent palette entry stays clear
    assert _alpha_at(clean, (4, 4)) == 255  # the opaque pixel stays opaque
    assert "transparency" not in _metadata_of(clean)[1]


@pytest.mark.parametrize(
    ("mode", "colour", "key", "other"),
    [
        ("RGB", (255, 0, 0), (255, 0, 0), (0, 0, 255)),
        ("L", 128, 128, 0),
    ],
)
def test_colour_key_transparency_survives_the_strip(
    mode: str, colour: Any, key: Any, other: Any
) -> None:
    image = Image.new(mode, (8, 8), colour)
    image.putpixel((4, 4), other)
    buffer = io.BytesIO()
    image.save(buffer, "PNG", transparency=key)

    clean = strip_metadata(buffer.getvalue(), "image/png", max_pixels=CAP)

    assert _alpha_at(clean, (0, 0)) == 0
    assert _alpha_at(clean, (4, 4)) == 255


def test_orientation_is_applied_before_the_tag_is_dropped() -> None:
    # 40 wide, 20 high, stored with orientation 6 (turn 90 degrees to show upright).
    exif = Image.Exif()
    exif[ORIENTATION] = 6
    buffer = io.BytesIO()
    Image.new("RGB", (40, 20)).save(buffer, "JPEG", exif=exif.tobytes())
    assert _metadata_of(buffer.getvalue())[0].size == (40, 20)

    clean = strip_metadata(buffer.getvalue(), "image/jpeg", max_pixels=CAP)
    image, _, exif_entries = _metadata_of(clean)
    assert image.size == (20, 40)
    assert exif_entries == 0


def test_webp_is_kept_as_webp() -> None:
    buffer = io.BytesIO()
    Image.new("RGB", (16, 16), (1, 2, 3)).save(buffer, "WEBP")
    clean = strip_metadata(buffer.getvalue(), "image/webp", max_pixels=CAP)
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
        strip_metadata(raw, content_type, max_pixels=CAP)


def test_a_decoded_image_over_the_purpose_cap_is_refused() -> None:
    buffer = io.BytesIO()
    Image.new("L", (2100, 2100), 7).save(buffer, "PNG")  # 4.41 megapixels, tiny file
    with pytest.raises(ImageRejectedError, match="too many pixels"):
        strip_metadata(buffer.getvalue(), "image/png", max_pixels=CAP)
    # A larger purpose cap accepts the same file.
    assert strip_metadata(buffer.getvalue(), "image/png", max_pixels=10_000_000)


class ByteStore(FakeStore):
    """The fake store keeps object bytes too, so the stripped file can be read back."""

    def __init__(self) -> None:
        super().__init__()
        self.blobs: dict[str, bytes] = {}

    def get_object(self, key: str) -> bytes:
        return self.blobs[key]

    def put_object(
        self, key: str, data: bytes, *, content_type: str | None = None
    ) -> None:
        self.blobs[key] = data
        self.objects[key] = {"ContentLength": len(data), "ContentType": content_type}

    def delete_object(self, key: str) -> None:
        super().delete_object(key)
        self.blobs.pop(key, None)


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
    *,
    app: str = "bookings",
    purpose: str = "booking-logo",
    content_type: str = "image/jpeg",
) -> tuple[str, str]:
    ticket = (
        await client.post(
            UPLOADS,
            json={
                "app": app,
                "purpose": purpose,
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


async def test_completing_a_booking_logo_strips_its_metadata(
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


async def test_completing_an_organiser_logo_strips_its_metadata(
    async_client: httpx.AsyncClient, db_async: AsyncSession, byte_store: ByteStore
) -> None:
    owner = await make_user(db_async)
    org = await make_org(db_async, "Crew Co", members=((owner, MembershipRole.OWNER),))
    headers = headers_for(owner, org.id)
    raw = _jpeg_with_location()
    upload_id, key = await _upload(
        async_client, byte_store, headers, raw, app="events", purpose="organiser-logo"
    )

    response = await async_client.post(
        f"{UPLOADS}/{upload_id}/complete", headers=headers
    )

    assert response.status_code == 200, response.text
    assert _metadata_of(byte_store.blobs[key])[2] == 0
    assert b"Phone Maker" not in byte_store.blobs[key]


def _flat_png(width: int, height: int) -> bytes:
    buffer = io.BytesIO()
    Image.new("L", (width, height), 7).save(buffer, "PNG")  # small file, big decode
    return buffer.getvalue()


def test_the_pixel_caps_are_per_purpose() -> None:
    five_megapixels = _flat_png(2500, 2000)
    assert strip_metadata(
        five_megapixels, "image/png", max_pixels=ORGANISER_LOGO_MAX_PIXELS
    )
    with pytest.raises(ImageRejectedError, match="too many pixels"):
        strip_metadata(five_megapixels, "image/png", max_pixels=BOOKING_LOGO_MAX_PIXELS)


async def test_a_booking_logo_over_its_cap_is_422_and_deleted(
    async_client: httpx.AsyncClient, db_async: AsyncSession, byte_store: ByteStore
) -> None:
    owner = await make_user(db_async)
    org = await make_org(
        db_async, "Big Co", members=((owner, MembershipRole.OWNER),), apps=("bookings",)
    )
    headers = headers_for(owner, org.id)
    upload_id, key = await _upload(
        async_client,
        byte_store,
        headers,
        _flat_png(2500, 2000),  # 5 megapixels: over the booking cap
        content_type="image/png",
    )

    response = await async_client.post(
        f"{UPLOADS}/{upload_id}/complete", headers=headers
    )

    assert response.status_code == 422, response.text
    assert "too many pixels" in response.text
    assert key not in byte_store.blobs


async def test_an_organiser_logo_of_five_megapixels_is_accepted(
    async_client: httpx.AsyncClient, db_async: AsyncSession, byte_store: ByteStore
) -> None:
    owner = await make_user(db_async)
    org = await make_org(db_async, "Phone Co", members=((owner, MembershipRole.OWNER),))
    headers = headers_for(owner, org.id)
    upload_id, key = await _upload(
        async_client,
        byte_store,
        headers,
        _flat_png(2500, 2000),
        app="events",
        purpose="organiser-logo",
        content_type="image/png",
    )

    response = await async_client.post(
        f"{UPLOADS}/{upload_id}/complete", headers=headers
    )

    assert response.status_code == 200, response.text
    assert key in byte_store.blobs


async def test_a_re_encode_failure_is_422_and_the_object_is_deleted(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    byte_store: ByteStore,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def disk_full(_self: object, *_args: object, **_kwargs: object) -> None:
        raise OSError("No space left on device")

    raw = _jpeg_with_location()  # built before save is patched
    monkeypatch.setattr(Image.Image, "save", disk_full)
    owner = await make_user(db_async)
    org = await make_org(
        db_async,
        "Full Co",
        members=((owner, MembershipRole.OWNER),),
        apps=("bookings",),
    )
    headers = headers_for(owner, org.id)
    upload_id, key = await _upload(async_client, byte_store, headers, raw)

    response = await async_client.post(
        f"{UPLOADS}/{upload_id}/complete", headers=headers
    )

    assert response.status_code == 422, response.text
    assert "re-encoded" in response.text
    assert key not in byte_store.blobs
    assert key in byte_store.deleted
    row = await db_async.get(OrgUpload, uuid.UUID(upload_id))
    assert row is not None
    assert row.status == "pending"


def test_a_save_failure_surfaces_as_a_rejection(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def broken(_self: object, *_args: object, **_kwargs: object) -> None:
        raise ValueError("cannot encode")

    raw = _jpeg_with_location()  # built before save is patched
    monkeypatch.setattr(Image.Image, "save", broken)
    with pytest.raises(ImageRejectedError, match="re-encoded"):
        strip_metadata(raw, "image/jpeg", max_pixels=CAP)


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
        async_client,
        byte_store,
        headers,
        b"%PDF-1.4 not a picture",
        content_type="image/jpeg",
    )

    response = await async_client.post(
        f"{UPLOADS}/{upload_id}/complete", headers=headers
    )

    assert response.status_code == 422, response.text
    assert key not in byte_store.blobs
    assert key in byte_store.deleted
