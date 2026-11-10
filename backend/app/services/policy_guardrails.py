"""Deterministic policy guardrails enforcing session bounds and probe limits."""

from app.schemas.adaptive import EngineAction, SessionPolicy
from app.services.interview_state_machine import InterviewStateMachine


class PolicyGuardrailResult:
    """Outcome of guardrail evaluation with explanation of overrides."""

    def __init__(
        self,
        approved_action: EngineAction,
        is_overridden: bool = False,
        override_reason: str | None = None,
    ) -> None:
        self.approved_action = approved_action
        self.is_overridden = is_overridden
        self.override_reason = override_reason


class PolicyGuardrails:
    """Enforces deterministic constraints and session policies over proposed actions."""

    @staticmethod
    def evaluate(
        proposed_action: EngineAction,
        fsm: InterviewStateMachine,
        policy: SessionPolicy,
        total_topics: int,
        topic_allocated_seconds: int | None = None,
    ) -> PolicyGuardrailResult:
        """Evaluate a proposed action against active session policies and system invariants."""
        remaining_seconds = policy.max_duration_seconds - fsm.actual_duration_seconds

        # 1. Hard Time / Conclusion Buffer Guardrail
        # If remaining time is within the conclusion buffer, we must wrap up.
        if remaining_seconds <= policy.conclusion_buffer_seconds:
            if proposed_action != EngineAction.CONCLUDE:
                return PolicyGuardrailResult(
                    approved_action=EngineAction.CONCLUDE,
                    is_overridden=True,
                    override_reason=(
                        f"Session entered conclusion buffer ({remaining_seconds}s remaining "
                        f"<= buffer {policy.conclusion_buffer_seconds}s)."
                    ),
                )
            return PolicyGuardrailResult(approved_action=EngineAction.CONCLUDE)

        # 2. Topic Budget Saturation Guardrail
        # If the candidate has spent all allocated seconds for the current topic, advance topic.
        if (
            topic_allocated_seconds is not None
            and fsm.topic_elapsed_seconds >= topic_allocated_seconds
            and proposed_action not in {EngineAction.CHANGE_TOPIC, EngineAction.CONCLUDE}
        ):
            if fsm.current_topic_index + 1 >= total_topics:
                return PolicyGuardrailResult(
                    approved_action=EngineAction.CONCLUDE,
                    is_overridden=True,
                    override_reason="Topic budget expired and all blueprint topics completed.",
                )
            return PolicyGuardrailResult(
                approved_action=EngineAction.CHANGE_TOPIC,
                is_overridden=True,
                override_reason=(
                    f"Topic time budget expired ({fsm.topic_elapsed_seconds}s "
                    f">= {topic_allocated_seconds}s)."
                ),
            )

        # 3. Probe Saturation Guardrail
        # If consecutive probes on this topic reached limit, override PROBE_DEEPER
        if fsm.consecutive_probes >= policy.max_consecutive_probes:
            if proposed_action == EngineAction.PROBE_DEEPER:
                if fsm.current_topic_index + 1 >= total_topics:
                    return PolicyGuardrailResult(
                        approved_action=EngineAction.CONCLUDE,
                        is_overridden=True,
                        override_reason=(
                            f"Probe limit reached ({fsm.consecutive_probes} probes) "
                            "and all topics covered."
                        ),
                    )
                return PolicyGuardrailResult(
                    approved_action=EngineAction.CHANGE_TOPIC,
                    is_overridden=True,
                    override_reason=(
                        f"Exceeded max consecutive probes ({fsm.consecutive_probes} "
                        f">= {policy.max_consecutive_probes}). Forced topic transition."
                    ),
                )

        # 4. Premature Conclude Rejection
        # If trying to conclude before meeting minimum coverage ratio, reject and change topic.
        if proposed_action == EngineAction.CONCLUDE:
            covered_count = len(fsm.covered_topic_indices)
            coverage_ratio = (covered_count / total_topics) if total_topics > 0 else 1.0
            if (
                coverage_ratio < policy.minimum_coverage_ratio
                and remaining_seconds > policy.conclusion_buffer_seconds
                and fsm.current_topic_index + 1 < total_topics
            ):
                return PolicyGuardrailResult(
                    approved_action=EngineAction.CHANGE_TOPIC,
                    is_overridden=True,
                    override_reason=(
                        f"Coverage ratio ({coverage_ratio:.2f}) below minimum target "
                        f"({policy.minimum_coverage_ratio:.2f}) with sufficient time remaining. "
                        "Forced topic advance."
                    ),
                )

        # 5. Topic Exhaustion on CHANGE_TOPIC
        if proposed_action == EngineAction.CHANGE_TOPIC:
            if fsm.current_topic_index + 1 >= total_topics:
                return PolicyGuardrailResult(
                    approved_action=EngineAction.CONCLUDE,
                    is_overridden=True,
                    override_reason="All blueprint topics exhausted. Transitioned to conclusion.",
                )

        # Action is valid and passes all policy invariants
        return PolicyGuardrailResult(approved_action=proposed_action)
