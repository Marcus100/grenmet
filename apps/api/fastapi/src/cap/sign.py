"""CAP XML digital signing (XML-DSig via signxml). Config-gated no-op when unset.

Ported from capcomposer's ``cap/sign.py``. signxml/lxml are imported lazily so the
module loads even if signing is disabled, and the heavy deps are only touched when a
cert/key are configured.
"""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from src.cap.config import cap_config

logger = logging.getLogger(__name__)


def is_signing_enabled() -> bool:
    return cap_config.signing_enabled


def signing_key_ref() -> str | None:
    return cap_config.CAP_SIGNING_KEY_REF if cap_config.signing_enabled else None


def _load(value: str) -> bytes:
    """Accept PEM contents directly, or a filesystem path to a PEM file."""
    if value.strip().startswith("-----BEGIN"):
        return value.encode("utf-8")
    return Path(value).read_bytes()


def _hardened_parser() -> Any:
    """lxml parser with entity resolution and network access disabled (XXE-safe)."""
    from lxml import etree  # type: ignore[import-untyped]

    return etree.XMLParser(
        resolve_entities=False, no_network=True, dtd_validation=False
    )


def sign_xml(xml: str) -> str:
    """Return signed CAP XML, or the input unchanged when signing is disabled."""
    cert_src = cap_config.CAP_SIGNING_CERT
    key_src = cap_config.CAP_SIGNING_KEY
    if not (cert_src and key_src):
        return xml
    from lxml import etree
    from signxml import XMLSigner  # type: ignore[attr-defined]

    root = etree.fromstring(xml.encode("utf-8"), parser=_hardened_parser())
    signed = XMLSigner().sign(
        root, key=_load(key_src), cert=_load(cert_src).decode("utf-8")
    )
    return str(etree.tostring(signed, encoding="unicode"))


def verify_xml(xml: str) -> bool:
    """Verify a signed CAP XML against the configured cert. True when disabled."""
    cert_src = cap_config.CAP_SIGNING_CERT
    if not cert_src:
        return True
    from lxml import etree
    from signxml import XMLVerifier  # type: ignore[attr-defined]

    try:
        XMLVerifier().verify(
            etree.fromstring(xml.encode("utf-8"), parser=_hardened_parser()),
            x509_cert=_load(cert_src).decode("utf-8"),
        )
        return True
    except Exception:  # noqa: BLE001 - any verification failure is a False
        logger.warning("CAP XML signature verification failed", exc_info=True)
        return False
