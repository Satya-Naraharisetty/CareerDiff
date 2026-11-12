"""Unit tests for Resume Rewriter, Multi-Template Overleaf LaTeX, Page Fit, and Cover Letter Studio."""

from app.schemas.resume_rewriter import ExperienceItem, RewrittenResumeProfile
from app.services.resume_rewriter import (
    AVAILABLE_TEMPLATES,
    escape_latex,
    estimate_page_fit,
    generate_cover_letter,
    generate_latex_resume,
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

    # 5. Verify page fit estimate and cover letter
    assert response.page_fit.estimated_pages >= 1
    assert response.cover_letter_text != ""
    assert r"\begin{document}" in response.cover_letter_latex


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


def test_all_four_latex_templates() -> None:
    """Verify generation of all 4 supported Overleaf templates with unique styling hallmarks."""
    sample = """Taylor Swift
taylor@example.com | (555) 999-1122

EXPERIENCE
Lead Distributed Architect | MusicStream Inc (2020 - Present)
• Designed streaming audio event broker handling 10M concurrent listeners.
"""
    profile = parse_raw_resume_to_profile(sample)

    # 1. Jake's Resume (Classic ATS Gold Standard)
    jakes = generate_latex_resume(profile, template_style="jakes_resume")
    assert r"\documentclass[letterpaper,11pt]{article}" in jakes
    assert r"\usepackage{latexsym}" in jakes
    assert "MusicStream Inc" in jakes

    # 2. Modern Tech Developer (Teal headers & sans-serif)
    modern = generate_latex_resume(profile, template_style="modern_tech")
    assert r"\documentclass[letterpaper,10pt]{article}" in modern
    assert r"\definecolor{primary}{HTML}{0D9488}" in modern
    assert r"\color{primary}\scshape" in modern

    # 3. Executive Serif (Distinguished Charter font)
    exec_serif = generate_latex_resume(profile, template_style="executive_serif")
    assert r"\usepackage{charter}" in exec_serif
    assert r"\documentclass[letterpaper,11pt]{article}" in exec_serif

    # 4. Minimalist Sans (High-density 9.5pt tight margins)
    minimalist = generate_latex_resume(profile, template_style="minimalist_sans")
    assert r"\documentclass[letterpaper,9.5pt]{article}" in minimalist
    assert r"\addtolength{\oddsidemargin}{-0.65in}" in minimalist


def test_available_templates_metadata() -> None:
    """Verify metadata catalog for templates."""
    assert len(AVAILABLE_TEMPLATES) == 4
    template_ids = [t.id for t in AVAILABLE_TEMPLATES]
    assert "jakes_resume" in template_ids
    assert "modern_tech" in template_ids
    assert "executive_serif" in template_ids
    assert "minimalist_sans" in template_ids

    for t in AVAILABLE_TEMPLATES:
        assert t.name != ""
        assert t.description != ""
        assert t.font_family != ""
        assert t.ats_rating != ""
        assert t.recommended_for != ""


def test_page_fit_estimator() -> None:
    """Verify page count and density estimation for varying resume sizes."""
    # 1. Optimal 1-page profile
    p1 = RewrittenResumeProfile(
        full_name="Bob",
        summary="Brief summary",
        experiences=[
            ExperienceItem(
                company="Acme",
                position="Dev",
                highlights=["Bullet 1", "Bullet 2", "Bullet 3"],
            )
        ],
    )
    est1 = estimate_page_fit(p1)
    assert est1.estimated_pages == 1
    assert est1.density_status == "OPTIMAL_1_PAGE"

    # 2. High density / 2-page profile
    p2 = RewrittenResumeProfile(
        full_name="Alice",
        summary="Long summary " * 30,
        experiences=[
            ExperienceItem(
                company=f"Company {i}",
                position="Dev",
                highlights=[f"Achievement with heavy technical description and metrics {j}" * 4 for j in range(4)],
            )
            for i in range(5)
        ],
    )
    est2 = estimate_page_fit(p2)
    assert est2.estimated_pages == 2
    assert est2.density_status == "2_PAGES"


def test_cover_letter_generation() -> None:
    """Verify tailored cover letter cites candidate facts and JD role accurately."""
    profile = RewrittenResumeProfile(
        full_name="Jordan Lee",
        contact_email="jordan@example.com",
        contact_phone="(555) 321-4321",
        experiences=[
            ExperienceItem(
                company="FinTech Core",
                position="Senior Infrastructure Engineer",
                highlights=["Engineered high-concurrency payment engine scaling to 100k TPS."],
            )
        ],
    )
    jd = "Role: Staff Distributed Systems Architect\nCompany: Stripe\nRequirements: high throughput pipelines."
    text_letter, latex_letter = generate_cover_letter(profile, jd, candidate_seniority="STAFF")

    assert "Stripe" in text_letter
    assert "Staff Distributed Systems Architect" in text_letter
    assert "FinTech Core" in text_letter
    assert "Jordan Lee" in text_letter

    assert r"\documentclass[letterpaper,11pt]{article}" in latex_letter
    assert "Stripe" in latex_letter
    assert "Jordan Lee" in latex_letter
