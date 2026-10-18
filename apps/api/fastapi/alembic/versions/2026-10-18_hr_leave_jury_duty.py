"""Add the JURY_DUTY leave type (provisional, GAA-LV-JURY-01).

Additive: one new value on the existing ``leavetype`` Postgres enum.

Revision ID: juryduty20261018
Revises: orgupload20261018
"""

from alembic import op

revision = "juryduty20261018"
down_revision = "orgupload20261018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Older Postgres cannot run ADD VALUE inside a transaction block, so commit
    # the open migration transaction and run the statement in autocommit mode.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE leavetype ADD VALUE IF NOT EXISTS 'JURY_DUTY'")


def downgrade() -> None:
    # Postgres cannot drop an enum value. The unused value is left in place, as
    # for the earlier PROFESSIONAL_APPOINTMENT and BEREAVEMENT additions.
    pass
