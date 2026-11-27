"""Bookings: a request is paid after the business accepts it.

Additive: two columns on ``bookings.booking``.

- ``pay_after_acceptance`` (boolean, default false): the request is paid by card
  only once the business accepts it. Existing rows keep false, so every booking
  already made behaves as before.
- ``accepted_at`` (nullable timestamp): when the business accepted the request.
  The payment hold of a ``pay_after_acceptance`` booking runs from here.

Revision ID: bookingpayafteraccept20261126
Revises: casesinvestigation20261126
"""

import sqlalchemy as sa

from alembic import op

revision = "bookingpayafteraccept20261126"
down_revision = "casesinvestigation20261126"
branch_labels = None
depends_on = None

_SCHEMA = "bookings"


def upgrade() -> None:
    op.add_column(
        "booking",
        sa.Column(
            "pay_after_acceptance",
            sa.Boolean(),
            server_default=sa.false(),
            nullable=False,
        ),
        schema=_SCHEMA,
    )
    op.add_column(
        "booking",
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        schema=_SCHEMA,
    )


def downgrade() -> None:
    op.drop_column("booking", "accepted_at", schema=_SCHEMA)
    op.drop_column("booking", "pay_after_acceptance", schema=_SCHEMA)
