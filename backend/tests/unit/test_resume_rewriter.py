"""Unit tests for Resume Rewriter, ATS Scoring First, and Overleaf LaTeX Generation."""

from app.services.resume_rewriter import (
    escape_latex,
    parse_raw_resume_to_profile,
    rewrite_resume_for_jd,
)


def test_latex_escaping() -> None:
    """Verify that all special LaTeX characters are properly escaped."""
    raw = r"C++ & Python: 100% test_func {with $50 #1} ~10^2 \special"
    escaped = escape_latex(raw)
    assert r"\&" in escaped
    assert r"\%" in escaped
    assert r"\$" in escaped
    assert r"\#" in escaped
    assert r"\_" in escaped
    assert r"\{" in escaped
    assert r"\}" in escaped
    assert r"\textasciitilde{}" in escaped
    assert r"\textasciicircum{}" in escaped
    assert r"\textbackslash{}" in escaped


def test_resume_profile_parsing() -> None:
    """Verify parsing raw candidate text into structured sections."""
    sample = """Alex Rivera
alex@example.com | (555) 019-2834 | linkedin.com/in/alex | github.com/alex

EXPERIENCE
Senior Backend Engineer | FinTech Corp (2021 - Present)
• Built Kafka pipeline processing 50k events/sec
• Scaled PostgreSQL database using custom indexing

EDUCATION
University of Washington | B.S. in Computer Science (2016 - 2020)

TECHNICAL SKILLS
Languages: Python, Go, TypeScript
Frameworks: FastAPI, Docker, React
Developer Tools: Git, Kubernetes, Linux
Databases & Cloud: PostgreSQL, Redis, Kafka
"""
    profile = parse_raw_resume_to_profile(sample)
    assert profile.full_name == "Alex Rivera"
    assert profile.contact_email == "alex@example.com"
    assert len(profile.experiences) >= 1
    assert "FinTech Corp" in profile.experiences[0].company
    assert len(profile.education) >= 1
    assert "Python" in profile.skills_by_category["Languages"]


def test_ats_score_computed_first_and_suggestions_generated() -> None:
    """Verify that rewrite_resume_for_jd computes ATS score first and provides grounded suggestions."""
    resume = """Alex Rivera
Senior Distributed Systems Engineer
alex@example.com

EXPERIENCE
Senior Software Engineer | StreamTech (2021 - Present)
• Built pipeline processing events with sub-25ms latency
• Handled PostgreSQL database and microservices architecture
"""
    jd = """Role: Senior Distributed Systems Architect
Requirements:
• Experience with Apache Kafka, event-driven architecture, and Redis
• Proven expertise with PostgreSQL, distributed microservices, and idempotency
• Deep knowledge of sub-50ms P99 latency bounds
"""
    response = rewrite_resume_for_jd(
        resume_text=resume,
        jd_text=jd,
        candidate_seniority="SENIOR",
    )

    # 1. Verify score is computed first
    assert 0 <= response.ats_score <= 100
    assert "keyword_score" in response.ats_breakdown
    assert response.alignment_summary != ""

    # 2. Verify suggestions
    assert len(response.suggestions) > 0
    for sugg in response.suggestions:
        assert sugg.section in ["summary", "experience", "projects", "skills"]
        assert sugg.original_text != ""
        assert sugg.rewritten_text != ""
        assert sugg.rationale != ""
        # 3. Verify fact preservation invariant
        assert sugg.fact_preserved is True

    # 4. Verify LaTeX source is complete and Overleaf ready
    assert r"\documentclass[letterpaper,11pt]{article}" in response.latex_source
    assert r"\begin{document}" in response.latex_source
    assert r"\end{document}" in response.latex_source
    assert "StreamTech" in response.latex_source


def test_fact_preservation_does_not_fabricate_unrelated_companies() -> None:
    """Verify that existing companies, titles, and metrics are preserved."""
    resume = """Jane Doe
Software Engineer | AlphaCorp (2020 - 2023)
• Built internal API for order processing handling 10k requests/day
"""
    jd = """Role: Staff Engineer at BetaCorp
Requirements:
• 8+ years building high frequency trading platforms
"""
    response = rewrite_resume_for_jd(resume_text=resume, jd_text=jd, candidate_seniority="STAFF")

    # The rewritten resume MUST still reference AlphaCorp, NOT BetaCorp as candidate's past employer!
    exp_companies = [e.company for e in response.rewritten_profile.experiences]
    assert any("AlphaCorp" in c for c in exp_companies)
    assert not any("BetaCorp" in c for c in exp_companies)
