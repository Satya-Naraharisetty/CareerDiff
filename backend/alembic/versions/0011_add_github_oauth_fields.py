"""Add GitHub OAuth fields to users table

Revision ID: 0011_github_oauth
Revises: 0010_oauth_fields
Create Date: 2026-11-21 19:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0011_github_oauth"
down_revision: str | None = "0010_oauth_fields"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Add github_id column and unique index
    op.add_column(
        "users",
        sa.Column("github_id", sa.String(255), nullable=True),
    )
    op.create_index(
        "ix_users_github_id",
        "users",
        ["github_id"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_users_github_id", table_name="users")
    op.drop_column("users", "github_id")
