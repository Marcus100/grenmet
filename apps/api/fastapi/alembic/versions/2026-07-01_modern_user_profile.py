"""modern user profile: title, last_login, gender/parish enums, emergency contact

Revision ID: d3f5a7c9e1b4
Revises: b2d4f6a8c1e3
Create Date: 2026-07-01 09:00:00.000000

Profile modernisation:
- auth.user: add ``title`` (honorific enum) + ``last_login_at``
- hr.user_profile: drop redundant ``avatar_url`` (UserImage is canonical) and
  ``status`` (derived from ``user.is_active``); convert ``gender`` to an enum;
  convert ``created_by`` from free text to a uuid FK; add emergency-contact columns
- hr.user_address: convert ``parish`` to a Grenada-parish enum; default country "Grenada"

Note: ``gender`` and ``parish`` free-text values are not preserved (none exist in
practice — both were optional and unset). The enum types are created/dropped here.
"""

import sqlalchemy as sa
import sqlmodel

from alembic import op

revision = "d3f5a7c9e1b4"
down_revision = "b2d4f6a8c1e3"
branch_labels = None
depends_on = None


title_enum = sa.Enum("MR", "MRS", "MS", "MISS", "DR", name="title")
gender_enum = sa.Enum("MALE", "FEMALE", "OTHER", "UNSPECIFIED", name="gender")
parish_enum = sa.Enum(
    "SAINT_GEORGE",
    "SAINT_ANDREW",
    "SAINT_DAVID",
    "SAINT_JOHN",
    "SAINT_MARK",
    "SAINT_PATRICK",
    "CARRIACOU",
    "PETITE_MARTINIQUE",
    name="parish",
)


def upgrade() -> None:
    bind = op.get_bind()
    title_enum.create(bind, checkfirst=True)
    gender_enum.create(bind, checkfirst=True)
    parish_enum.create(bind, checkfirst=True)

    # --- auth.user ---------------------------------------------------------
    op.add_column("user", sa.Column("title", title_enum, nullable=True))
    op.add_column("user", sa.Column("last_login_at", sa.DateTime(), nullable=True))

    # --- hr.user_profile ---------------------------------------------------
    op.drop_column("user_profile", "avatar_url", schema="hr")
    op.drop_column("user_profile", "status", schema="hr")

    # gender: free text -> enum (drop + re-add; no values to preserve)
    op.drop_column("user_profile", "gender", schema="hr")
    op.add_column(
        "user_profile",
        sa.Column("gender", gender_enum, nullable=True),
        schema="hr",
    )

    # created_by: varchar(uuid string) -> native uuid + FK to user.id
    op.alter_column(
        "user_profile",
        "created_by",
        schema="hr",
        existing_type=sqlmodel.sql.sqltypes.AutoString(length=255),
        type_=sa.Uuid(),
        existing_nullable=True,
        postgresql_using="created_by::uuid",
    )
    op.create_foreign_key(
        "fk_hr_user_profile_created_by_user",
        "user_profile",
        "user",
        ["created_by"],
        ["id"],
        source_schema="hr",
        ondelete="SET NULL",
    )

    op.add_column(
        "user_profile",
        sa.Column(
            "emergency_contact_name",
            sqlmodel.sql.sqltypes.AutoString(length=255),
            nullable=True,
        ),
        schema="hr",
    )
    op.add_column(
        "user_profile",
        sa.Column(
            "emergency_contact_phone",
            sqlmodel.sql.sqltypes.AutoString(length=30),
            nullable=True,
        ),
        schema="hr",
    )
    op.add_column(
        "user_profile",
        sa.Column(
            "emergency_contact_relationship",
            sqlmodel.sql.sqltypes.AutoString(length=100),
            nullable=True,
        ),
        schema="hr",
    )

    # --- hr.user_address ---------------------------------------------------
    op.drop_column("user_address", "parish", schema="hr")
    op.add_column(
        "user_address",
        sa.Column("parish", parish_enum, nullable=True),
        schema="hr",
    )
    op.alter_column(
        "user_address",
        "country",
        schema="hr",
        existing_type=sqlmodel.sql.sqltypes.AutoString(length=100),
        existing_nullable=True,
        server_default="Grenada",
    )


def downgrade() -> None:
    # --- hr.user_address ---------------------------------------------------
    op.alter_column(
        "user_address",
        "country",
        schema="hr",
        existing_type=sqlmodel.sql.sqltypes.AutoString(length=100),
        existing_nullable=True,
        server_default=None,
    )
    op.drop_column("user_address", "parish", schema="hr")
    op.add_column(
        "user_address",
        sa.Column(
            "parish",
            sqlmodel.sql.sqltypes.AutoString(length=100),
            nullable=True,
        ),
        schema="hr",
    )

    # --- hr.user_profile ---------------------------------------------------
    op.drop_column("user_profile", "emergency_contact_relationship", schema="hr")
    op.drop_column("user_profile", "emergency_contact_phone", schema="hr")
    op.drop_column("user_profile", "emergency_contact_name", schema="hr")

    op.drop_constraint(
        "fk_hr_user_profile_created_by_user",
        "user_profile",
        schema="hr",
        type_="foreignkey",
    )
    op.alter_column(
        "user_profile",
        "created_by",
        schema="hr",
        existing_type=sa.Uuid(),
        type_=sqlmodel.sql.sqltypes.AutoString(length=255),
        existing_nullable=True,
        postgresql_using="created_by::text",
    )

    op.drop_column("user_profile", "gender", schema="hr")
    op.add_column(
        "user_profile",
        sa.Column(
            "gender",
            sqlmodel.sql.sqltypes.AutoString(length=50),
            nullable=True,
        ),
        schema="hr",
    )

    op.add_column(
        "user_profile",
        sa.Column(
            "status",
            sa.Enum("ACTIVE", "INACTIVE", name="userstatus"),
            nullable=False,
            server_default="ACTIVE",
        ),
        schema="hr",
    )
    op.alter_column("user_profile", "status", schema="hr", server_default=None)
    op.add_column(
        "user_profile",
        sa.Column(
            "avatar_url",
            sqlmodel.sql.sqltypes.AutoString(length=500),
            nullable=True,
        ),
        schema="hr",
    )

    # --- auth.user ---------------------------------------------------------
    op.drop_column("user", "last_login_at")
    op.drop_column("user", "title")

    bind = op.get_bind()
    parish_enum.drop(bind, checkfirst=True)
    gender_enum.drop(bind, checkfirst=True)
    title_enum.drop(bind, checkfirst=True)
