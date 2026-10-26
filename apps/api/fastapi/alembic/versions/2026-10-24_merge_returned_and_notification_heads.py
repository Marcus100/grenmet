"""Merge the HR Returned status and the notification bell and groups migrations.

Two branches added a migration after the same parent, so the chain had two heads.
This revision joins them; it changes no schema.

Revision ID: mergereturnednotif20261024
Revises: hrreturned20261023, notifbellgroup20261023
"""

revision = "mergereturnednotif20261024"
down_revision = ("hrreturned20261023", "notifbellgroup20261023")
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Nothing to change: this revision only joins the two branches."""


def downgrade() -> None:
    """Nothing to undo: this revision only joins the two branches."""
