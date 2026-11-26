"""Listing approval, owner-left flag and owner provider (ADR-0066 slice 1).

Additive, four nullable profile columns, no check constraints:

- ``bookings.profile.listing_approved_at`` and ``listing_approved_by_user_id``: Barrels
  staff approve a listed business before it shows on the home page.
- ``bookings.profile.owner_left_at``: set when the last owner of a self-created business
  deleted their account, so staff can review it.
- ``bookings.profile.owner_provider_id``: the provider named after the owner, renamed
  "Staff" when that owner leaves. Null for every business until sign-up creates one.

The backfill approves every profile that exists when this runs. Businesses Barrels
created before ADR-0066 keep appearing on the home page exactly as before. The
downgrade drops the four columns and their foreign keys and nothing else.

Revision ID: bookinglisting20261124
Revises: orgentitlementsource20261124
"""

import sqlalchemy as sa

from alembic import op

revision = "bookinglisting20261124"
down_revision = "orgentitlementsource20261124"
branch_labels = None
depends_on = None

#: Final names, matching the model's naming convention.
APPROVED_BY_FK = "profile_listing_approved_by_user_id_fkey"
OWNER_PROVIDER_FK = "profile_owner_provider_id_fkey"


def upgrade() -> None:
    op.execute("SET LOCAL lock_timeout = '5s'")
    op.add_column(
        "profile",
        sa.Column("listing_approved_at", sa.DateTime(), nullable=True),
        schema="bookings",
    )
    op.add_column(
        "profile",
        sa.Column("listing_approved_by_user_id", sa.Uuid(), nullable=True),
        schema="bookings",
    )
    op.add_column(
        "profile",
        sa.Column("owner_left_at", sa.DateTime(), nullable=True),
        schema="bookings",
    )
    op.add_column(
        "profile",
        sa.Column("owner_provider_id", sa.Uuid(), nullable=True),
        schema="bookings",
    )
    # NOT VALID: enforced for every new row at once, and the existing rows (all null in
    # these new columns) are not scanned under a lock. VALIDATE CONSTRAINT later.
    op.execute(
        f"ALTER TABLE bookings.profile ADD CONSTRAINT {APPROVED_BY_FK} "
        'FOREIGN KEY (listing_approved_by_user_id) REFERENCES "user" (id) '
        "ON DELETE SET NULL NOT VALID"
    )
    op.execute(
        f"ALTER TABLE bookings.profile ADD CONSTRAINT {OWNER_PROVIDER_FK} "
        "FOREIGN KEY (owner_provider_id) REFERENCES bookings.provider (id) "
        "ON DELETE SET NULL NOT VALID"
    )
    # Every business that exists now was made before listing approval existed: approve
    # it, with no approver (the column stays null for this backfill). UTC, naive, as the
    # rest of the domain stores times.
    op.execute(
        "UPDATE bookings.profile "
        "SET listing_approved_at = (now() AT TIME ZONE 'UTC') "
        "WHERE listing_approved_at IS NULL"
    )


def downgrade() -> None:
    op.drop_constraint(
        OWNER_PROVIDER_FK, "profile", schema="bookings", type_="foreignkey"
    )
    op.drop_constraint(APPROVED_BY_FK, "profile", schema="bookings", type_="foreignkey")
    op.drop_column("profile", "owner_provider_id", schema="bookings")
    op.drop_column("profile", "owner_left_at", schema="bookings")
    op.drop_column("profile", "listing_approved_by_user_id", schema="bookings")
    op.drop_column("profile", "listing_approved_at", schema="bookings")
