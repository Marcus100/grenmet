"""Signed manage links (pure, no database): the signature, expiry, purpose and key."""

import re
import secrets
import uuid
from datetime import datetime, timedelta

import pytest

from src.auth.config import auth_settings
from src.bookings import email_code, manage_link

BOOKING = uuid.UUID("6f1d2c3b-4a59-4e7f-8a6b-0c1d2e3f4a5b")
OTHER = uuid.UUID("0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d")
ENDS = datetime(2027, 1, 5, 14, 30)  # naive UTC, as the database holds it
THIRTY_DAYS = timedelta(days=30)


@pytest.fixture(autouse=True)
def secret(monkeypatch: pytest.MonkeyPatch) -> str:
    value = "k" * 40
    monkeypatch.setattr(auth_settings, "SECRET_KEY", value)
    return value


def _flip_last(text: str) -> str:
    return text[:-1] + ("A" if text[-1] != "A" else "B")


def test_hkdf_matches_rfc_5869_test_case_1() -> None:
    # RFC 5869, appendix A.1 (SHA-256, 42 bytes of output).
    okm = manage_link.hkdf_sha256(
        bytes.fromhex("0b" * 22),
        salt=bytes.fromhex("000102030405060708090a0b0c"),
        info=bytes.fromhex("f0f1f2f3f4f5f6f7f8f9"),
        length=42,
    )
    assert okm.hex() == (
        "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf"
        "34007208d5b887185865"
    )


def test_the_signing_key_is_derived_and_domain_separated(
    secret: str,
) -> None:
    key = manage_link.signing_key()
    assert len(key) == 32
    assert key == manage_link.signing_key()  # deterministic
    assert key != secret.encode()  # never the raw application secret
    assert key != email_code._secret()  # never the email-code key
    assert key == manage_link.hkdf_sha256(
        secret.encode(), salt=None, info=b"bookings-manage-link-v1", length=32
    )


def test_the_signature_verifies_for_the_booking_it_was_minted_for() -> None:
    token = manage_link.mint(BOOKING, ENDS)
    assert manage_link.verify(token, now=ENDS - timedelta(days=2)) == BOOKING


def test_the_token_is_url_safe_short_and_distinct_from_a_legacy_token() -> None:
    token = manage_link.mint(BOOKING, ENDS)
    assert re.fullmatch(r"[A-Za-z0-9._-]+", token)
    assert len(token) <= 100  # the route's path limit
    assert manage_link.is_signed(token)
    # A legacy token is token_urlsafe: it never contains a dot, so the two never
    # collide in the route.
    assert not manage_link.is_signed(secrets.token_urlsafe(32))
    assert manage_link.mint(BOOKING, ENDS) == token  # the same booking and end
    assert manage_link.mint(OTHER, ENDS) != token


def test_a_tampered_token_is_rejected() -> None:
    now = ENDS - timedelta(days=1)
    version, booking_hex, expires, tag = manage_link.mint(BOOKING, ENDS).split(".")
    later = int(expires) + 86_400
    forged = {
        "another booking": f"{version}.{OTHER.hex}.{expires}.{tag}",
        "a later expiry": f"{version}.{booking_hex}.{later}.{tag}",
        "a changed tag": f"{version}.{booking_hex}.{expires}.{_flip_last(tag)}",
        "another version": f"v2.{booking_hex}.{expires}.{tag}",
        "a dropped part": f"{version}.{booking_hex}.{expires}",
        "an extra part": f"{version}.{booking_hex}.{expires}.{tag}.x",
        "a hyphenated id": (
            f"{version}.{str(BOOKING)}.{expires}.{tag}"  # same uuid, other text
        ),
    }
    for label, token in forged.items():
        assert manage_link.verify(token, now=now) is None, label


def test_an_expired_link_is_rejected_at_the_expiry_second_and_after() -> None:
    token = manage_link.mint(BOOKING, ENDS)
    expiry = ENDS + THIRTY_DAYS
    assert manage_link.verify(token, now=expiry - timedelta(seconds=1)) == BOOKING
    assert manage_link.verify(token, now=expiry + timedelta(seconds=1)) is None


def test_a_link_for_another_purpose_is_rejected_by_the_manage_route() -> None:
    other_purpose = manage_link.mint(BOOKING, ENDS, purpose="pay")
    now = ENDS - timedelta(days=1)
    assert manage_link.verify(other_purpose, now=now) is None
    # The same token verifies only for the purpose it was minted for.
    assert manage_link.verify(other_purpose, now=now, purpose="pay") == BOOKING


def test_a_link_signed_with_another_secret_is_rejected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    token = manage_link.mint(BOOKING, ENDS)
    monkeypatch.setattr(auth_settings, "SECRET_KEY", "j" * 40)
    assert manage_link.verify(token, now=ENDS - timedelta(days=1)) is None


@pytest.mark.parametrize(
    "token",
    [
        "",
        ".",
        "a.b.c",
        "v1.nothex.1767622200.abcdef",
        "v1.6f1d2c3b4a594e7f8a6b0c1d2e3f4a5b.not-a-number.abcdef",
        "v1." + "9" * 40 + ".1767622200.abcdef",
        "v1.6f1d2c3b4a594e7f8a6b0c1d2e3f4a5b.-1.abcdef",
    ],
)
def test_malformed_tokens_are_rejected_without_error(token: str) -> None:
    assert manage_link.verify(token, now=ENDS) is None
