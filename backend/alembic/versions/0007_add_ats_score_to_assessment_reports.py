"""Add ats_score and ats_breakdown to assessment_reports table

Revision ID: 0007_add_ats_score_to_assessment_reports
Revises: 0006_add_user_backup_codes
Create Date: 2026-11-11 22:15:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0007_add_ats_score_to_assessment_reports"
down_revision: str | None = "0006_add_user_backup_codes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "assessment_reports",
        sa.Column("ats_score", sa.Integer(), nullable=True),
    )
    op.add_column(
        "assessment_reports",
        sa.Column("ats_breakdown", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("assessment_reports", "ats_breakdown")
    op.drop_column("assessment_reports", "ats_score")
