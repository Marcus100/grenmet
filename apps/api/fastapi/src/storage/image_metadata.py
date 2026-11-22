"""Remove metadata from an uploaded image (GPS and camera data in EXIF, XMP, ICC).

Pure and synchronous: callers run it in a thread. The picture is decoded and encoded
again in the same format, with orientation applied first so it still shows upright.
Only the pixels are written: the original's metadata blocks are cleared before saving.
Transparency is kept: a palette or colour-key transparency (stored in ``info``) becomes
an alpha channel before ``info`` is cleared. Animated PNG and WebP files are flattened
to their first frame. This removes metadata from honest uploads at completion; it is
not a defence against a hostile uploader, who can still overwrite the object.
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


class ImageRejectedError(ValueError):
    """The bytes are not the image type that was declared (or not an image)."""


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

    # Transparency given by ``info`` (a palette entry or a colour key) must become an
    # alpha channel before ``info`` is cleared, or transparent pixels save opaque.
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
    return output.getvalue()
