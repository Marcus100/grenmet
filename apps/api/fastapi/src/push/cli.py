"""Operator command: generate a VAPID key pair (printed only, never written)."""

import argparse
import base64
import sys

from cryptography.hazmat.primitives import serialization
from py_vapid import Vapid


def _b64url(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()


def generate_vapid() -> tuple[str, str]:
    """Return (public_key, private_key), both unpadded base64url."""
    vapid = Vapid()
    vapid.generate_keys()
    private_value = vapid.private_key.private_numbers().private_value
    public = vapid.public_key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return _b64url(public), _b64url(private_value.to_bytes(32, "big"))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=["generate-vapid"])
    parser.parse_args(argv)
    public, private = generate_vapid()
    sys.stdout.write(
        f"WEBPUSH_VAPID_PUBLIC_KEY={public}\n"
        f"WEBPUSH_VAPID_PRIVATE_KEY={private}\n"
        "WEBPUSH_CONTACT=mailto:ops@example.com\n"
        "# Store the private key as a secret; nothing was written to disk.\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
