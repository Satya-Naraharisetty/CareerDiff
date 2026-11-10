"""Create role intelligence, rubrics, interviews, and blueprints tables

Revision ID: 0003_role_blueprints
Revises: 0002_identity_and_resumes
Create Date: 2026-11-10 01:38:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0003_role_blueprints"
down_revision: str | None = "0002_identity_and_resumes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. job_roles table
    op.create_table(
        "job_roles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_job_roles_slug", "job_roles", ["slug"], unique=True)

    # 2. competencies table
    op.create_table(
        "competencies",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("role_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("display_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["role_id"], ["job_roles.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_competencies_role_id", "competencies", ["role_id"], unique=False)

    # 3. rubrics table
    op.create_table(
        "rubrics",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("competency_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["competency_id"], ["competencies.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("competency_id", "version", name="uq_rubric_competency_version"),
    )
    op.create_index("ix_rubrics_competency_id", "rubrics", ["competency_id"], unique=False)

    # 4. rubric_criteria table
    op.create_table(
        "rubric_criteria",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("rubric_id", sa.Uuid(), nullable=False),
        sa.Column("tier_level", sa.Integer(), nullable=False),
        sa.Column("tier_name", sa.String(length=30), nullable=False),
        sa.Column("observable_criteria", sa.Text(), nullable=False),
        sa.Column("sample_answer_gist", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["rubric_id"], ["rubrics.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("rubric_id", "tier_level", name="uq_rubric_tier"),
    )
    op.create_index("ix_rubric_criteria_rubric_id", "rubric_criteria", ["rubric_id"], unique=False)

    # 5. interviews table
    op.create_table(
        "interviews",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("candidate_profile_id", sa.Uuid(), nullable=False),
        sa.Column("role_id", sa.Uuid(), nullable=False),
        sa.Column(
            "target_seniority",
            sa.String(length=20),
            server_default="SENIOR",
            nullable=False,
        ),
        sa.Column("state", sa.String(length=30), server_default="CREATED", nullable=False),
        sa.Column("mode", sa.String(length=20), server_default="VOICE", nullable=False),
        sa.Column(
            "scheduled_duration_minutes",
            sa.Integer(),
            server_default="30",
            nullable=False,
        ),
        sa.Column("actual_duration_seconds", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "session_policy",
            sa.JSON(),
            server_default=sa.text("'{}'::json"),
            nullable=False,
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["candidate_profile_id"],
            ["candidate_profiles.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["role_id"], ["job_roles.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_interviews_candidate_profile_id",
        "interviews",
        ["candidate_profile_id"],
        unique=False,
    )
    op.create_index("ix_interviews_role_id", "interviews", ["role_id"], unique=False)

    # 6. interview_blueprints table
    op.create_table(
        "interview_blueprints",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("interview_id", sa.Uuid(), nullable=False),
        sa.Column("total_topics", sa.Integer(), nullable=False),
        sa.Column("total_allocated_seconds", sa.Integer(), nullable=False),
        sa.Column("warmup_seconds", sa.Integer(), server_default="120", nullable=False),
        sa.Column("conclusion_seconds", sa.Integer(), server_default="180", nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["interview_id"], ["interviews.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("interview_id"),
    )

    # 7. blueprint_topics table
    op.create_table(
        "blueprint_topics",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("blueprint_id", sa.Uuid(), nullable=False),
        sa.Column("competency_id", sa.Uuid(), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False),
        sa.Column("topic_name", sa.String(length=100), nullable=False),
        sa.Column("allocated_seconds", sa.Integer(), nullable=False),
        sa.Column(
            "mapped_claim_ids",
            sa.JSON(),
            server_default=sa.text("'[]'::json"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["blueprint_id"],
            ["interview_blueprints.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["competency_id"], ["competencies.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_blueprint_topics_blueprint_id",
        "blueprint_topics",
        ["blueprint_id"],
        unique=False,
    )
    op.create_index(
        "ix_blueprint_topics_competency_id",
        "blueprint_topics",
        ["competency_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_blueprint_topics_competency_id", table_name="blueprint_topics")
    op.drop_index("ix_blueprint_topics_blueprint_id", table_name="blueprint_topics")
    op.drop_table("blueprint_topics")
    op.drop_table("interview_blueprints")
    op.drop_index("ix_interviews_role_id", table_name="interviews")
    op.drop_index("ix_interviews_candidate_profile_id", table_name="interviews")
    op.drop_table("interviews")
    op.drop_index("ix_rubric_criteria_rubric_id", table_name="rubric_criteria")
    op.drop_table("rubric_criteria")
    op.drop_index("ix_rubrics_competency_id", table_name="rubrics")
    op.drop_table("rubrics")
    op.drop_index("ix_competencies_role_id", table_name="competencies")
    op.drop_table("competencies")
    op.drop_index("ix_job_roles_slug", table_name="job_roles")
    op.drop_table("job_roles")
