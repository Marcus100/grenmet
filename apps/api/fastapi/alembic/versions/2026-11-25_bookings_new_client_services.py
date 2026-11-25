"""Services for new clients only, with a lead time before a first visit (#1863).

Additive: ``bookings.service.new_clients_only`` (not null, default false),
``first_visit_lead_days`` (null, 0 to 60) and ``first_visit_categories`` (null), and ``bookings.booking.returning_client_flagged_at``
(null; set for staff when a returning client requests a new-clients-only service).
Existing rows keep today's behaviour. The downgrade drops only these columns.

Revision ID: bookingnewclient20261125
Revises: bookingdepositbiz20261125
"""

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "bookingnewclient20261125"
down_revision = "bookingdepositbiz20261125"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column(
        "service",
        sa.Column(
            "new_clients_only",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false(),
        ),
        schema="bookings",
    )
    op.add_column(
        "service",
        sa.Column("first_visit_lead_days", sa.Integer(), nullable=True),
        schema="bookings",
    )
    op.add_column(
        "service",
        sa.Column(
            "first_visit_categories",
            postgresql.ARRAY(sa.String(80)),
            nullable=True,
        ),
        schema="bookings",
    )
    op.add_column(
        "booking",
        sa.Column("returning_client_flagged_at", sa.DateTime(), nullable=True),
        schema="bookings",
    )
    op.create_check_constraint(
        op.f("service_first_visit_lead_days_check"),
        "service",
        "first_visit_lead_days IS NULL OR first_visit_lead_days BETWEEN 0 AND 60",
        schema="bookings",
    )


def downgrade() -> None:
    op.drop_column("booking", "returning_client_flagged_at", schema="bookings")
    op.drop_constraint(
        op.f("service_first_visit_lead_days_check"),
        "service",
        schema="bookings",
        type_="check",
    )
    op.drop_column("service", "first_visit_categories", schema="bookings")
    op.drop_column("service", "first_visit_lead_days", schema="bookings")
    op.drop_column("service", "new_clients_only", schema="bookings")
