"""Profile photos go with the account (#1303).

``user_image.user_id`` referenced ``user.id`` with no delete rule, so deleting an
account that had a photo would fail. The key is replaced with one that cascades.
It is added ``NOT VALID`` and validated separately, so the short exclusive lock
is not held while existing rows are checked.

Revision ID: profileimage20261113
Revises: indexnames20261113
"""

from alembic import op

revision = "profileimage20261113"
down_revision = "indexnames20261113"
branch_labels = None
depends_on = None

CONSTRAINT = "user_image_user_id_fkey"


def _replace(on_delete: str) -> None:
    # migration-safety: swaps the one foreign key on user_image (one row per user).
    op.execute(f'ALTER TABLE "user_image" DROP CONSTRAINT IF EXISTS "{CONSTRAINT}"')
    op.execute(
        f'ALTER TABLE "user_image" ADD CONSTRAINT "{CONSTRAINT}" '
        f'FOREIGN KEY ("user_id") REFERENCES "user" ("id"){on_delete} NOT VALID'
    )
    op.execute(f'ALTER TABLE "user_image" VALIDATE CONSTRAINT "{CONSTRAINT}"')


def upgrade() -> None:
    _replace(" ON DELETE CASCADE")


def downgrade() -> None:
    _replace("")
