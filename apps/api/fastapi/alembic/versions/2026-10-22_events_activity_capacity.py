"""Events activity records the capacity of the actor (ADR-0050).

Additive. ``events.activity`` gains ``actor_capacity`` (``member`` or ``staff``),
``member`` for every existing row. The append-only trigger rejects UPDATE and
DELETE of rows, not a column add with a default, so history is untouched.

Revision ID: eventsactivitycapacity20261022
Revises: orgverifystatus20261022
"""

import sqlalchemy as sa

from alembic import op

revision = "eventsactivitycapacity20261022"
down_revision = "orgverifystatus20261022"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "activity",
        sa.Column("actor_capacity", sa.Text(), nullable=False, server_default="member"),
        schema="events",
    )
    op.create_check_constraint(
        op.f("activity_actor_capacity_check"),
        "activity",
        "actor_capacity IN ('member', 'staff')",
        schema="events",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("activity_actor_capacity_check"),
        "activity",
        schema="events",
        type_="check",
    )
    op.drop_column("activity", "actor_capacity", schema="events")
