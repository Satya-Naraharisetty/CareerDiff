"""Add question_archetype and code_sample to interview_turns table

Revision ID: 0009_add_archetype
Revises: 0008_add_comm_score
Create Date: 2026-11-12 09:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0009_add_archetype"
down_revision: str | None = "0008_add_comm_score"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "interview_turns",
        sa.Column("question_archetype", sa.String(50), nullable=True),
    )
    op.add_column(
        "interview_turns",
        sa.Column("code_sample", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("interview_turns", "code_sample")
    op.drop_column("interview_turns", "question_archetype")
