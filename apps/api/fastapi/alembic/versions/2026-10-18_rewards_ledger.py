"""Barrels ID rewards ledger (U2): programmes, append-only entries, review flags.

Additive: a new ``rewards`` schema. A trigger makes ``rewards.entry`` append-only:
no DELETE, and UPDATE may change only status/settled_at/settled_by_user_id and
never move a reversed entry back.

Revision ID: rewards20261018
Revises: juryduty20261018

"""

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision = "rewards20261018"
down_revision = "modelguide20261018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE SCHEMA IF NOT EXISTS rewards")
    op.create_table(
        "program",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("stamps_required", sa.Integer(), nullable=False),
        sa.Column("reward_description", sa.Text(), nullable=False),
        sa.Column("qualifying_source_type", sa.String(length=60), nullable=False),
        sa.Column("stamps_per_source", sa.Integer(), nullable=False),
        sa.Column("max_redemptions_per_account", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("kind IN ('stamp_card')", name=op.f("program_kind_check")),
        sa.CheckConstraint(
            "status IN ('active', 'paused')", name=op.f("program_status_check")
        ),
        sa.CheckConstraint(
            "max_redemptions_per_account IS NULL OR max_redemptions_per_account > 0",
            name=op.f("program_max_redemptions_check"),
        ),
        sa.CheckConstraint(
            "stamps_per_source > 0", name=op.f("program_stamps_per_source_check")
        ),
        sa.CheckConstraint(
            "stamps_required > 0", name=op.f("program_stamps_required_check")
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            ["org.organisation.id"],
            name=op.f("program_organisation_id_fkey"),
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("program_pkey")),
        schema="rewards",
    )
    op.create_index(
        op.f("rewards_program_organisation_id_idx"),
        "program",
        ["organisation_id"],
        unique=False,
        schema="rewards",
    )
    op.create_table(
        "review_flag",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column("reason", sa.String(length=20), nullable=False),
        sa.Column("detail", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("resolved_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.CheckConstraint(
            "reason IN ('velocity')", name=op.f("review_flag_reason_check")
        ),
        sa.ForeignKeyConstraint(
            ["account_id"], ["user.id"], name=op.f("review_flag_account_id_fkey")
        ),
        sa.ForeignKeyConstraint(
            ["resolved_by_user_id"],
            ["user.id"],
            name=op.f("review_flag_resolved_by_user_id_fkey"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("review_flag_pkey")),
        schema="rewards",
    )
    op.create_index(
        op.f("rewards_review_flag_account_id_idx"),
        "review_flag",
        ["account_id"],
        unique=False,
        schema="rewards",
    )
    op.create_index(
        "uq_rewards_flag_open",
        "review_flag",
        ["account_id", "reason"],
        unique=True,
        schema="rewards",
        postgresql_where=sa.text("resolved_at IS NULL"),
    )
    op.create_table(
        "entry",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("account_id", sa.Uuid(), nullable=False),
        sa.Column("organisation_id", sa.String(length=100), nullable=False),
        sa.Column("program_id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("transaction_ref", sa.String(length=160), nullable=False),
        sa.Column("source_type", sa.String(length=60), nullable=True),
        sa.Column("source_id", sa.String(length=120), nullable=True),
        sa.Column("reverses_entry_id", sa.Uuid(), nullable=True),
        sa.Column("redeem_code", sa.String(length=12), nullable=True),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("settled_at", sa.DateTime(), nullable=True),
        sa.Column("settled_by_user_id", sa.Uuid(), nullable=True),
        sa.CheckConstraint(
            "kind <> 'adjust' OR (reason IS NOT NULL AND created_by_user_id IS NOT NULL)",
            name=op.f("entry_adjust_needs_reason_check"),
        ),
        sa.CheckConstraint(
            "kind <> 'earn' OR amount > 0", name=op.f("entry_earn_positive_check")
        ),
        sa.CheckConstraint(
            "kind <> 'redeem' OR amount < 0", name=op.f("entry_redeem_negative_check")
        ),
        sa.CheckConstraint(
            "kind <> 'reverse' OR reverses_entry_id IS NOT NULL",
            name=op.f("entry_reverse_needs_target_check"),
        ),
        sa.CheckConstraint(
            "kind IN ('earn', 'redeem', 'reverse', 'adjust')",
            name=op.f("entry_kind_check"),
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'confirmed', 'reversed')",
            name=op.f("entry_status_check"),
        ),
        sa.CheckConstraint("amount <> 0", name=op.f("entry_amount_nonzero_check")),
        sa.ForeignKeyConstraint(
            ["account_id"], ["user.id"], name=op.f("entry_account_id_fkey")
        ),
        sa.ForeignKeyConstraint(
            ["created_by_user_id"],
            ["user.id"],
            name=op.f("entry_created_by_user_id_fkey"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["organisation_id"],
            ["org.organisation.id"],
            name=op.f("entry_organisation_id_fkey"),
        ),
        sa.ForeignKeyConstraint(
            ["program_id"], ["rewards.program.id"], name=op.f("entry_program_id_fkey")
        ),
        sa.ForeignKeyConstraint(
            ["reverses_entry_id"],
            ["rewards.entry.id"],
            name=op.f("entry_reverses_entry_id_fkey"),
        ),
        sa.ForeignKeyConstraint(
            ["settled_by_user_id"],
            ["user.id"],
            name=op.f("entry_settled_by_user_id_fkey"),
            ondelete="SET NULL",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("entry_pkey")),
        sa.UniqueConstraint("redeem_code", name=op.f("entry_redeem_code_key")),
        sa.UniqueConstraint(
            "reverses_entry_id", name=op.f("entry_reverses_entry_id_key")
        ),
        sa.UniqueConstraint("transaction_ref", name=op.f("entry_transaction_ref_key")),
        schema="rewards",
    )
    op.create_index(
        "ix_rewards_entry_account_program",
        "entry",
        ["account_id", "program_id"],
        unique=False,
        schema="rewards",
    )
    op.create_index(
        "uq_rewards_entry_earn_source",
        "entry",
        ["program_id", "source_type", "source_id"],
        unique=True,
        schema="rewards",
        postgresql_where=sa.text("kind = 'earn' AND source_id IS NOT NULL"),
    )
    op.execute(
        """
        CREATE FUNCTION rewards.entry_is_append_only() RETURNS trigger AS $$
        BEGIN
          IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'rewards.entry is append-only';
          END IF;
          IF (to_jsonb(NEW) - 'status' - 'settled_at' - 'settled_by_user_id')
             IS DISTINCT FROM
             (to_jsonb(OLD) - 'status' - 'settled_at' - 'settled_by_user_id') THEN
            RAISE EXCEPTION 'rewards.entry is append-only';
          END IF;
          IF OLD.status = 'reversed' AND NEW.status <> 'reversed' THEN
            RAISE EXCEPTION 'a reversed rewards entry cannot be reopened';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
        CREATE TRIGGER entry_append_only
          BEFORE UPDATE OR DELETE ON rewards.entry
          FOR EACH ROW EXECUTE FUNCTION rewards.entry_is_append_only();
        """
    )


def downgrade() -> None:
    op.execute("DROP TRIGGER entry_append_only ON rewards.entry")
    op.execute("DROP FUNCTION rewards.entry_is_append_only()")
    op.drop_table("entry", schema="rewards")
    op.drop_table("review_flag", schema="rewards")
    op.drop_table("program", schema="rewards")
    op.execute("DROP SCHEMA rewards")
