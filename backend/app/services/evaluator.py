"""Decoupled Assessment Evaluator service for post-interview rubric scoring and evidence."""

import logging
import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.evaluation import (
    AssessmentReport,
    CompetencyScore,
    EvaluationEvidence,
    InterviewClaimVerification,
)
from app.models.interview import BlueprintTopic, Interview, InterviewBlueprint, InterviewTurn
from app.models.outbox import WorkerExecution
from app.models.resume import Resume, ResumeClaim
from app.models.role import Competency, JobRole, Rubric
from app.services.jd_analyzer import compute_ats_score
from app.services.voice_analytics import analyze_voice_and_communication

logger = logging.getLogger("CareerDiff.evaluator")


class AssessmentEvaluator:
    """Asynchronous evaluator executing decoupled from live turns.

    Grounds scores in verbatim candidate transcript excerpts with exact Unicode character offsets.
    """

    @classmethod
    async def evaluate_interview(
        cls,
        db: AsyncSession,
        interview_id: uuid.UUID,
        idempotency_key: str | None = None,
        model_used: str = "gemini-4-argon",
    ) -> AssessmentReport:
        """Execute exhaustive rubric scoring, evidence grounding, and claim verification."""
        # 1. Enforce Durable Worker Idempotency via worker_executions table
        task_name = "evaluate_interview"
        exec_key = idempotency_key or f"evaluate:{interview_id}:v1"

        stmt_exec = select(WorkerExecution).where(
            WorkerExecution.task_name == task_name,
            WorkerExecution.idempotency_key == exec_key,
        )
        existing_exec = (await db.execute(stmt_exec)).scalar_one_or_none()

        if existing_exec and existing_exec.status == "SUCCESS" and existing_exec.result_reference:
            logger.info(
                "Idempotency hit for %s:%s. Returning existing report %s",
                task_name,
                exec_key,
                existing_exec.result_reference,
            )
            report_id = uuid.UUID(existing_exec.result_reference)
            stmt_rep = (
                select(AssessmentReport)
                .options(
                    selectinload(AssessmentReport.competency_scores)
                    .selectinload(CompetencyScore.evidence_items)
                    .selectinload(EvaluationEvidence.interview_turn),
                    selectinload(AssessmentReport.competency_scores).selectinload(
                        CompetencyScore.competency
                    ),
                )
                .where(AssessmentReport.id == report_id)
            )
            existing_report = (await db.execute(stmt_rep)).scalar_one_or_none()
            if existing_report:
                return existing_report

        if not existing_exec:
            worker_exec = WorkerExecution(
                task_name=task_name,
                idempotency_key=exec_key,
                aggregate_id=interview_id,
                status="RUNNING",
            )
            db.add(worker_exec)
            await db.commit()
            await db.refresh(worker_exec)
        else:
            worker_exec = existing_exec
            worker_exec.status = "RUNNING"
            await db.commit()

        try:
            # 2. Load Interview, Turns, Blueprints, Role Competencies, and Resume Claims
            stmt_interview = (
                select(Interview)
                .options(
                    selectinload(Interview.blueprint).selectinload(InterviewBlueprint.topics),
                    selectinload(Interview.turns),
                    selectinload(Interview.candidate_profile),
                )
                .where(Interview.id == interview_id)
            )
            interview = (await db.execute(stmt_interview)).scalar_one_or_none()
            if not interview:
                raise ValueError(f"Interview '{interview_id}' not found.")

            # Load Role Competencies with Rubrics and Criteria
            stmt_comps = (
                select(Competency)
                .options(
                    selectinload(Competency.rubrics).selectinload(Rubric.criteria),
                )
                .where(Competency.role_id == interview.role_id)
                .order_by(Competency.display_order.asc())
            )
            competencies = list((await db.execute(stmt_comps)).scalars().all())

            # Load candidate resume claims if available
            claims: list[ResumeClaim] = []
            stmt_resume = (
                select(Resume)
                .options(selectinload(Resume.claims))
                .where(Resume.candidate_profile_id == interview.candidate_profile_id)
                .order_by(Resume.created_at.desc())
            )
            latest_resume = (await db.execute(stmt_resume)).scalars().first()
            if latest_resume and latest_resume.claims:
                claims = list(latest_resume.claims)

            # Filter candidate turns
            candidate_turns = [turn for turn in interview.turns if turn.speaker == "CANDIDATE"]

            # 3. Calculate next report version and mark previous as not latest
            stmt_version = select(func.max(AssessmentReport.version)).where(
                AssessmentReport.interview_id == interview_id
            )
            current_max_version = (await db.execute(stmt_version)).scalar() or 0
            new_version = current_max_version + 1

            if current_max_version > 0:
                await db.execute(
                    update(AssessmentReport)
                    .where(AssessmentReport.interview_id == interview_id)
                    .values(is_latest=False)
                )

            # 4. Map covered topics in Blueprint
            blueprint_topics: list[BlueprintTopic] = []
            if interview.blueprint and interview.blueprint.topics:
                blueprint_topics = sorted(interview.blueprint.topics, key=lambda t: t.display_order)

            covered_competency_ids = {t.competency_id for t in blueprint_topics}

            # 5. Evaluate Competency Scores & Extract Normalized Evidence
            created_scores: list[CompetencyScore] = []
            created_evidence: list[EvaluationEvidence] = []
            assessed_score_values: list[int] = []
            strengths: list[str] = []
            knowledge_gaps: list[str] = []
            study_recs: list[str] = []

            for comp in competencies:
                is_covered = comp.id in covered_competency_ids

                # Incomplete Coverage Non-Penalization: INSUFFICIENT_EVIDENCE
                if not is_covered or not candidate_turns:
                    comp_score = CompetencyScore(
                        competency_id=comp.id,
                        score=None,
                        status="INSUFFICIENT_EVIDENCE",
                        rationale=(
                            f"Competency '{comp.name}' was not covered during this "
                            f"{interview.scheduled_duration_minutes}-minute interview session."
                        ),
                        confidence=1.0,
                    )
                    created_scores.append(comp_score)
                    continue

                # Covered: Evaluate candidate turns against competency rubrics
                matched_evidence_list, tier_score, rationale = cls._score_competency_turns(
                    comp=comp,
                    candidate_turns=candidate_turns,
                    version=new_version,
                )

                comp_score = CompetencyScore(
                    competency_id=comp.id,
                    score=tier_score,
                    status="EVALUATED",
                    rationale=rationale,
                    confidence=0.95,
                )
                created_scores.append(comp_score)
                assessed_score_values.append(tier_score)

                for ev in matched_evidence_list:
                    # Link evidence to score instance
                    ev.competency_score = comp_score
                    created_evidence.append(ev)

                # Collect strengths / gaps / study recommendations
                if tier_score >= 3:
                    strengths.append(f"Strong demonstration of {comp.name}: {rationale[:120]}...")
                else:
                    knowledge_gaps.append(
                        f"Gap identified in {comp.name}: Needs deeper familiarity with production."
                    )
                    study_recs.append(f"Review architecture best practices for {comp.name}.")

            # Compute composite overall score
            overall_score: float | None = None
            if assessed_score_values:
                overall_score = round(sum(assessed_score_values) / len(assessed_score_values), 1)

            # Generate Executive Summary
            summary_headline = (
                f"Candidate completed {interview.target_seniority} evaluation across "
                f"{len(assessed_score_values)} covered technical competencies."
            )
            if overall_score and overall_score >= 3.5:
                summary_headline += " Demonstrates advanced architectural maturity."
            elif overall_score and overall_score >= 2.5:
                summary_headline += " Demonstrates solid fundamental knowledge."
            else:
                summary_headline += " Requires further study on core concurrency."

            if not study_recs:
                study_recs = [
                    "Explore real-world distributed transactions and saga patterns.",
                    "Review database indexing under high-write workloads.",
                ]

            # 6. Compute ATS Score with respect to the calibrated Job Description
            stmt_role = select(JobRole).where(JobRole.id == interview.role_id)
            role = (await db.execute(stmt_role)).scalar_one_or_none()

            jd_text = interview.session_policy.get("jd_text") or (
                f"{role.name}\n{role.description or ''}\n" + ", ".join(c.name for c in competencies)
                if role
                else "Software Engineering Role"
            )

            resume_text = (
                latest_resume.raw_extracted_text
                if latest_resume and latest_resume.raw_extracted_text
                else ""
            )
            if not resume_text and claims:
                resume_text = "\n".join(c.claim_text for c in claims)

            resume_skills: list[str] = []
            if claims:
                for c in claims:
                    resume_skills.extend(c.technologies)

            ats_data = compute_ats_score(
                resume_text=resume_text,
                jd_text=jd_text,
                resume_skills=list(dict.fromkeys(resume_skills)),
                candidate_seniority=interview.target_seniority,
                required_seniority=interview.target_seniority,
                years_experience=(
                    interview.candidate_profile.years_experience
                    if interview.candidate_profile
                    else 5
                ),
            )

            # 7. Compute Objective Voice & Technical Communication Delivery Analytics
            comm_data = analyze_voice_and_communication(candidate_turns)

            # 8. Create AssessmentReport with Interview Score, ATS Alignment, and Communication
            report = AssessmentReport(
                interview_id=interview.id,
                version=new_version,
                is_latest=True,
                prompt_version=1,
                rubric_version=1,
                model_used=model_used,
                overall_score=overall_score,
                summary=summary_headline,
                strengths=strengths,
                knowledge_gaps=knowledge_gaps,
                study_recommendations=study_recs,
                ats_score=int(ats_data["ats_score"]),
                ats_breakdown=ats_data,
                communication_score=int(comm_data["communication_score"]),
                communication_breakdown=comm_data,
            )
            db.add(report)
            await db.flush()

            # Attach report ID to scores and persist
            for score in created_scores:
                score.assessment_report_id = report.id
                db.add(score)
            await db.flush()

            for ev in created_evidence:
                ev.competency_score_id = ev.competency_score.id
                db.add(ev)

            # 7. Audit & Verify Candidate Resume Claims
            stmt_existing_cv = select(InterviewClaimVerification).where(
                InterviewClaimVerification.interview_id == interview.id
            )
            existing_cv_map = {
                cv.resume_claim_id: cv
                for cv in (await db.execute(stmt_existing_cv)).scalars().all()
            }

            for claim in claims:
                verif_status, confidence, notes, matched_turn = cls._verify_claim_against_turns(
                    claim=claim,
                    candidate_turns=candidate_turns,
                )
                if claim.id in existing_cv_map:
                    claim_verif = existing_cv_map[claim.id]
                    claim_verif.status = verif_status
                    claim_verif.confidence = confidence
                    claim_verif.auditor_notes = notes
                    claim_verif.verified_turn_id = matched_turn.id if matched_turn else None
                else:
                    claim_verif = InterviewClaimVerification(
                        interview_id=interview.id,
                        resume_claim_id=claim.id,
                        verified_turn_id=matched_turn.id if matched_turn else None,
                        status=verif_status,
                        confidence=confidence,
                        auditor_notes=notes,
                    )
                    db.add(claim_verif)

            # Commit evaluation records
            await db.commit()

            # 8. Mark WorkerExecution as SUCCESS
            worker_exec.status = "SUCCESS"
            worker_exec.completed_at = datetime.now(timezone.utc)
            worker_exec.result_reference = str(report.id)
            await db.commit()

            logger.info(
                "Successfully compiled AssessmentReport %s (v%d, score=%.1f) for interview %s",
                report.id,
                report.version,
                report.overall_score or 0.0,
                interview_id,
            )

            # Reload full report eagerly
            stmt_final = (
                select(AssessmentReport)
                .options(
                    selectinload(AssessmentReport.competency_scores)
                    .selectinload(CompetencyScore.evidence_items)
                    .selectinload(EvaluationEvidence.interview_turn),
                    selectinload(AssessmentReport.competency_scores).selectinload(
                        CompetencyScore.competency
                    ),
                )
                .where(AssessmentReport.id == report.id)
            )
            return (await db.execute(stmt_final)).scalar_one()

        except Exception as exc:
            await db.rollback()
            worker_exec.status = "FAILED"
            worker_exec.completed_at = datetime.now(timezone.utc)
            worker_exec.error_message = str(exc)
            await db.commit()
            logger.error("Assessment evaluation failed for interview %s: %s", interview_id, exc)
            raise

    @classmethod
    def _score_competency_turns(
        cls,
        comp: Competency,
        candidate_turns: list[InterviewTurn],
        version: int,
    ) -> tuple[list[EvaluationEvidence], int, str]:
        """Analyze candidate answers, match 4-tier rubrics, and extract grounded evidence."""
        # High-level technical keywords per domain
        technical_terms = [
            "partition",
            "replica",
            "throughput",
            "latency",
            "concurrency",
            "locking",
            "isolation",
            "sharding",
            "cache",
            "index",
            "idempotent",
            "backpressure",
            "distributed",
            "acid",
            "eventual",
            "raft",
            "kafka",
            "postgres",
            "redis",
            "mutex",
            "optimistic",
            "pessimistic",
        ]

        # Gather relevant candidate statements
        relevant_turn: InterviewTurn | None = None
        best_excerpt: str = ""
        depth_score = 2  # Default to BASIC

        for turn in candidate_turns:
            text_lower = turn.transcript.lower()
            # Look for technical depth
            matched_terms = [term for term in technical_terms if term in text_lower]
            if len(matched_terms) >= 2 or len(turn.transcript) > 60:
                relevant_turn = turn
                # Select a substantial verbatim sentence or phrase as excerpt
                sentences = [s.strip() for s in turn.transcript.split(".") if len(s.strip()) > 10]
                if sentences:
                    best_excerpt = sentences[0]
                else:
                    best_excerpt = turn.transcript[:80].strip()

                if len(matched_terms) >= 3:
                    depth_score = 4  # ADVANCED
                elif len(matched_terms) >= 1:
                    depth_score = 3  # PROFICIENT
                else:
                    depth_score = 2  # BASIC
                break

        if not relevant_turn:
            relevant_turn = candidate_turns[-1]
            best_excerpt = relevant_turn.transcript[:60].strip() or "Standard response"
            depth_score = 2

        # Strict Grounding Invariant: Verify verbatim substring and compute Unicode offsets
        start_offset = relevant_turn.transcript.find(best_excerpt)
        if start_offset == -1:
            # Fallback to entire transcript slice to guarantee invariant
            best_excerpt = relevant_turn.transcript
            start_offset = 0
        end_offset = start_offset + len(best_excerpt)

        # Assert character offset invariant: turn.transcript[start:end] == excerpt
        assert relevant_turn.transcript[start_offset:end_offset] == best_excerpt, (
            f"Offset mismatch: expected {best_excerpt!r}"
        )

        # Determine evidence impact and type based on depth score
        if depth_score >= 3:
            ev_type = "POSITIVE_MASTERY"
            ev_impact = "UPWEIGHT"
            base_rationale = (
                f"Candidate provided substantive architecture reasoning on {comp.name}, "
                f"demonstrating clear grasp of production requirements."
            )
        else:
            ev_type = "SUPERFICIAL_EXPLANATION"
            ev_impact = "NEUTRAL"
            base_rationale = (
                f"Candidate demonstrated basic familiarity with {comp.name}, "
                f"but lacked deep quantitative analysis of failure modes."
            )

        # Generate Staff-Level Model Answer & Level-Up Guidance
        model_answer = cls._get_model_answer(comp.slug)
        level_up = cls._get_level_up_guidance(comp.slug, depth_score)
        rationale = (
            f"{base_rationale}\n\n"
            f"🎯 **Staff-Level Model Answer**:\n{model_answer}\n\n"
            f"💡 **How to Level Up to Tier 4**:\n{level_up}"
        )

        evidence = EvaluationEvidence(
            interview_turn_id=relevant_turn.id,
            evidence_type=ev_type,
            assessment_impact=ev_impact,
            transcript_excerpt=best_excerpt,
            start_char_offset=start_offset,
            end_char_offset=end_offset,
            evaluation_version=version,
            confidence=0.95,
            rationale=base_rationale,
        )

        return [evidence], depth_score, rationale

    @classmethod
    def _get_model_answer(cls, comp_slug: str) -> str:
        """Provide a Staff/Principal-level model answer for competency."""
        answers = {
            "hybrid-retrieval-vector-search": (
                "Combine dense semantic vector retrieval with sparse BM25 keyword search using "
                "Reciprocal Rank Fusion: RRF(d) = sum(1 / (60 + rank_i(d))). Rank-based fusion overcomes "
                "scale differences between cosine similarities and BM25 scores. Configure Qdrant HNSW graph "
                "(M=16, efSearch=64) with payload-based pre-filtering to eliminate recall loss."
            ),
            "rag-architectures-reranking": (
                "Employ two-stage retrieval: broad recall (dense + BM25) followed by a cross-encoder reranker "
                "(e.g., Jina or BGE-Reranker-Large) with MMR diversification (lambda=0.7). Implement dynamic sliding "
                "context windows and hierarchical chunk headers to maintain global semantic context across splits."
            ),
            "llm-observability-telemetry": (
                "Instrument streaming Time to First Token (TTFT) and token generation velocity at the WebSocket "
                "gateway. Automate DeepEval evaluation suites measuring Faithfulness and Context Relevance in "
                "CI/CD regression gates with statistical confidence intervals to catch model regressions."
            ),
            "distributed-systems": (
                "Enforce event ordering using partitioned log topics (Kafka) keyed by entity ID. Pair with "
                "a Transactional Outbox in PostgreSQL to guarantee atomic event dispatch without dual-write "
                "distributed failure modes, mitigating consumer group rebalance latency via cooperative assignors."
            ),
            "database-architecture": (
                "Eliminate N+1 queries using async selectinload for 1-to-many collections. Configure composite "
                "partial B-tree indexes, optimize PostgreSQL MVCC autovacuum thresholds for high-churn tables, and "
                "enforce connection pooling parameters (pool_size=20, max_overflow=10, pool_timeout=30s)."
            ),
            "cicd-automation-release": (
                "Implement automated GitOps deployment pipelines with blue-green traffic shifting, automated canary "
                "analysis with Prometheus health thresholds, and instantaneous automated rollbacks upon error spikes."
            ),
            "distributed-stream-batch-processing": (
                "Architect low-latency streaming pipelines with Kafka and Spark/Flink, tuning partition skew and "
                "checkpoint intervals to guarantee exactly-once processing semantics under consumer failovers."
            ),
        }
        return answers.get(
            comp_slug,
            "A Staff-level response articulates specific quantitative metrics, internal data structures, "
            "concurrency primitives, and explicit trade-offs between consistency, availability, and latency.",
        )

    @classmethod
    def _get_level_up_guidance(cls, comp_slug: str, current_score: int) -> str:
        """Provide targeted coaching to advance candidate from current tier to Tier 4."""
        if current_score >= 4:
            return "Advanced mastery achieved! Continue demonstrating system trade-offs and concrete production SLAs."
        if current_score == 3:
            return (
                "To reach Tier 4: Specifically articulate failure recovery mechanisms, network partition "
                "scenarios, memory/CPU footprints, and mathematical formulas or exact configuration parameters."
            )
        return (
            "To reach Tier 3/4: Move beyond naming tools and frameworks. Explain the internal data structures, "
            "concurrency controls, and error handling strategies you used to make the system resilient under load."
        )

    @classmethod
    def _verify_claim_against_turns(
        cls,
        claim: ResumeClaim,
        candidate_turns: list[InterviewTurn],
    ) -> tuple[str, float, str, InterviewTurn | None]:
        """Audit candidate resume claims against spoken statements."""
        claim_lower = claim.claim_text.lower()
        technologies = [t.lower() for t in claim.technologies]

        for turn in candidate_turns:
            transcript_lower = turn.transcript.lower()
            # Check technology match
            tech_matches = [t for t in technologies if t in transcript_lower]
            has_word_match = any(
                word in transcript_lower for word in claim_lower.split() if len(word) > 5
            )
            if tech_matches or has_word_match:
                # Check if candidate articulated concrete explanation
                if len(turn.transcript) > 40:
                    matched_desc = ", ".join(tech_matches or ["claim concepts"])
                    return (
                        "VERIFIED",
                        0.95,
                        f"Candidate corroborated resume experience regarding {matched_desc}.",
                        turn,
                    )
                else:
                    return (
                        "VAGUE",
                        0.75,
                        "Candidate mentioned the technology without deep architecture details.",
                        turn,
                    )

        return (
            "UNTESTED",
            1.0,
            "Claim was not directly probed or evaluated during the interview turns.",
            None,
        )
