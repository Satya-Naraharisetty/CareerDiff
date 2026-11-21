"""Add Google OAuth fields and nullable hashed_password to users table

Revision ID: 0010_oauth_fields
Revises: 0009_add_archetype
Create Date: 2026-11-21 14:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0010_oauth_fields"
down_revision: str | None = "0009_add_archetype"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Allow hashed_password to be nullable for OAuth-registered users
    op.alter_column(
        "users",
        "hashed_password",
        existing_type=sa.String(255),
        nullable=True,
    )

    # 2. Add auth_provider discriminator column
    op.add_column(
        "users",
        sa.Column(
            "auth_provider",
            sa.String(20),
            server_default="LOCAL",
            nullable=False,
        ),
    )

    # 3. Add google_id column and unique index
    op.add_column(
        "users",
        sa.Column("google_id", sa.String(255), nullable=True),
    )
    op.create_index(
        "ix_users_google_id",
        "users",
        ["google_id"],
        unique=True,
    )

    # 4. Add avatar_url column for candidate profile picture
    op.add_column(
        "users",
        sa.Column("avatar_url", sa.String(512), nullable=True),
    )


def downgrade() -> None:
    # Set placeholder for any OAuth users without passwords before enforcing NOT NULL
    op.execute(
        sa.text(
            "UPDATE users SET hashed_password = '$2b$12$e8YIq3YQf5.W3yP1N2Zwe.4X6m7g8h9j0k1l2m3n4o5p6q7r8s9t0' "
            "WHERE hashed_password IS NULL"
        )
    )
    op.drop_column("users", "avatar_url")
    op.drop_index("ix_users_google_id", table_name="users")
    op.drop_column("users", "google_id")
    op.drop_column("users", "auth_provider")
    op.alter_column(
        "users",
        "hashed_password",
        existing_type=sa.String(255),
        nullable=False,
    )
