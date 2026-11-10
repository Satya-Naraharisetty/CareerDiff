"""Add hashed_backup_codes to users table

Revision ID: 0006_add_user_backup_codes
Revises: 0005_evaluation_and_reports
Create Date: 2026-11-10 16:40:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0006_add_user_backup_codes"
down_revision: str | None = "0005_evaluation_and_reports"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "hashed_backup_codes",
            sa.JSON(),
            server_default=sa.text("'[]'::json"),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("users", "hashed_backup_codes")
