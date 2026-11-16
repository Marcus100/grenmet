"""Printix events belong to an organisation (ADR-0060 organiser amendment).

Additive: a nullable ``organisation_id`` on ``printix.event`` referencing
``org.organisation.id``, with an index built concurrently. Existing events keep NULL,
so organisers do not see them until an administrator sets one. The foreign key is
added ``NOT VALID``: it is enforced on every new write at once, and the existing rows
are all NULL, so there is nothing to scan. Validating it later is a separate change.

Revision ID: printixorganisation20261116
Revises: printixoffline20261115
"""

import sqlalchemy as sa

from alembic import op

revision = "printixorganisation20261116"
down_revision = "printixoffline20261115"
branch_labels = None
depends_on = None

SCHEMA = "printix"
TABLE = "event"
INDEX = "event_organisation_id_idx"
FOREIGN_KEY = "event_organisation_id_fkey"


def upgrade() -> None:
    op.add_column(
        TABLE,
        sa.Column("organisation_id", sa.String(length=100), nullable=True),
        schema=SCHEMA,
    )
    op.execute(
        f'ALTER TABLE {SCHEMA}."{TABLE}" ADD CONSTRAINT "{FOREIGN_KEY}" '
        "FOREIGN KEY (organisation_id) REFERENCES org.organisation (id) NOT VALID"
    )
    with op.get_context().autocommit_block():
        op.create_index(
            INDEX,
            TABLE,
            ["organisation_id"],
            schema=SCHEMA,
            postgresql_concurrently=True,
        )


def downgrade() -> None:
    # Transactional on purpose: migration tests run every later downgrade inside
    # one transaction they roll back.
    # migration-safety: drops only the index, constraint and column this revision added.
    op.execute(f'DROP INDEX IF EXISTS {SCHEMA}."{INDEX}"')
    op.execute(
        f'ALTER TABLE {SCHEMA}."{TABLE}" DROP CONSTRAINT IF EXISTS "{FOREIGN_KEY}"'
    )
    op.drop_column(TABLE, "organisation_id", schema=SCHEMA)
