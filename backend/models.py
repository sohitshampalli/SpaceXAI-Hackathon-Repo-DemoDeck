"""Request and pipeline data shapes for Demo to Deck."""

from typing import Literal

from pydantic import BaseModel, Field


Severity = Literal["high", "medium", "low"]
Category = Literal["cost", "efficiency", "risk", "growth", "compliance", "other"]
EnrichmentSource = Literal["firecrawl", "exa", "none"]


class PainPoint(BaseModel):
    id: str
    title: str
    description: str
    quote: str
    speaker_role: Literal["customer"]
    severity: Severity
    category: Category


class BuyingSignals(BaseModel):
    budget_mentioned: bool
    budget_detail: str | None = None
    decision_maker_present: bool
    timeline_mentioned: str | None = None


class Objection(BaseModel):
    objection: str
    handled_on_call: bool


class Analysis(BaseModel):
    company_name: str | None = None
    industry_guess: str
    call_summary: str
    pain_points: list[PainPoint] = Field(default_factory=list)
    buying_signals: BuyingSignals
    objections: list[Objection] = Field(default_factory=list)
    next_steps: list[str] = Field(default_factory=list)
    recommended_solution_angle: str


class EnrichmentResult(BaseModel):
    verified_description: str | None = None
    logo_url: str | None = None
    recent_news_snippet: str | None = None
    source: EnrichmentSource = "none"


class JobStatus(BaseModel):
    id: str
    status: str
    progress: int
    error: str | None = None
    preview_placeholder: bool = False
