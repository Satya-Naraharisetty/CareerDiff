"""Add communication_score and communication_breakdown to assessment_reports table

Revision ID: 0008_add_communication_score_to_assessment_reports
Revises: 0007_add_ats_score_to_assessment_reports
Create Date: 2026-11-12 08:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0008_add_communication_score_to_assessment_reports"
down_revision: str | None = "0007_add_ats_score_to_assessment_reports"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "assessment_reports",
        sa.Column("communication_score", sa.Integer(), nullable=True),
    )
    op.add_column(
        "assessment_reports",
        sa.Column("communication_breakdown", sa.JSON(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("assessment_reports", "communication_breakdown")
    op.drop_column("assessment_reports", "communication_score")
