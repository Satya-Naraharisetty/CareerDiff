# User Personas — IntervueX

This document establishes the authoritative user personas for the IntervueX platform. It reflects our primary MVP focus on **Candidate Technical Interview Practice & Mastery Simulation**, while preserving the architectural and data modeling path for post-MVP **Enterprise Hiring Assessment**.

---

## 1. Primary MVP Persona: Senior Software Engineer (Candidate)

### Profile: Alex Rivera
- **Current Role:** Senior Backend Engineer (7 years experience)
- **Target Role:** Staff / Principal Backend Systems Engineer
- **Technical Comfort:** Expert. Builds distributed systems, works with Kubernetes, PostgreSQL internals, and Kafka daily.
- **Mindset:** Skeptical of AI tools, values engineering rigor, hates trivial LeetCode memorization.

```text
"If an interviewer asks me to invert a binary tree on a whiteboard, they learn nothing about
how I design idempotent event pipelines or mitigate split-brain in distributed consensus.
Give me a real architectural challenge, challenge my trade-offs, and respect my time."
```

### Goals & Motivations (MVP Practice Use Case)
- Wants an interview simulator that probes actual production experiences and engineering judgment.
- Expects the interviewer to understand trade-offs (e.g., CAP theorem nuances, write amplification in LSM-trees).
- Desires verification of the significant architectural milestones listed on their resume.
- Wants objective, transparent feedback free from human interviewer mood or bias.

### Frustrations & Pain Points
- Interacting with generic AI chatbots that praise every superficial answer and fail to drill into mechanisms.
- Being cut off mid-thought or having latency delays make conversation feel unnatural.
- Not receiving clear evidence for why a particular answer was rated or scored.

### Behavioral Requirements for IntervueX
- The engine must detect high-level answers and automatically trigger `CHALLENGE` or `PROBE_DEEPER`.
- The voice pipeline must handle natural pauses (Alex taking 4-5 seconds to think before outlining a distributed lock algorithm) without prematurely terminating the turn.
- The evaluation must acknowledge valid alternative engineering trade-offs.

---

## 2. Secondary MVP Persona: Mid-Level Software Engineer (Candidate)

### Profile: Maya Patel
- **Current Role:** Full-Stack Developer (2.5 years experience)
- **Target Role:** Senior Full-Stack Engineer
- **Technical Comfort:** Intermediate. Strong in TypeScript, React, and REST APIs; developing intuition around database indexing, caching strategies, and concurrency.
- **Mindset:** Ambitious, eager to learn, anxious about high-stakes technical interviews.

```text
"I know how to build web applications, but I get nervous when interviewers ask open-ended
system design questions. I want to know where my blind spots are so I can study them."
```

### Goals & Motivations (MVP Practice Use Case)
- Practice technical communication under realistic voice conditions.
- Encounter adaptive questions that increase in difficulty as competence is demonstrated.
- Receive dynamic scaffolding (`SIMPLIFY`) when stuck to enable learning without derailing the interview.
- Receive concrete, actionable feedback that highlights exact knowledge gaps with curated study guides.

### Frustrations & Pain Points
- Being abandoned when stuck on an unfamiliar concept without constructive hints or scaffolding.
- Generic feedback like "Improve system design skills" without specific transcript citations.
- Clunky interview software with mic permission issues or confusing UI controls.

### Behavioral Requirements for IntervueX
- When Maya struggles or gives a circular answer, the engine must trigger `SIMPLIFY` or `CLARIFY` to provide a helpful nudge.
- The feedback report must link directly to the transcript, showing exactly where a gap was revealed and recommending specific reading topics.

---

## 3. Post-MVP Persona: Engineering Hiring Manager (Preserved Future Path)

### Profile: David Chen
- **Current Role:** VP of Engineering / Hiring Manager
- **Team Size:** 45 engineers across 5 squads
- **Technical Comfort:** Former Staff Engineer; understands technical depth but is constrained by operational time.
- **Mindset:** Overwhelmed by screening interviews, frustrated by unverified resume claims and inconsistent interviewer calibration across team members.

```text
"My senior engineers spend 15 hours a week conducting phone screens. I need an objective,
evidence-backed evaluation before I pull my team into an on-site interview."
```

### Strategic Alignment
In Phase 7+, the platform enables David to invite candidates to structured assessment sessions where candidate scaffolding (`SIMPLIFY`) is disabled and evidence-backed dossiers are exported directly to his ATS.

---

## 4. Operational & Governance Persona: Platform Compliance Auditor

### Profile: Sarah Jenkins
- **Current Role:** Lead Security & Compliance Officer
- **Focus:** AI Governance, Data Privacy, Security Audits (GDPR, EU AI Act, SOC 2)

```text
"Every score must be strictly traceable to transcript text, and candidate audio must have
explicit consent and strict retention policies."
```

### Strategic Alignment
Focusing the MVP on **Candidate Practice** eliminates high-stakes employment liability (NYC Local Law 144, EU AI Act high-risk classification). If enterprise screening is activated in Phase 7+, independent bias audits and candidate notifications are required before deployment.
