"""Pydantic schemas for Resume Rewriting, Multi-Template LaTeX Generation, and Cover Letters."""

from typing import Any, Literal

from pydantic import BaseModel, Field

TemplateStyle = Literal["jakes_resume", "modern_tech", "executive_serif", "minimalist_sans"]


class ExperienceItem(BaseModel):
    """Structured work experience record."""

    company: str = Field(..., description="Company or organization name")
    position: str = Field(..., description="Job title / role")
    location: str = Field(default="", description="City, State / Remote")
    dates: str = Field(default="", description="Employment date range (e.g. 2021 - Present)")
    highlights: list[str] = Field(default_factory=list, description="Bullet points of achievements")


class ProjectItem(BaseModel):
    """Structured technical project record."""

    name: str = Field(..., description="Project title")
    technologies: str = Field(default="", description="Key technologies used")
    dates: str = Field(default="", description="Project dates or status")
    highlights: list[str] = Field(default_factory=list, description="Bullet points of contributions")


class EducationItem(BaseModel):
    """Structured education record."""

    institution: str = Field(..., description="University or educational institution")
    degree: str = Field(..., description="Degree and major (e.g. B.S. in Computer Science)")
    location: str = Field(default="", description="City, State or Country")
    dates: str = Field(default="", description="Graduation year or date range")


def _default_skills_map() -> dict[str, list[str]]:
    return {
        "Languages": [],
        "Frameworks": [],
        "Developer Tools": [],
        "Databases & Cloud": [],
    }


class RewrittenResumeProfile(BaseModel):
    """Complete normalized resume profile ready for LaTeX compilation."""

    full_name: str = Field(default="Candidate Name")
    contact_phone: str = Field(default="")
    contact_email: str = Field(default="")
    linkedin_url: str = Field(default="")
    github_url: str = Field(default="")
    location: str = Field(default="")
    summary: str = Field(default="")
    skills_by_category: dict[str, list[str]] = Field(default_factory=_default_skills_map)
    experiences: list[ExperienceItem] = Field(default_factory=list)
    projects: list[ProjectItem] = Field(default_factory=list)
    education: list[EducationItem] = Field(default_factory=list)


class RewriteSuggestionItem(BaseModel):
    """Individual section or bullet rewrite suggestion with rationale and fact-checking."""

    section: str = Field(..., description="Section name: summary, experience, projects, or skills")
    target_item: str = Field(..., description="Identifier (e.g. Company name or Project title)")
    original_text: str = Field(..., description="Candidate's original text")
    rewritten_text: str = Field(..., description="Targeted rewrite optimized for the JD")
    rationale: str = Field(..., description="Explanation citing specific JD requirements or keywords")
    matched_keywords: list[str] = Field(default_factory=list, description="JD keywords incorporated")
    fact_preserved: bool = Field(
        default=True,
        description="True if all metrics, companies, and claims are factually anchored to original resume",
    )


class TemplateMetadata(BaseModel):
    """Metadata describing a supported LaTeX resume template."""

    id: TemplateStyle
    name: str
    description: str
    font_family: str
    ats_rating: str
    recommended_for: str


class ResumeRewriteRequest(BaseModel):
    """Payload to trigger ATS scoring, suggestion generation, and LaTeX template rendering."""

    resume_text: str = Field(..., min_length=20, description="Raw text of the candidate's resume")
    jd_text: str = Field(..., min_length=20, description="Target Job Description text")
    candidate_seniority: str = Field(default="SENIOR", description="Seniority level (JUNIOR, MID, SENIOR, STAFF)")
    template_style: TemplateStyle = Field(default="jakes_resume", description="Selected LaTeX template layout")


class RenderLatexRequest(BaseModel):
    """Render LaTeX directly from an edited profile and chosen template."""

    profile: RewrittenResumeProfile = Field(..., description="Structured resume profile")
    template_style: TemplateStyle = Field(default="jakes_resume", description="Selected LaTeX template layout")


class RenderLatexResponse(BaseModel):
    """Rendered LaTeX document output."""

    latex_source: str = Field(..., description="Ready-to-compile LaTeX source code")
    template_style: TemplateStyle = Field(..., description="Template used")


class PageFitEstimate(BaseModel):
    """Estimates document length and page density."""

    total_bullets: int
    total_characters: int
    estimated_pages: int
    density_status: str
    fit_recommendation: str


class ResumeRewriteResponse(BaseModel):
    """Comprehensive response providing score first, rewrite suggestions, and multi-template LaTeX source."""

    ats_score: int = Field(..., ge=0, le=100, description="Overall ATS compatibility score (0-100)")
    ats_breakdown: dict[str, Any] = Field(
        default_factory=dict,
        description="Sub-scores: keyword_score, experience_score, impact_score, brevity_score",
    )
    alignment_summary: str = Field(..., description="Executive summary of candidate-to-JD fit")
    matched_keywords: list[str] = Field(default_factory=list, description="Keywords already present")
    missing_keywords: list[str] = Field(default_factory=list, description="High-priority JD keywords to weave in")
    suggestions: list[RewriteSuggestionItem] = Field(
        default_factory=list,
        description="List of section-by-section rewrite suggestions with explanations",
    )
    latex_source: str = Field(..., description="Ready-to-compile Overleaf LaTeX document source")
    template_style: TemplateStyle = Field(default="jakes_resume", description="Active template")
    available_templates: list[TemplateMetadata] = Field(default_factory=list, description="Supported template list")
    page_fit: PageFitEstimate = Field(..., description="Estimated page length and density metrics")
    cover_letter_text: str = Field(default="", description="Targeted tailored cover letter text")
    cover_letter_latex: str = Field(default="", description="Overleaf LaTeX cover letter source")
    rewritten_profile: RewrittenResumeProfile = Field(..., description="Structured parsed profile")
