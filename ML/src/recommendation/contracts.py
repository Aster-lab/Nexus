"""Versioned JSON contracts for marketplace preference and score metadata."""

from datetime import datetime
from typing import Annotated, Literal, Union
from uuid import UUID
from pydantic import StrictFloat, StrictInt, StrictStr, field_validator

from pydantic import BaseModel, ConfigDict, Field, model_validator

AmountValue = Union[StrictInt, StrictFloat]


class NumericRange(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    min: float = Field(ge=0, allow_inf_nan=False)
    max: float = Field(ge=0, allow_inf_nan=False)

    @model_validator(mode="after")
    def validate_order(self):
        if self.min > self.max:
            raise ValueError("range min must not exceed max")
        return self


class InvestorPreferenceContract(BaseModel):
    """Shape for InvestorPreference.preferenceData JSON."""
    model_config = ConfigDict(extra="forbid", strict=True)

    schema_version: Literal["nexus_investor_preference.v1"]
    risk_tier: list[Literal["TIER_A", "TIER_B", "TIER_C", "TIER_D"]] = Field(min_length=1)
    interest_rate: NumericRange
    loan_duration: NumericRange
    investment_amount: NumericRange
    loan_purpose: list[Literal["business", "education", "medical", "personal", "home", "other"]] = Field(min_length=1)


class RecommendationRunPreferenceSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schema_version: Literal["nexus_recommendation_preferences_snapshot.v1"]
    captured_at: str
    preferences: InvestorPreferenceContract

    @field_validator("captured_at")
    @classmethod
    def require_aware_capture_time(cls, value: str) -> str:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None or parsed.utcoffset() is None:
            raise ValueError("captured_at must include a timezone")
        return value


class CandidateInvestmentRange(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    min: AmountValue = Field(ge=0)
    max: AmountValue = Field(gt=0)


class CandidateAmount(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    total: AmountValue = Field(gt=0)
    funded: AmountValue = Field(ge=0)
    remaining: AmountValue = Field(ge=0)
    investment: CandidateInvestmentRange


class RecommendationCandidateTerms(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    interest_rate: AmountValue = Field(ge=0)
    loan_duration: StrictInt = Field(gt=0)
    loan_purpose: Literal["business", "education", "medical", "personal", "home", "other"]


class RecommendationCandidateTier(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    tier_code: Literal["TIER_A", "TIER_B", "TIER_C", "TIER_D"]
    tier_name: StrictStr
    risk_level: StrictStr
    action_code: Literal["APPROVE", "MANUAL_REVIEW", "DECLINED"]
    rate_markup: AmountValue
    ui_badge_color: StrictStr


class RecommendationCandidateSpatialMetrics(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    macro_cluster: StrictInt
    quantization_distance: AmountValue = Field(ge=0)


class RecommendationCandidatePrediction(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    default_probability: AmountValue = Field(ge=0, le=1)
    tier: RecommendationCandidateTier
    spatial_metrics: RecommendationCandidateSpatialMetrics


class RecommendationCandidateRestrictions(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    allowed_investor_types: list[StrictStr] = Field(min_length=1)
    allowed_countries: list[StrictStr] = Field(min_length=1)
    minimum_age: StrictInt = Field(ge=0)
    qualified_investor_required: bool


class RecommendationCandidateTiming(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    opens_at: str
    closes_at: str

    @field_validator("opens_at", "closes_at")
    @classmethod
    def require_aware_timestamp(cls, value: str) -> str:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None or parsed.utcoffset() is None:
            raise ValueError("candidate timestamps must include timezone offsets")
        return value


class RecommendationCandidate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    loan_id: Union[StrictInt, StrictStr]
    borrower_id: Union[StrictInt, StrictStr]
    status: Literal["DRAFT", "OPEN", "FUNDED", "CANCELLED", "EXPIRED"]
    amount: CandidateAmount
    terms: RecommendationCandidateTerms
    prediction: RecommendationCandidatePrediction
    restrictions: RecommendationCandidateRestrictions
    timing: RecommendationCandidateTiming


class RecommendationRunCandidateSnapshot(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schema_version: Literal["nexus_recommendation_candidates_snapshot.v1"]
    captured_at: str
    candidates: list[RecommendationCandidate]

    @field_validator("captured_at")
    @classmethod
    def require_aware_capture_time(cls, value: str) -> str:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None or parsed.utcoffset() is None:
            raise ValueError("captured_at must include a timezone")
        return value

class RecommendationResultExplanationContract(BaseModel):
    """Explainable score components stored in RecommendationResult.explanation."""
    model_config = ConfigDict(extra="forbid", strict=True)

    schema_version: Literal["nexus_recommendation_explanation.v1"]
    algorithm: Literal["content_based_cosine_similarity"]
    feature_scores: dict[
        Literal["risk_tier", "interest_rate", "loan_duration", "loan_amount", "loan_purpose"],
        float,
    ]

    @model_validator(mode="after")
    def validate_complete(self):
        expected = {"risk_tier", "interest_rate", "loan_duration", "loan_amount", "loan_purpose"}
        if set(self.feature_scores) != expected:
            raise ValueError("feature_scores must contain exactly the five recommendation components")
        if any(not 0 <= score <= 1 for score in self.feature_scores.values()):
            raise ValueError("each feature score must be between 0 and 1")
        return self


class InvestorBehaviorEventData(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    schema_version: Literal["nexus_investor_behavior.v1"]
    surface: Literal["marketplace", "recommendations", "saved_loans"]
    recommendation_run_id: UUID | None = Field(default=None, strict=False)
    recommendation_position: StrictInt | None = Field(default=None, ge=1)

    @model_validator(mode="after")
    def validate_recommendation_context(self):
        if self.surface != "recommendations" and (
            self.recommendation_run_id is not None
            or self.recommendation_position is not None
        ):
            raise ValueError("recommendation context is allowed only for recommendations surface")
        return self


class LoanViewedEventContract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    event_type: Literal["LOAN_VIEWED"]
    loan_id: UUID = Field(strict=False)
    event_data: InvestorBehaviorEventData


class LoanComparedEventData(InvestorBehaviorEventData):
    comparison_id: UUID = Field(strict=False)
    comparison_set_size: StrictInt = Field(ge=2, le=3)


class LoanComparedEventContract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    event_type: Literal["LOAN_COMPARED"]
    loan_id: UUID = Field(strict=False)
    event_data: LoanComparedEventData


InvestorBehaviorEventContract = Annotated[
    Union[LoanViewedEventContract, LoanComparedEventContract],
    Field(discriminator="event_type"),
]
