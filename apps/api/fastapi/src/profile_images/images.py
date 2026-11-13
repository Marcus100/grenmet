"""Turn an uploaded photo into square WebP sizes with no metadata (#1303).

Pure and synchronous: callers run it in a thread. Re-encoding drops EXIF (GPS
location, camera serial) because nothing is copied to the output.
"""

import io

from PIL import Image, ImageOps, UnidentifiedImageError

from .exceptions import ProfileImageInvalidError

#: Largest upload accepted (bytes).
MAX_BYTES = 5 * 1024 * 1024
#: Square sizes stored for each upload, in pixels.
SIZES: tuple[int, ...] = (64, 256, 512)
ALLOWED_FORMATS = frozenset({"JPEG", "PNG", "WEBP"})
#: Refuse images whose pixel count could exhaust memory when decoded (the
#: largest stored size is 512 px, so 16 megapixels is generous).
MAX_PIXELS = 16_000_000
MIN_SIDE = 32
WEBP_QUALITY = 85


def process(raw: bytes) -> dict[int, bytes]:
    """WebP bytes per size in ``SIZES``; raises ``ProfileImageInvalidError``."""
    if len(raw) > MAX_BYTES:
        raise ProfileImageInvalidError("The photo must be 5 MB or smaller.")
    try:
        with Image.open(io.BytesIO(raw)) as source:
            if source.format not in ALLOWED_FORMATS:
                raise ProfileImageInvalidError("Upload a JPEG, PNG or WebP photo.")
            width, height = source.size
            if width * height > MAX_PIXELS:
                raise ProfileImageInvalidError(
                    "The photo has too many pixels. Use one under 16 megapixels."
                )
            if min(width, height) < MIN_SIDE:
                raise ProfileImageInvalidError(
                    f"The photo must be at least {MIN_SIDE} pixels on each side."
                )
            if source.format == "JPEG":
                # Decode at a reduced scale: the largest stored size is 512 px.
                source.draft("RGB", (max(SIZES) * 2, max(SIZES) * 2))
            upright = ImageOps.exif_transpose(source)
            mode = "RGBA" if "A" in upright.getbands() else "RGB"
            image = upright.convert(mode)
    except ProfileImageInvalidError:
        raise
    except (
        UnidentifiedImageError,
        OSError,
        ValueError,
        Image.DecompressionBombError,
    ) as error:
        raise ProfileImageInvalidError("Upload a JPEG, PNG or WebP photo.") from error

    side = min(image.size)
    left = (image.width - side) // 2
    top = (image.height - side) // 2
    square = image.crop((left, top, left + side, top + side))
    output: dict[int, bytes] = {}
    for size in SIZES:
        resized = square.resize((size, size), Image.Resampling.LANCZOS)
        buffer = io.BytesIO()
        resized.save(buffer, format="WEBP", quality=WEBP_QUALITY, method=4)
        output[size] = buffer.getvalue()
    return output
