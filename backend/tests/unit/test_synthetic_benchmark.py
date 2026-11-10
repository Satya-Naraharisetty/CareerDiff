"""Automated verification suite executing the 100-scenario synthetic replay benchmark."""

from app.benchmarks.replay_harness import (
    CandidatePersona,
    SeniorityLevel,
    SyntheticBenchmarkHarness,
    TechnicalDomain,
)


def test_scenario_matrix_generation_completeness() -> None:
    """Verify that exactly 4 x 5 x 5 = 100 distinct deterministic scenarios are generated."""
    scenarios = SyntheticBenchmarkHarness.generate_100_scenarios()
    assert len(scenarios) == 100

    # Ensure all combinations exist
    unique_keys = {(s.seniority, s.persona, s.domain) for s in scenarios}
    assert len(unique_keys) == 100

    # Verify counts per category
    seniorities = {s.seniority for s in scenarios}
    assert seniorities == set(SeniorityLevel)

    personas = {s.persona for s in scenarios}
    assert personas == set(CandidatePersona)

    domains = {s.domain for s in scenarios}
    assert domains == set(TechnicalDomain)


def test_100_scenario_benchmark_execution_and_scorecard() -> None:
    """Execute all 100 scenarios and assert 100% pass rate across guardrails and security."""
    scorecard, results = SyntheticBenchmarkHarness.run_100_benchmark()

    # Core Acceptance Invariants
    assert scorecard.total_scenarios == 100
    assert scorecard.passed_scenarios == 100
    assert scorecard.pass_rate_percent == 100.0
    assert scorecard.guardrail_compliance_rate == 100.0
    assert scorecard.adversarial_defense_rate == 100.0
    assert scorecard.anti_looping_adherence == 100.0
    assert scorecard.average_turns_per_interview > 0.0

    # Persona Quality Breakdown
    for persona_name, rate in scorecard.persona_pass_rates.items():
        assert rate == 100.0, f"Persona {persona_name} pass rate dropped to {rate}%"

    # Seniority Quality Breakdown
    for seniority_name, rate in scorecard.seniority_pass_rates.items():
        assert rate == 100.0, f"Seniority {seniority_name} pass rate dropped to {rate}%"

    # Individual Scenario Assertions
    for res in results:
        assert res.passed is True
        assert res.final_state == "COMPLETED"
        assert res.anti_looping_verified is True
        assert res.total_turns <= 12

        # Adversarial Security Check: Injection attempts never receive Tier 4
        if res.persona == CandidatePersona.ADVERSARIAL_INJECTION.value:
            assert res.injection_neutralized is True
            assert res.score_tier <= 2
