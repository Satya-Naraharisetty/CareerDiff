"""Job Description (JD) analyzer extracting title, seniority, competencies, and requirements."""

import re
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.role import Competency, JobRole, Rubric, RubricCriteria
from app.services.claim_extractor import KNOWN_TECHNOLOGIES, normalize_technology


@dataclass
class JdProfileAnalysis:
    """Structured intelligence extracted from a Job Description."""

    extracted_title: str
    detected_seniority: str
    primary_discipline: str
    key_requirements: list[str] = field(default_factory=list)
    matched_technologies: list[str] = field(default_factory=list)
    competency_blueprints: list[dict[str, str]] = field(default_factory=list)
    suggested_company_name: str | None = None
    suggested_persona: str | None = None


def analyze_job_description(
    jd_text: str,
    custom_title: str | None = None,
) -> JdProfileAnalysis:
    """Parse raw Job Description to extract role title, seniority, discipline, and competencies."""
    lower_text = jd_text.lower()
    lines = [line.strip() for line in jd_text.split("\n") if line.strip()]

    # 1. Extract Role Title
    extracted_title = custom_title
    if not extracted_title:
        title_patterns = [
            r"(?:job\s+title|title|position|role):\s*([^\n\r]+)",
            (
                r"\b((?:Senior|Lead|Staff|Principal|Junior|Mid)?\s*"
                r"(?:Backend|Frontend|Full[\s\-]*Stack|Distributed\s+Systems|Platform|"
                r"Infrastructure|Software)\s*(?:Engineer|Architect|Developer))\b"
            ),
        ]
        for pat in title_patterns:
            m = re.search(pat, jd_text, re.IGNORECASE)
            if m:
                extracted_title = m.group(1).strip()
                break

    if not extracted_title:
        extracted_title = lines[0] if len(lines[0]) < 60 else "Tailored Technical Role"

    # 2. Detect Seniority Level
    if re.search(r"\b(staff|principal|director|fellow|vp|head of)\b", lower_text):
        detected_seniority = "STAFF"
    elif re.search(r"\b(senior|lead|architect)\b", lower_text) or re.search(
        r"\b(?:[5-9]|\d{2})\+?\s*(?:years?|yrs?)\b", lower_text
    ):
        detected_seniority = "SENIOR"
    elif re.search(r"\b(mid|intermediate)\b", lower_text) or re.search(
        r"\b(?:[2-4])\+?\s*(?:years?|yrs?)\b", lower_text
    ):
        detected_seniority = "MID"
    else:
        detected_seniority = "JUNIOR"

    # 3. Detect Primary Discipline
    backend_keywords = [
        "python",
        "fastapi",
        "django",
        "flask",
        "postgresql",
        "postgres",
        "redis",
        "kafka",
        "rabbitmq",
        "sqlalchemy",
        "grpc",
        "microservices",
        "distributed",
        "database",
        "concurrency",
        "golang",
        "java",
        "nosql",
    ]
    frontend_keywords = [
        "react",
        "typescript",
        "javascript",
        "css",
        "html",
        "next.js",
        "vue",
        "zustand",
        "redux",
        "tailwind",
        "dom",
        "frontend",
        "web vitals",
    ]

    backend_score = sum(
        1 for kw in backend_keywords if re.search(r"\b" + re.escape(kw) + r"\b", lower_text)
    )
    frontend_score = sum(
        1 for kw in frontend_keywords if re.search(r"\b" + re.escape(kw) + r"\b", lower_text)
    )

    if frontend_score >= 3 and backend_score >= 3:
        primary_discipline = "FULLSTACK"
    elif frontend_score > backend_score:
        primary_discipline = "FRONTEND"
    else:
        primary_discipline = "BACKEND"

    # 4. Extract Matched Technologies
    matched_technologies: set[str] = set()
    for tech in KNOWN_TECHNOLOGIES:
        if re.search(r"\b" + re.escape(tech) + r"\b", jd_text, re.IGNORECASE):
            matched_technologies.add(tech)

    # 5. Extract Key Requirements
    key_requirements: list[str] = []
    is_in_req_section = False
    for line in lines:
        if re.search(
            r"^(requirements|qualifications|what you'?ll need|skills|responsibilities)\b",
            line,
            re.IGNORECASE,
        ):
            is_in_req_section = True
            continue
        if is_in_req_section:
            if re.search(r"^(benefits|about us|perks|company|compensation)\b", line, re.IGNORECASE):
                break
            if len(line) >= 20 and (
                line.startswith("•") or line.startswith("-") or line.startswith("*")
            ):
                cleaned = re.sub(r"^[\s*•\-\u2022\u2023\u25E6\d+\.]+\s*", "", line).strip()
                if cleaned:
                    key_requirements.append(cleaned)
                    if len(key_requirements) >= 6:
                        break

    if not key_requirements:
        for line in lines:
            if (line.startswith("•") or line.startswith("-")) and len(line) > 25:
                cleaned = re.sub(r"^[\s*•\-\u2022\u2023\u25E6\d+\.]+\s*", "", line).strip()
                key_requirements.append(cleaned)
                if len(key_requirements) >= 4:
                    break

    # 6. Build Tailored Competencies
    competency_blueprints: list[dict[str, str]] = []
    if primary_discipline == "BACKEND":
        competency_blueprints = [
            {
                "name": "Distributed Systems & Event Streaming",
                "slug": "distributed-systems",
                "description": (
                    "Consensus, partitioning, messaging pipelines (Kafka/RabbitMQ), and streaming."
                ),
            },
            {
                "name": "Database Architecture & Data Modeling",
                "slug": "database-architecture",
                "description": (
                    "Query optimization, indexing strategies, PostgreSQL MVCC, and migrations."
                ),
            },
            {
                "name": "API Resilience & Microservice Reliability",
                "slug": "api-resilience",
                "description": (
                    "Rate limiting, circuit breakers, idempotency keys, and graceful degradation."
                ),
            },
            {
                "name": "Concurrency & State Synchronization",
                "slug": "distributed-systems",
                "description": (
                    "Locking mechanisms, race conditions, atomic operations, and concurrency."
                ),
            },
        ]
    elif primary_discipline == "FRONTEND":
        competency_blueprints = [
            {
                "name": "Web Performance & Core Web Vitals",
                "slug": "web-performance",
                "description": (
                    "Rendering pipelines, bundle splitting, hydration, and Core Web Vitals."
                ),
            },
            {
                "name": "State Management & React Architecture",
                "slug": "state-management",
                "description": (
                    "Component boundaries, reactive stores, cache invalidation, and memory leaks."
                ),
            },
            {
                "name": "Frontend API Contracts & Data Fetching",
                "slug": "fullstack-api",
                "description": (
                    "Type-safe schemas, optimistic updates, WebSockets, and client error recovery."
                ),
            },
        ]
    else:  # FULLSTACK
        competency_blueprints = [
            {
                "name": "Full-Stack API Design & Schema Contracts",
                "slug": "fullstack-api",
                "description": (
                    "Shared models, TypeScript contracts, REST/GraphQL design, and serialization."
                ),
            },
            {
                "name": "Distributed State & Cache Management",
                "slug": "state-management",
                "description": (
                    "Multi-tier caching (Redis, HTTP), cache invalidation, and session state."
                ),
            },
            {
                "name": "Database Architecture & Query Optimization",
                "slug": "database-architecture",
                "description": (
                    "Data modeling, indexing, connection pooling, and transactional consistency."
                ),
            },
            {
                "name": "API Resilience & Security",
                "slug": "api-resilience",
                "description": (
                    "Authentication (JWT/OAuth), authorization, idempotency, and defense in depth."
                ),
            },
        ]

    # 7. Extract Company Name and deduce Persona
    extracted_company = None
    company_patterns = [
        r"(?:company|organization|employer):\s*([^\n\r,]+)",
        r"(?:about|join|working\s+at)\s+([A-Z][a-zA-Z0-9\s&]{2,30}?)(?:,|\.|\n|\sis\b)",
    ]
    for pat in company_patterns:
        m = re.search(pat, jd_text, re.IGNORECASE)
        if m:
            cand = m.group(1).strip()
            if 2 <= len(cand) <= 40 and not any(w in cand.lower() for w in ["the team", "our team", "role", "us", "you"]):
                extracted_company = cand
                break

    suggested_persona = None
    if extracted_company:
        from app.services.company_analyzer import (
            classify_company_from_catalog,
            heuristic_company_classification,
        )

        cat = classify_company_from_catalog(extracted_company) or heuristic_company_classification(
            extracted_company, jd_text
        )
        suggested_persona = str(cat["detected_persona"])

    return JdProfileAnalysis(
        extracted_title=extracted_title,
        detected_seniority=detected_seniority,
        primary_discipline=primary_discipline,
        key_requirements=key_requirements,
        matched_technologies=sorted(list(matched_technologies)),
        competency_blueprints=competency_blueprints,
        suggested_company_name=extracted_company,
        suggested_persona=suggested_persona,
    )


async def get_or_create_custom_role_from_jd(
    db: AsyncSession,
    analysis: JdProfileAnalysis,
) -> JobRole:
    """Persist or retrieve a JobRole entity matching the analyzed Job Description."""
    slug_base = re.sub(r"[^a-z0-9]+", "-", analysis.extracted_title.lower()).strip("-")
    slug = f"jd-{slug_base}"[:90]

    stmt = select(JobRole).options(selectinload(JobRole.competencies)).where(JobRole.slug == slug)
    existing_role = (await db.execute(stmt)).scalar_one_or_none()
    if existing_role:
        return existing_role

    desc = f"Tailored track for {analysis.extracted_title}."
    role = JobRole(
        name=analysis.extracted_title[:95],
        slug=slug,
        description=desc,
        is_active=True,
    )
    db.add(role)
    await db.flush()

    for idx, bp in enumerate(analysis.competency_blueprints):
        comp = Competency(
            role_id=role.id,
            name=bp["name"],
            slug=bp["slug"],
            description=bp["description"],
            display_order=idx + 1,
        )
        db.add(comp)
        await db.flush()

        rubric = Rubric(
            competency_id=comp.id,
            version=1,
            is_active=True,
        )
        db.add(rubric)
        await db.flush()

        tiers = [
            (1, "UNSATISFACTORY", f"Lacks foundational understanding of {bp['name']}."),
            (2, "BASIC", f"Explains basic syntax and high-level concepts in {bp['name']}."),
            (
                3,
                "PROFICIENT",
                f"Applies best practices and explains trade-offs in {bp['name']}.",
            ),
            (
                4,
                "ADVANCED",
                f"Expert design, fault recovery, and architectural mastery in {bp['name']}.",
            ),
        ]
        for score, tier_name, desc in tiers:
            crit = RubricCriteria(
                rubric_id=rubric.id,
                tier_level=score,
                tier_name=tier_name,
                observable_criteria=desc,
            )
            db.add(crit)

    await db.commit()

    stmt_reload = (
        select(JobRole).options(selectinload(JobRole.competencies)).where(JobRole.id == role.id)
    )
    return (await db.execute(stmt_reload)).scalar_one()


@dataclass
class ResumeJdMatchResult:
    """Calculated alignment between a resume and target job description."""

    match_score_pct: int
    alignment_summary: str
    seniority_fit: str
    matched_skills: list[str]
    missing_skills: list[str]
    differentiating_skills: list[str]
    adaptive_interview_strategy: str


def match_resume_against_jd(
    resume_text: str,
    jd_text: str,
    resume_skills: list[str] | None = None,
    jd_technologies: list[str] | None = None,
    candidate_seniority: str = "SENIOR",
    required_seniority: str = "SENIOR",
) -> ResumeJdMatchResult:
    """Compute multidimensional match score and skill gaps between candidate resume and target JD."""
    resume_lower = resume_text.lower()
    jd_lower = jd_text.lower()

    # 1. Skill overlap & Gap detection
    active_resume_skills: list[str] = list(resume_skills) if resume_skills else []
    if not active_resume_skills:
        for tech in KNOWN_TECHNOLOGIES:
            if re.search(r"\b" + re.escape(tech) + r"\b", resume_text, re.IGNORECASE):
                active_resume_skills.append(tech)

    active_jd_techs: list[str] = list(jd_technologies) if jd_technologies else []
    if not active_jd_techs:
        for tech in KNOWN_TECHNOLOGIES:
            if re.search(r"\b" + re.escape(tech) + r"\b", jd_text, re.IGNORECASE):
                active_jd_techs.append(tech)

    resume_canonical_set = {normalize_technology(s) for s in active_resume_skills}
    jd_canonical_list = list(dict.fromkeys(normalize_technology(s) for s in active_jd_techs))
    jd_canonical_set = set(jd_canonical_list)

    matched_skills = [s for s in jd_canonical_list if s in resume_canonical_set]
    missing_skills = [s for s in jd_canonical_list if s not in resume_canonical_set]
    differentiating_skills = [
        s
        for s in list(dict.fromkeys(normalize_technology(s) for s in active_resume_skills))
        if s not in jd_canonical_set
    ]

    # 2. Skill Overlap Ratio
    skill_ratio = (
        len(matched_skills) / max(len(active_jd_techs), 1)
        if active_jd_techs
        else 0.8
    )

    # 3. Seniority Fit
    seniority_map = {"JUNIOR": 1, "MID": 2, "SENIOR": 3, "STAFF": 4}
    c_rank = seniority_map.get(candidate_seniority.upper(), 3)
    r_rank = seniority_map.get(required_seniority.upper(), 3)

    if c_rank >= r_rank:
        seniority_fit = "MATCH" if c_rank == r_rank else "OVERQUALIFIED"
        seniority_score = 1.0
    elif c_rank == r_rank - 1:
        seniority_fit = "STRETCH"
        seniority_score = 0.75
    else:
        seniority_fit = "GAP"
        seniority_score = 0.50

    # 4. Domain & Architecture Term Overlap
    arch_terms = [
        "distributed",
        "concurrency",
        "kafka",
        "postgres",
        "redis",
        "microservices",
        "latency",
        "scale",
        "idempotency",
    ]
    jd_arch_count = sum(1 for term in arch_terms if term in jd_lower)
    resume_arch_count = sum(
        1 for term in arch_terms if term in resume_lower and term in jd_lower
    )
    arch_overlap = (resume_arch_count / max(jd_arch_count, 1)) if jd_arch_count else 0.8

    # 5. Composite Score Calculation
    raw_score = (skill_ratio * 0.55) + (seniority_score * 0.25) + (arch_overlap * 0.20)
    match_score = min(98, max(20, round(raw_score * 100)))

    # 6. Alignment Summary & Strategy
    if match_score >= 80:
        alignment_summary = (
            f"Strong Alignment ({match_score}%). Resume directly demonstrates core tech stack and seniority requirements."
        )
    elif match_score >= 60:
        alignment_summary = (
            f"Moderate Alignment ({match_score}%). Core skills align well, with a few tooling or domain gaps."
        )
    else:
        alignment_summary = (
            f"Stretch Opportunity ({match_score}%). Foundational qualifications present, but target stack requirements have notable gaps."
        )

    matched_sample = ", ".join(matched_skills[:3]) if matched_skills else "general engineering principles"
    gap_sample = ", ".join(missing_skills[:2]) if missing_skills else "none"

    if missing_skills:
        strategy = (
            f"The Interview Engine will verify your proven experience in {matched_sample} via VERIFY_CLAIM probes, "
            f"and test conceptual grasp in your identified gap areas ({gap_sample}) using SCENARIO questions."
        )
    else:
        strategy = (
            f"The Interview Engine will verify deep hands-on expertise in {matched_sample} via VERIFY_CLAIM and "
            f"pressure-test system resilience and edge cases via CHALLENGE actions."
        )

    return ResumeJdMatchResult(
        match_score_pct=match_score,
        alignment_summary=alignment_summary,
        seniority_fit=seniority_fit,
        matched_skills=matched_skills,
        missing_skills=missing_skills,
        differentiating_skills=differentiating_skills[:6],
        adaptive_interview_strategy=strategy,
    )


def compute_ats_score(
    resume_text: str,
    jd_text: str,
    resume_skills: list[str] | None = None,
    jd_technologies: list[str] | None = None,
    candidate_seniority: str = "SENIOR",
    required_seniority: str = "SENIOR",
    years_experience: int = 5,
) -> dict[str, Any]:
    """Compute comprehensive Applicant Tracking System (ATS) score (0-100) and optimization advice wrt the JD."""
    resume_lower = resume_text.lower()

    # 1. Keyword & Technology Matching (40% weight)
    active_resume_skills: list[str] = list(resume_skills) if resume_skills else []
    if not active_resume_skills:
        for tech in KNOWN_TECHNOLOGIES:
            if re.search(r"\b" + re.escape(tech) + r"\b", resume_text, re.IGNORECASE):
                active_resume_skills.append(tech)

    active_jd_techs: list[str] = list(jd_technologies) if jd_technologies else []
    if not active_jd_techs:
        for tech in KNOWN_TECHNOLOGIES:
            if re.search(r"\b" + re.escape(tech) + r"\b", jd_text, re.IGNORECASE):
                active_jd_techs.append(tech)

    resume_canonical_set = {normalize_technology(s) for s in active_resume_skills}
    jd_canonical_list = list(dict.fromkeys(normalize_technology(s) for s in active_jd_techs))

    matched_keywords = [s for s in jd_canonical_list if s in resume_canonical_set]
    missing_critical_keywords = [s for s in jd_canonical_list if s not in resume_canonical_set]

    keyword_ratio = (
        len(matched_keywords) / max(len(jd_canonical_list), 1)
        if jd_canonical_list
        else 0.85
    )
    keyword_score = min(100, max(20, round(keyword_ratio * 100)))

    # 2. Experience & Seniority Fit (25% weight)
    seniority_map = {"JUNIOR": 1, "MID": 2, "SENIOR": 3, "STAFF": 4}
    c_rank = seniority_map.get(candidate_seniority.upper(), 3)
    r_rank = seniority_map.get(required_seniority.upper(), 3)

    if c_rank >= r_rank:
        experience_score = 95 if c_rank == r_rank else 90
    elif c_rank == r_rank - 1:
        experience_score = 75
    else:
        experience_score = 55

    # 3. Quantifiable Impact & Metrics (20% weight)
    # ATS parsers look for numbers, percentages, throughput indicators
    metrics_patterns = [
        r"\b\d+(?:\.\d+)?%",
        r"\b\d+(?:\.\d+)?k\b",
        r"\b\d+(?:\.\d+)?m\b",
        r"\b\d+(?:\.\d+)?\s*(?:requests|qps|events|users|ms|seconds|minutes)\b",
        r"\$\d+(?:\.\d+)?",
        r"\b\d+\+?\s*years?\b",
    ]
    metric_hits = sum(len(re.findall(pat, resume_lower)) for pat in metrics_patterns)
    if metric_hits >= 5:
        quantified_impact_score = 95
    elif metric_hits >= 3:
        quantified_impact_score = 85
    elif metric_hits >= 1:
        quantified_impact_score = 70
    else:
        quantified_impact_score = 50

    # 4. Standard Section Completeness & Layout (15% weight)
    sections_found = 0
    if re.search(r"\b(summary|profile|about)\b", resume_lower):
        sections_found += 1
    if re.search(r"\b(experience|employment|work history)\b", resume_lower):
        sections_found += 1
    if re.search(r"\b(skills|technologies|technical stack)\b", resume_lower):
        sections_found += 1
    if re.search(r"\b(education|university|degree|bachelor|master)\b", resume_lower):
        sections_found += 1

    section_structure_score = round((sections_found / 4.0) * 100) if sections_found else 75

    # 5. Composite ATS Score (out of 100)
    raw_ats = (
        (keyword_score * 0.40)
        + (experience_score * 0.25)
        + (quantified_impact_score * 0.20)
        + (section_structure_score * 0.15)
    )
    final_ats_score = min(98, max(25, round(raw_ats)))

    # 6. Actionable ATS Optimization Tips
    tips: list[str] = []
    if missing_critical_keywords:
        tips.append(
            f"Add target keywords '{', '.join(missing_critical_keywords[:3])}' into your Skills and Experience bullet points to pass keyword filters."
        )
    if metric_hits < 4:
        tips.append(
            "Quantify your bullet points with measurable impact metrics (e.g., 'reduced latency by 35%', 'processed 50k events/sec')."
        )
    if sections_found < 4:
        tips.append(
            "Ensure standard ATS section headers (Summary, Experience, Skills, Education) are clearly formatted without table or multi-column nesting."
        )
    if not tips:
        tips.append(
            "Your resume structure and keyword density match the target Job Description exceptionally well for ATS screening."
        )

    return {
        "ats_score": final_ats_score,
        "keyword_score": keyword_score,
        "experience_score": experience_score,
        "quantified_impact_score": quantified_impact_score,
        "section_structure_score": section_structure_score,
        "matched_keywords": matched_keywords,
        "missing_critical_keywords": missing_critical_keywords,
        "optimization_tips": tips,
    }


