"""cap feed insecure_since

Revision ID: capfeedinsecure20261103
Revises: payrollpayslips20261031
Create Date: 2026-11-03

Additive: a nullable ``cap.feed_import.insecure_since``. New CAP feeds must use https
on port 443. A feed saved earlier on plain http keeps working for 14 days after it is
first flagged, then it is no longer fetched. This column holds the first-flag time.
Existing plain-http feeds are flagged now, so their grace starts with this release
even when they are paused or the worker has not polled them yet. https feeds stay
NULL. Downgrade drops the column.
"""

import sqlalchemy as sa

from alembic import op

revision = "capfeedinsecure20261103"
down_revision = "payrollpayslips20261031"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "feed_import",
        sa.Column("insecure_since", sa.DateTime(), nullable=True),
        schema="cap",
    )
    # Same reading as the fetch (Python urlsplit): leading control characters and
    # spaces are ignored, tabs and newlines inside the URL are dropped, and the scheme
    # is case-insensitive.
    op.execute(
        r"""UPDATE cap.feed_import SET insecure_since = (now() AT TIME ZONE 'utc')
        WHERE regexp_replace(url, '[\t\r\n]', '', 'g') ~* '^[\x01-\x20]*http://'"""
    )


def downgrade() -> None:
    op.drop_column("feed_import", "insecure_since", schema="cap")
