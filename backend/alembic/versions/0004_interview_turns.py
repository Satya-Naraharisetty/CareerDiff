"""Create interview_turns table for turn persistence

Revision ID: 0004_interview_turns
Revises: 0003_role_blueprints
Create Date: 2026-11-10 01:54:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0004_interview_turns"
down_revision: str | None = "0003_role_blueprints"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "interview_turns",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("interview_id", sa.Uuid(), nullable=False),
        sa.Column("turn_index", sa.Integer(), nullable=False),
        sa.Column("speaker", sa.String(length=20), nullable=False),
        sa.Column("transcript", sa.Text(), nullable=False),
        sa.Column("action_taken", sa.String(length=30), nullable=True),
        sa.Column("interrupted", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("audio_duration_ms", sa.Integer(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["interview_id"], ["interviews.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("interview_id", "turn_index", name="uq_turn_sequence"),
    )
    op.create_index(
        "idx_turns_interview",
        "interview_turns",
        ["interview_id", "turn_index"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("idx_turns_interview", table_name="interview_turns")
    op.drop_table("interview_turns")
