"""Historical state for imported archive records.

Additive on the eRegister chain only. ``historical`` marks records loaded from the
archive (the hourly sheet importer): official as recorded, never sent and never
waiting for acceptance. An enum value cannot be used in the transaction that adds
it; nothing in this migration uses it. PostgreSQL 12 and later allow ADD VALUE inside
a transaction block (production runs 17), so there is no autocommit block: the test
harness migrates on a connection whose transaction it owns, where Alembic cannot
open one.

The downgrade is a no-op: PostgreSQL cannot drop an enum value, and rows may
already hold it. The unused value is harmless to older code.
"""

from alembic import op

revision = "eregister_0008"
down_revision = "eregister_0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TYPE register_state ADD VALUE IF NOT EXISTS 'historical'")


def downgrade() -> None:
    # PostgreSQL cannot drop an enum value; leaving it in place is safe.
    pass
