"""Deterministic finite state machine governing interview progression and invariants."""

from app.schemas.adaptive import EngineAction, InterviewState


class InvalidStateTransitionError(ValueError):
    """Raised when attempting an illegal transition between interview states."""

    pass


class InterviewStateMachine:
    """Manages interview lifecycle states, topic progression, and probe counts."""

    # Explicit allowed state transition map
    _ALLOWED_TRANSITIONS: dict[InterviewState, set[InterviewState]] = {
        InterviewState.CREATED: {InterviewState.WARMUP, InterviewState.ABORTED},
        InterviewState.WARMUP: {
            InterviewState.TECHNICAL_CORE,
            InterviewState.PAUSED,
            InterviewState.ABORTED,
        },
        InterviewState.TECHNICAL_CORE: {
            InterviewState.TECHNICAL_CORE,
            InterviewState.CONCLUDING,
            InterviewState.PAUSED,
            InterviewState.ABORTED,
        },
        InterviewState.CONCLUDING: {
            InterviewState.COMPLETED,
            InterviewState.ABORTED,
        },
        InterviewState.PAUSED: {
            InterviewState.WARMUP,
            InterviewState.TECHNICAL_CORE,
            InterviewState.CONCLUDING,
            InterviewState.ABORTED,
        },
        InterviewState.COMPLETED: set(),
        InterviewState.ABORTED: set(),
    }

    def __init__(
        self,
        initial_state: InterviewState = InterviewState.CREATED,
        current_topic_index: int = 0,
        consecutive_probes: int = 0,
        topic_elapsed_seconds: int = 0,
        actual_duration_seconds: int = 0,
    ) -> None:
        self.state = initial_state
        self.current_topic_index = current_topic_index
        self.consecutive_probes = consecutive_probes
        self.topic_elapsed_seconds = topic_elapsed_seconds
        self.actual_duration_seconds = actual_duration_seconds
        self.covered_topic_indices: set[int] = set()
        if self.current_topic_index > 0:
            self.covered_topic_indices.update(range(self.current_topic_index))

    def transition(self, target: InterviewState) -> None:
        """Advance to target state if legal, else raise InvalidStateTransitionError."""
        if target == self.state:
            return

        allowed = self._ALLOWED_TRANSITIONS.get(self.state, set())
        if target not in allowed:
            raise InvalidStateTransitionError(
                f"Illegal state transition from {self.state} to {target}. "
                f"Allowed destinations: {[s.value for s in allowed]}"
            )
        self.state = target

    def record_action(self, action: EngineAction) -> None:
        """Update consecutive probe counter based on executed action."""
        if action == EngineAction.PROBE_DEEPER:
            self.consecutive_probes += 1
        else:
            self.consecutive_probes = 0

    def advance_topic(self, total_topics: int) -> bool:
        """Advance to the next blueprint topic. Returns False if all topics are exhausted."""
        self.covered_topic_indices.add(self.current_topic_index)
        self.consecutive_probes = 0
        self.topic_elapsed_seconds = 0
        self.current_topic_index += 1

        if self.current_topic_index >= total_topics:
            return False
        return True

    def add_elapsed_time(self, seconds: int) -> None:
        """Increment elapsed time trackers for the interview and current topic."""
        if seconds > 0:
            self.actual_duration_seconds += seconds
            self.topic_elapsed_seconds += seconds

    @property
    def is_terminal(self) -> bool:
        """Return True if session has reached a final state."""
        return self.state in {InterviewState.COMPLETED, InterviewState.ABORTED}
