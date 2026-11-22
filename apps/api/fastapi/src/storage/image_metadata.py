"""Remove metadata from an uploaded image (GPS and camera data in EXIF, XMP, ICC).

Pure and synchronous: callers run it in a thread. The picture is decoded and encoded
again in the same format, with orientation applied first so it still shows upright.
Only the pixels are written: the original's metadata blocks are cleared before saving.
"""

import io

from PIL import Image, ImageOps, UnidentifiedImageError

#: The same pixel ceiling the profile photos use (decoding is memory heavy).
MAX_PIXELS = 16_000_000
_FORMATS = {"image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WEBP"}
_QUALITY = 90


class ImageRejectedError(ValueError):
    """The bytes are not the image type that was declared (or not an image)."""


def strip_metadata(raw: bytes, content_type: str) -> bytes:
    """The image as ``content_type`` again, with no metadata; raises ImageRejectedError."""
    expected = _FORMATS.get(content_type)
    if expected is None:
        raise ImageRejectedError("Only JPEG, PNG and WebP images are accepted")
    try:
        with Image.open(io.BytesIO(raw)) as source:
            if source.format != expected:
                raise ImageRejectedError(
                    "The file is not the image type that was requested"
                )
            if source.width * source.height > MAX_PIXELS:
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

    if expected == "JPEG":
        image = image.convert("RGB")
    elif expected == "WEBP" and image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA")
    # Pillow reuses ``info`` for ICC profiles and EXIF on save; clearing it leaves
    # the pixels and nothing else.
    image.info = {}
    output = io.BytesIO()
    options = {"quality": _QUALITY} if expected in {"JPEG", "WEBP"} else {}
    image.save(output, format=expected, **options)
    return output.getvalue()
