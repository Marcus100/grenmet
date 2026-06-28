"""CAP XML signing (src/cap/sign.py) — no-op when disabled, sign+verify when configured."""

import datetime as dt

import pytest

from src.cap import sign
from src.cap.config import cap_config

_XML = (
    '<?xml version="1.0"?>'
    '<alert xmlns="urn:oasis:names:tc:emergency:cap:1.2">'
    "<identifier>SIGN-001</identifier></alert>"
)


def _self_signed() -> tuple[str, str]:
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.x509.oid import NameOID

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "cap-test")])
    now = dt.datetime.now(dt.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - dt.timedelta(days=1))
        .not_valid_after(now + dt.timedelta(days=1))
        .sign(key, hashes.SHA256())
    )
    key_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    ).decode()
    cert_pem = cert.public_bytes(serialization.Encoding.PEM).decode()
    return cert_pem, key_pem


def test_noop_when_signing_disabled() -> None:
    assert sign.is_signing_enabled() is False
    assert sign.sign_xml(_XML) == _XML
    assert sign.signing_key_ref() is None
    assert sign.verify_xml(_XML) is True


def test_sign_and_verify_roundtrip(monkeypatch: pytest.MonkeyPatch) -> None:
    cert_pem, key_pem = _self_signed()
    monkeypatch.setattr(cap_config, "CAP_SIGNING_CERT", cert_pem)
    monkeypatch.setattr(cap_config, "CAP_SIGNING_KEY", key_pem)

    assert sign.is_signing_enabled() is True
    signed = sign.sign_xml(_XML)
    assert "Signature" in signed
    assert signed != _XML
    assert sign.verify_xml(signed) is True
    assert sign.signing_key_ref() == "cap-signing-key"
