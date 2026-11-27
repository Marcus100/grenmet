"""Keyed hashing of email addresses kept only as consent or suppression proof.

``hash_email`` is HMAC-SHA256 over the normalised (stripped, lower-cased)
address, keyed by the ``EMAIL_HASH_PEPPER`` secret, hex encoded. A database
leak alone cannot be checked against a list of addresses; losing or rotating
the pepper makes every stored hash unmatchable, so treat it like a signing key.
"""

import hashlib
import hmac

from src.config import settings

# Used only when ENVIRONMENT is "local" and no pepper is set, so a fresh
# checkout and the tests work. Never reaches staging or production.
_LOCAL_DEV_PEPPER = "local-development-email-hash-pepper-not-secret"


class EmailHashPepperMissingError(RuntimeError):
    """Raised instead of hashing with an empty key."""


def normalise_email(email: str) -> str:
    return email.strip().lower()


def get_pepper(pepper: str | None = None) -> str:
    """Return the pepper to use; refuse an empty one outside local development."""
    value = pepper if pepper is not None else settings.EMAIL_HASH_PEPPER
    if value:
        return value
    if settings.ENVIRONMENT == "local":
        return _LOCAL_DEV_PEPPER
    raise EmailHashPepperMissingError(
        "EMAIL_HASH_PEPPER is not set; refusing to hash email addresses with an "
        "empty key. Set the EMAIL_HASH_PEPPER secret for this environment."
    )


def hash_email(email: str, *, pepper: str | None = None) -> str:
    key = get_pepper(pepper).encode()
    return hmac.new(key, normalise_email(email).encode(), hashlib.sha256).hexdigest()


#: Providers that ignore dots in the local part of an address, so ``vic.tim@`` and
#: ``victim@`` are one mailbox. Used ONLY to build the variant form for the
#: known-address check (``normalise_email_variant``). Never identity: a provider
#: missing from this list keeps its dotted addresses separate, and the stored
#: ``email_hash`` is the only identity.
DOT_IGNORING_PROVIDERS = frozenset({"gmail.com", "googlemail.com"})

#: Domains that deliver to the same mailbox as another domain, folded for the
#: variant form only (over-matching is the safe direction here).
_DOMAIN_ALIASES = {"googlemail.com": "gmail.com"}


def normalise_email_variant(email: str) -> str:
    """A deliberately coarser form of ``normalise_email``, for the known-address check.

    Lower-cased and trimmed; everything from the first ``+`` to the ``@`` removed
    (for every provider); dots removed from the local part at the providers in
    ``DOT_IGNORING_PROVIDERS``; Google's ``googlemail.com`` folded into ``gmail.com``.
    Two addresses that differ only in these ways share one variant form, which is
    the point of it and also why it must never decide who a contact is.
    """
    clean = normalise_email(email)
    local, separator, domain = clean.rpartition("@")
    if not separator:
        return clean
    local = local.split("+", 1)[0]
    domain = _DOMAIN_ALIASES.get(domain, domain)
    if domain in DOT_IGNORING_PROVIDERS:
        local = local.replace(".", "")
    return f"{local}@{domain}"


def hash_email_variant(email: str, *, pepper: str | None = None) -> str:
    """``hash_email`` over the variant form: same key, same scheme, coarser input."""
    return hash_email(normalise_email_variant(email), pepper=pepper)
