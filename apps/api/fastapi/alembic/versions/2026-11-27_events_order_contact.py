"""Cash orders point at their walk-in contact (#1986 slice 1, expand step).

Additive: a nullable ``contact_id`` on ``events.orders`` referencing ``org.contact.id``.
Existing rows keep NULL until the batched backfill (``src/events/buyer_contacts.py``)
links them, so the old and new code can run side by side during a rolling deploy.
The foreign key is added ``NOT VALID`` (every existing row is NULL, nothing to scan)
and the index is built concurrently. buyer_name and buyer_phone are kept: reads
still use them, and dropping them is a later contract step.

Revision ID: eventsordercontact20261127
Revises: outboxrearm20261127
"""

import sqlalchemy as sa

from alembic import op

revision = "eventsordercontact20261127"
down_revision = "outboxrearm20261127"
branch_labels = None
depends_on = None

SCHEMA = "events"
TABLE = "orders"
COLUMN = "contact_id"
INDEX = "orders_contact_id_idx"
FOREIGN_KEY = "orders_contact_id_fkey"


def upgrade() -> None:
    op.add_column(
        TABLE,
        sa.Column(COLUMN, sa.String(length=100), nullable=True),
        schema=SCHEMA,
    )
    op.execute(
        f'ALTER TABLE {SCHEMA}."{TABLE}" ADD CONSTRAINT "{FOREIGN_KEY}" '
        "FOREIGN KEY (contact_id) REFERENCES org.contact (id) NOT VALID"
    )
    with op.get_context().autocommit_block():
        op.create_index(
            INDEX,
            TABLE,
            [COLUMN],
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
    op.drop_column(TABLE, COLUMN, schema=SCHEMA)
