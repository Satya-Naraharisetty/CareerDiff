"""Create assessment reports, scores, evidence, outbox, and worker execution tables

Revision ID: 0005_evaluation_and_reports
Revises: 0004_interview_turns
Create Date: 2026-11-10 12:35:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "0005_evaluation_and_reports"
down_revision: str | None = "0004_interview_turns"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. assessment_reports
    op.create_table(
        "assessment_reports",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("interview_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("is_latest", sa.Boolean(), server_default=sa.text("true"), nullable=False),
        sa.Column("prompt_version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("rubric_version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column(
            "model_used",
            sa.String(length=100),
            server_default=sa.text("'gemini-2.5-pro'"),
            nullable=False,
        ),
        sa.Column("overall_score", sa.Float(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("strengths", sa.JSON(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column("knowledge_gaps", sa.JSON(), server_default=sa.text("'[]'"), nullable=False),
        sa.Column(
            "study_recommendations",
            sa.JSON(),
            server_default=sa.text("'[]'"),
            nullable=False,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["interview_id"], ["interviews.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("interview_id", "version", name="uq_interview_report_version"),
    )
    op.create_index(
        "idx_reports_interview",
        "assessment_reports",
        ["interview_id"],
        unique=False,
    )
    op.create_index(
        "uq_reports_latest",
        "assessment_reports",
        ["interview_id"],
        unique=True,
        postgresql_where=sa.text("is_latest = TRUE"),
    )

    # 2. competency_scores
    op.create_table(
        "competency_scores",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("assessment_report_id", sa.Uuid(), nullable=False),
        sa.Column("competency_id", sa.Uuid(), nullable=False),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column("confidence", sa.Float(), server_default=sa.text("1.0"), nullable=False),
        sa.ForeignKeyConstraint(
            ["assessment_report_id"],
            ["assessment_reports.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["competency_id"], ["competencies.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "assessment_report_id",
            "competency_id",
            name="uq_report_competency",
        ),
        sa.CheckConstraint(
            "(status = 'INSUFFICIENT_EVIDENCE' AND score IS NULL) OR "
            "(status = 'EVALUATED' AND score BETWEEN 1 AND 4)",
            name="chk_score_status_semantics",
        ),
    )
    op.create_index(
        "idx_comp_scores_report",
        "competency_scores",
        ["assessment_report_id"],
        unique=False,
    )
    op.create_index(
        "idx_comp_scores_competency",
        "competency_scores",
        ["competency_id"],
        unique=False,
    )

    # 3. evaluation_evidence
    op.create_table(
        "evaluation_evidence",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("competency_score_id", sa.Uuid(), nullable=False),
        sa.Column("interview_turn_id", sa.Uuid(), nullable=False),
        sa.Column("evidence_type", sa.String(length=30), nullable=False),
        sa.Column("assessment_impact", sa.String(length=30), nullable=False),
        sa.Column("transcript_excerpt", sa.Text(), nullable=False),
        sa.Column("start_char_offset", sa.Integer(), nullable=False),
        sa.Column("end_char_offset", sa.Integer(), nullable=False),
        sa.Column("evaluation_version", sa.Integer(), server_default=sa.text("1"), nullable=False),
        sa.Column("confidence", sa.Float(), server_default=sa.text("1.0"), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["competency_score_id"],
            ["competency_scores.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["interview_turn_id"],
            ["interview_turns.id"],
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "end_char_offset >= start_char_offset",
            name="chk_evidence_offsets",
        ),
    )
    op.create_index(
        "idx_eval_evidence_score",
        "evaluation_evidence",
        ["competency_score_id"],
        unique=False,
    )
    op.create_index(
        "idx_eval_evidence_turn",
        "evaluation_evidence",
        ["interview_turn_id"],
        unique=False,
    )

    # 4. interview_claim_verifications
    op.create_table(
        "interview_claim_verifications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("interview_id", sa.Uuid(), nullable=False),
        sa.Column("resume_claim_id", sa.Uuid(), nullable=False),
        sa.Column("verified_turn_id", sa.Uuid(), nullable=True),
        sa.Column(
            "status",
            sa.String(length=30),
            server_default=sa.text("'UNTESTED'"),
            nullable=False,
        ),
        sa.Column("confidence", sa.Float(), server_default=sa.text("1.0"), nullable=False),
        sa.Column("auditor_notes", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["interview_id"], ["interviews.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["resume_claim_id"], ["resume_claims.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["verified_turn_id"], ["interview_turns.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("interview_id", "resume_claim_id", name="uq_interview_claim"),
    )
    op.create_index(
        "idx_claim_verif_interview",
        "interview_claim_verifications",
        ["interview_id"],
        unique=False,
    )
    op.create_index(
        "idx_claim_verif_claim",
        "interview_claim_verifications",
        ["resume_claim_id"],
        unique=False,
    )

    # 5. outbox_events
    op.create_table(
        "outbox_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("event_type", sa.String(length=100), nullable=False),
        sa.Column("aggregate_type", sa.String(length=50), nullable=False),
        sa.Column("aggregate_id", sa.Uuid(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            server_default=sa.text("'PENDING'"),
            nullable=False,
        ),
        sa.Column("retry_count", sa.Integer(), server_default=sa.text("0"), nullable=False),
        sa.Column("claimed_by", sa.String(length=100), nullable=True),
        sa.Column("claimed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("claim_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "idx_outbox_aggregate",
        "outbox_events",
        ["aggregate_id"],
        unique=False,
    )
    op.create_index(
        "idx_outbox_claimable",
        "outbox_events",
        ["created_at"],
        unique=False,
        postgresql_where=sa.text("status IN ('PENDING', 'CLAIMED')"),
    )

    # 6. worker_executions
    op.create_table(
        "worker_executions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("task_name", sa.String(length=100), nullable=False),
        sa.Column("idempotency_key", sa.String(length=255), nullable=False),
        sa.Column("aggregate_id", sa.Uuid(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=30),
            server_default=sa.text("'RUNNING'"),
            nullable=False,
        ),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result_reference", sa.String(length=255), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "task_name",
            "idempotency_key",
            name="uq_worker_task_idempotency",
        ),
    )
    op.create_index(
        "idx_worker_exec_aggregate",
        "worker_executions",
        ["aggregate_id"],
        unique=False,
    )
    op.create_index(
        "idx_worker_exec_running",
        "worker_executions",
        ["started_at"],
        unique=False,
        postgresql_where=sa.text("status = 'RUNNING'"),
    )


def downgrade() -> None:
    op.drop_index("idx_worker_exec_running", table_name="worker_executions")
    op.drop_index("idx_worker_exec_aggregate", table_name="worker_executions")
    op.drop_table("worker_executions")

    op.drop_index("idx_outbox_claimable", table_name="outbox_events")
    op.drop_index("idx_outbox_aggregate", table_name="outbox_events")
    op.drop_table("outbox_events")

    op.drop_index("idx_claim_verif_claim", table_name="interview_claim_verifications")
    op.drop_index("idx_claim_verif_interview", table_name="interview_claim_verifications")
    op.drop_table("interview_claim_verifications")

    op.drop_index("idx_eval_evidence_turn", table_name="evaluation_evidence")
    op.drop_index("idx_eval_evidence_score", table_name="evaluation_evidence")
    op.drop_table("evaluation_evidence")

    op.drop_index("idx_comp_scores_competency", table_name="competency_scores")
    op.drop_index("idx_comp_scores_report", table_name="competency_scores")
    op.drop_table("competency_scores")

    op.drop_index("uq_reports_latest", table_name="assessment_reports")
    op.drop_index("idx_reports_interview", table_name="assessment_reports")
    op.drop_table("assessment_reports")
