"""Auth: a contact phone number on the user's own profile.

Additive: one nullable column, ``user.contact_phone`` (E.164). Not unique and
not indexed: it is a contact detail people type into their profile, never a
sign-in factor (that stays ``phone_e164``).

Revision ID: usercontactphone20261126
Revises: cases20261126
"""

import sqlalchemy as sa

from alembic import op

revision = "usercontactphone20261126"
down_revision = "cases20261126"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("user", sa.Column("contact_phone", sa.String(16), nullable=True))


def downgrade() -> None:
    op.drop_column("user", "contact_phone")
