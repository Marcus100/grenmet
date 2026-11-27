"""Contacts: a variant email hash for the known-address check (issue #1982).

Additive, one nullable column, ``org.contact.email_variant_hash``, plus a
non-unique index on ``(organisation_id, email_variant_hash)``.

The column is the HMAC (same key and scheme as ``email_hash``) of the coarser
variant form of the address: ``+tag`` stripped, and dots stripped at the
providers that ignore them. It is used only to recognise a look-alike of a known
customer. It is never identity, so it is never unique and never matched on by
``upsert_contact`` or ``merge_contacts``.

Backfill: existing contacts that still hold a plaintext ``email`` and are not
erased get their variant hash computed here. Erased contacts have no ``email``
left, so they stay NULL and match on their exact address only. Nothing can
reconstruct an erased address, and nothing tries to.

The normalisation rule is copied into this file on purpose, so a later change
to the live rule in ``src.utils.email_hash`` cannot change what this revision
wrote. The key still comes from ``get_pepper()``: the secret, not the rule.

The downgrade drops the index and the column only.

Revision ID: contactvariant20261127
Revises: bookingabout20261127
"""

import hashlib
import hmac

import sqlalchemy as sa

from alembic import op
from src.utils.email_hash import get_pepper

revision = "contactvariant20261127"
down_revision = "bookingabout20261127"
branch_labels = None
depends_on = None

#: Final names (``op.f``): the metadata naming convention would rename them.
INDEX = "contact_organisation_email_variant_hash_idx"

#: Frozen copy of ``src.utils.email_hash.DOT_IGNORING_PROVIDERS`` and the alias map.
_DOT_IGNORING = frozenset({"gmail.com", "googlemail.com"})
_DOMAIN_ALIASES = {"googlemail.com": "gmail.com"}


def _variant_hash(email: str, pepper: str) -> str:
    """Frozen copy of ``normalise_email_variant`` then ``hash_email``."""
    clean = email.strip().lower()
    local, separator, domain = clean.rpartition("@")
    if separator:
        local = local.split("+", 1)[0]
        domain = _DOMAIN_ALIASES.get(domain, domain)
        if domain in _DOT_IGNORING:
            local = local.replace(".", "")
        clean = f"{local}@{domain}"
    return hmac.new(pepper.encode(), clean.encode(), hashlib.sha256).hexdigest()


def _backfill() -> None:
    bind = op.get_bind()
    pepper = get_pepper()
    rows = bind.execute(
        sa.text(
            "SELECT id, email FROM org.contact "
            "WHERE email IS NOT NULL AND erased_at IS NULL"
        )
    ).all()
    if not rows:
        return
    bind.execute(
        sa.text("UPDATE org.contact SET email_variant_hash = :variant WHERE id = :id"),
        [{"id": row.id, "variant": _variant_hash(row.email, pepper)} for row in rows],
    )


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column(
        "contact",
        sa.Column("email_variant_hash", sa.String(length=64), nullable=True),
        schema="org",
    )
    op.create_index(
        op.f(INDEX),
        "contact",
        ["organisation_id", "email_variant_hash"],
        schema="org",
    )
    _backfill()


def downgrade() -> None:
    op.drop_index(op.f(INDEX), table_name="contact", schema="org")
    op.drop_column("contact", "email_variant_hash", schema="org")
