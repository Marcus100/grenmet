"""auth sign-in setup reason sensitive

Revision ID: authsigninreason20261104
Revises: capfeedinsecure20261103
Create Date: 2026-11-04

Data only, no schema change. Audit rows written before commit 1b05c005d (#984) stored
the administrator's sign-in setup reason with ``sensitive`` false, so the account
holder could read it in clear through the account history. This flags the ``reason``
change of every ``sign_in_setup`` row as sensitive, as new rows are. Readers without
``audit.view_sensitive`` then see it masked; superusers still see the text.

Nothing is deleted and no value is changed: only the ``sensitive`` key of the
``reason`` element is set to true, and the other elements keep their order. Rows
that are already sensitive, or have no ``reason`` element, are not touched, so a
re-run changes nothing (idempotent).

Downgrade is a no-op on purpose. Clearing the flag again would expose the reasons
to account holders, which is the harm this migration removes.
"""

from alembic import op

revision = "authsigninreason20261104"
down_revision = "capfeedinsecure20261103"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE audit_entry AS a
        SET changes = (
            SELECT json_agg(
                CASE
                    WHEN c.item->>'field' = 'reason'
                    THEN jsonb_set(c.item::jsonb, '{sensitive}', 'true'::jsonb)::json
                    ELSE c.item
                END
                ORDER BY c.ord
            )
            FROM json_array_elements(a.changes) WITH ORDINALITY AS c(item, ord)
        )
        WHERE a.record_type = 'sign_in_setup'
          AND CASE
                WHEN json_typeof(a.changes) = 'array' THEN EXISTS (
                    SELECT 1
                    FROM json_array_elements(a.changes) AS e(item)
                    WHERE e.item->>'field' = 'reason'
                      AND COALESCE((e.item->>'sensitive')::boolean, false) = false
                )
                ELSE false
              END
        """
    )


def downgrade() -> None:
    # Intentionally a no-op: see the module docstring.
    pass
