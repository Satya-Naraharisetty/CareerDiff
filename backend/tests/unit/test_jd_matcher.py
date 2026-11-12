"""Unit tests for Resume vs. Job Description comparative matching and gap analysis."""

from app.services.jd_analyzer import compute_ats_score, match_resume_against_jd


def test_perfect_fit_resume_jd_matching() -> None:
    resume = (
        "Senior Backend Architect with 8 years of experience building distributed systems in Python, "
        "FastAPI, PostgreSQL, Kafka, and Redis with high throughput."
    )
    jd = (
        "Seeking Senior Distributed Systems Engineer. Requirements: 6+ years in Python, Kafka, "
        "PostgreSQL, Redis, and microservices."
    )
    result = match_resume_against_jd(
        resume_text=resume,
        jd_text=jd,
        resume_skills=["Python", "FastAPI", "PostgreSQL", "Kafka", "Redis"],
        jd_technologies=["Python", "Kafka", "PostgreSQL", "Redis"],
        candidate_seniority="SENIOR",
        required_seniority="SENIOR",
    )

    assert result.match_score_pct >= 80
    assert result.seniority_fit == "MATCH"
    assert "Python" in result.matched_skills
    assert "Kafka" in result.matched_skills
    assert len(result.missing_skills) == 0
    assert "VERIFY_CLAIM" in result.adaptive_interview_strategy


def test_synonym_normalization_in_matching() -> None:
    """Verify that synonyms like k8s, golang, psql, and gcp match canonical terms."""
    resume = "Built distributed microservices in Go, Kubernetes, PostgreSQL, and Google Cloud."
    jd = "Seeking Backend Engineer with experience in Golang, K8s, PSQL, and GCP."
    result = match_resume_against_jd(
        resume_text=resume,
        jd_text=jd,
        resume_skills=["Go", "Kubernetes", "PostgreSQL", "Google Cloud"],
        jd_technologies=["Golang", "K8s", "PSQL", "GCP"],
        candidate_seniority="SENIOR",
        required_seniority="SENIOR",
    )

    assert "Go" in result.matched_skills
    assert "Kubernetes" in result.matched_skills
    assert "PostgreSQL" in result.matched_skills
    assert "GCP" in result.matched_skills
    assert len(result.missing_skills) == 0


def test_gap_detection_in_resume_jd_matching() -> None:
    resume = "Mid-Level Python Developer with 3 years experience building Flask and PostgreSQL REST APIs."
    jd = (
        "Senior Infrastructure Architect. Requirements: 7+ years, Kubernetes, Kafka, Go, "
        "Distributed consensus, PostgreSQL."
    )
    result = match_resume_against_jd(
        resume_text=resume,
        jd_text=jd,
        resume_skills=["Python", "Flask", "PostgreSQL"],
        jd_technologies=["Kubernetes", "Kafka", "Go", "PostgreSQL"],
        candidate_seniority="MID",
        required_seniority="SENIOR",
    )

    assert result.match_score_pct < 75
    assert result.seniority_fit == "STRETCH"
    assert "PostgreSQL" in result.matched_skills
    assert "Kubernetes" in result.missing_skills or "Go" in result.missing_skills
    assert "SCENARIO" in result.adaptive_interview_strategy


def test_compute_ats_score_high_alignment() -> None:
    resume = (
        "SUMMARY\n"
        "Senior Backend Architect with 7+ years of experience.\n"
        "EXPERIENCE\n"
        "• Scaled PostgreSQL database handling 50k events/sec and 99.99% uptime with Kafka and Redis.\n"
        "• Reduced query latency by 45% using composite indexing.\n"
        "SKILLS\n"
        "Python, FastAPI, Kafka, PostgreSQL, Redis, Docker\n"
        "EDUCATION\n"
        "Bachelor of Science in Computer Science"
    )
    jd = (
        "Seeking Senior Distributed Systems Engineer. Requirements: 6+ years with Python, Kafka, "
        "PostgreSQL, Redis, and high-throughput microservices."
    )
    ats = compute_ats_score(
        resume_text=resume,
        jd_text=jd,
        resume_skills=["Python", "FastAPI", "Kafka", "PostgreSQL", "Redis", "Docker"],
        jd_technologies=["Python", "Kafka", "PostgreSQL", "Redis"],
        candidate_seniority="SENIOR",
        required_seniority="SENIOR",
        years_experience=7,
    )

    assert 80 <= ats["ats_score"] <= 100
    assert ats["keyword_score"] >= 80
    assert ats["experience_score"] >= 90
    assert ats["quantified_impact_score"] >= 80
    assert ats["section_structure_score"] == 100
    assert "Python" in ats["matched_keywords"]
    assert len(ats["missing_critical_keywords"]) == 0
    assert len(ats["optimization_tips"]) > 0


def test_compute_ats_score_with_gaps_and_tips() -> None:
    resume = "Junior Developer\nBuilt simple websites with HTML, CSS, and basic Python."
    jd = (
        "Staff Infrastructure Engineer. Requirements: 8+ years, Kubernetes, Kafka, Go, Terraform, "
        "Distributed consensus, 100k QPS."
    )
    ats = compute_ats_score(
        resume_text=resume,
        jd_text=jd,
        resume_skills=["Python", "HTML", "CSS"],
        jd_technologies=["Kubernetes", "Kafka", "Go", "Terraform"],
        candidate_seniority="JUNIOR",
        required_seniority="STAFF",
        years_experience=1,
    )

    assert ats["ats_score"] < 70
    assert (
        "Kubernetes" in ats["missing_critical_keywords"] or "Go" in ats["missing_critical_keywords"]
    )
    # Check that optimization tips provide advice for missing keywords
    assert any("Add target keywords" in tip for tip in ats["optimization_tips"])
