"""Taskiq task definitions for asynchronous interview evaluation."""

import logging
import uuid

from app.core.database import async_session_factory
from app.services.evaluator import AssessmentEvaluator
from app.tasks.broker import broker

logger = logging.getLogger("intervuex.tasks")


@broker.task(task_name="evaluate_interview_task")
async def evaluate_interview_task(
    interview_id: str,
    idempotency_key: str | None = None,
) -> str:
    """Asynchronous background worker task compiling rubric evaluation and evidence dossier.

    ADR-004 Invariant: Accepts primitive serializable parameters and manages its own AsyncSession.
    """
    logger.info("Starting background evaluation for interview %s...", interview_id)
    async with async_session_factory() as db:
        report = await AssessmentEvaluator.evaluate_interview(
            db=db,
            interview_id=uuid.UUID(interview_id),
            idempotency_key=idempotency_key,
        )
        logger.info(
            "Evaluation task finished for interview %s. Report ID: %s",
            interview_id,
            report.id,
        )
        return str(report.id)
