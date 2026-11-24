"""Remove metadata from an uploaded image (GPS and camera data in EXIF, XMP, ICC).

Pure and synchronous: callers run it in a thread. The picture is decoded and encoded
again in the same format, with orientation applied first so it still shows upright.
Only the pixels are written: the original's metadata blocks are cleared before saving.
Transparency is kept: a palette or colour-key transparency (stored in ``info``) becomes
an alpha channel before ``info`` is cleared. Animated PNG and WebP files are flattened
to their first frame. Completion serves only the bytes this module returns, from a key
the server chose (see ``uploads.py``), so a presigned overwrite cannot reach them.
"""

import io

from PIL import Image, ImageOps, UnidentifiedImageError

_FORMATS = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}
#: Modes each format writes directly; anything else is converted first.
_SAVE_MODES = {
    "JPEG": ("RGB",),
    "WEBP": ("RGB", "RGBA"),
    "PNG": ("1", "L", "LA", "P", "RGB", "RGBA", "I", "I;16"),
}
_QUALITY = 90
_JPEG_START = b"\xff\xd8\xff"
_PNG_START = b"\x89PNG\r\n\x1a\n"


class ImageRejectedError(ValueError):
    """The bytes are not the image type that was declared (or not an image)."""


def has_type_signature(raw: bytes, content_type: str) -> bool:
    """Whether the leading bytes are the declared image type (for purposes that do not
    re-encode). A cheap check on the file signature, not a full decode."""
    if content_type == "image/webp":
        return raw[:4] == b"RIFF" and raw[8:12] == b"WEBP"
    if content_type == "image/jpeg":
        return raw.startswith(_JPEG_START)
    if content_type == "image/png":
        return raw.startswith(_PNG_START)
    return False


def strip_metadata(raw: bytes, content_type: str, *, max_pixels: int) -> bytes:
    """The image as ``content_type`` again, with no metadata.

    ``max_pixels`` caps the decoded size (the purpose's limit). Raises
    ``ImageRejectedError`` for anything else.
    """
    expected = _FORMATS.get(content_type)
    if expected is None:
        raise ImageRejectedError("Only JPEG, PNG and WebP images are accepted")
    try:
        with Image.open(io.BytesIO(raw)) as source:
            if source.format != expected:
                raise ImageRejectedError(
                    "The file is not the image type that was requested"
                )
            if source.width * source.height > max_pixels:
                raise ImageRejectedError("The image has too many pixels")
            image = ImageOps.exif_transpose(source)
            image.load()
    except ImageRejectedError:
        raise
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
    ) as error:
        raise ImageRejectedError("The file is not a readable image") from error

    # Convert and save fail too (a broken file, a full disk): the caller treats any
    # ImageRejectedError as a rejected upload, so none of these becomes a 500.
    try:
        # Transparency given by ``info`` (a palette entry or a colour key) must become
        # an alpha channel before ``info`` is cleared, or transparent pixels save opaque.
        if "transparency" in image.info and image.mode not in ("RGBA", "LA"):
            image = image.convert("RGBA")
        elif image.mode not in _SAVE_MODES[expected]:
            image = image.convert("RGB" if expected == "JPEG" else "RGBA")
        # Pillow reuses ``info`` for ICC profiles and EXIF on save; clearing it leaves
        # the pixels and nothing else.
        image.info = {}
        output = io.BytesIO()
        options = {"quality": _QUALITY} if expected in {"JPEG", "WEBP"} else {}
        image.save(output, format=expected, **options)
    except (OSError, ValueError, Image.DecompressionBombError) as error:
        raise ImageRejectedError("The image could not be re-encoded") from error
    return output.getvalue()
