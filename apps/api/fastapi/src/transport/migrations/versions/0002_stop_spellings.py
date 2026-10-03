"""Correct misspelled stop names copied from the 2025 transport memo."""

import sqlalchemy as sa

from alembic import op

revision = "transport_0002"
down_revision = "transport_0001"
branch_labels = None
depends_on = None

# (old slug, old name, new slug, new name) — confirmed by GAA on 2026-09-23.
RENAMES = (
    ("predmotempts", "Predmotempts", "perdmontemps", "Perdmontemps"),
    ("vincennse", "Vincennse", "vincennes", "Vincennes"),
    ("winsor-forest", "Winsor Forest", "windsor-forest", "Windsor Forest"),
    ("mt-kuma", "Mt. Kuma", "mt-cuma", "Mt. Cuma"),
)


def _rename(pairs: tuple[tuple[str, str, str, str], ...]) -> None:
    statement = sa.text(
        "UPDATE stops SET slug = :new_slug, name = :new_name WHERE slug = :old_slug"
    )
    for old_slug, _old_name, new_slug, new_name in pairs:
        op.execute(
            statement.bindparams(
                old_slug=old_slug, new_slug=new_slug, new_name=new_name
            )
        )


def upgrade() -> None:
    _rename(RENAMES)


def downgrade() -> None:
    _rename(
        tuple(
            (new, new_name, old, old_name) for old, old_name, new, new_name in RENAMES
        )
    )
