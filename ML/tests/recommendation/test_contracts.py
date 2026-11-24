import pytest
import json
from datetime import datetime
from pathlib import Path
from pydantic import ValidationError

from recommendation.contracts import (
    InvestorPreferenceContract,
    LoanComparedEventContract,
    LoanViewedEventContract,
    RecommendationResultExplanationContract,
    RecommendationRunPreferenceSnapshot,
    RecommendationRunCandidateSnapshot,
)


VALID_PREFERENCE = {
    "schema_version": "nexus_investor_preference.v1",
    "risk_tier": ["TIER_B", "TIER_C"],
    "interest_rate": {"min": 8, "max": 12},
    "loan_duration": {"min": 6, "max": 36},
    "investment_amount": {"min": 500, "max": 5000},
    "loan_purpose": ["business", "education"],
}


def test_investor_preference_contract():
    value = InvestorPreferenceContract.model_validate(VALID_PREFERENCE)
    assert value.interest_rate.max == 12


def test_preference_rejects_unknown_schema_version_and_extra_fields():
    with pytest.raises(ValidationError):
        InvestorPreferenceContract.model_validate({**VALID_PREFERENCE, "schema_version": "v2"})
    with pytest.raises(ValidationError):
        InvestorPreferenceContract.model_validate({**VALID_PREFERENCE, "unknown": True})


def test_preference_rejects_invalid_range_order_and_category():
    value = {**VALID_PREFERENCE, "interest_rate": {"min": 15, "max": 10}}
    with pytest.raises(ValidationError):
        InvestorPreferenceContract.model_validate(value)
    value = {**VALID_PREFERENCE, "risk_tier": ["TIER_X"]}
    with pytest.raises(ValidationError):
        InvestorPreferenceContract.model_validate(value)


def test_recommendation_explanation_contract():
    explanation = RecommendationResultExplanationContract.model_validate({
        "schema_version": "nexus_recommendation_explanation.v1",
        "algorithm": "content_based_cosine_similarity",
        "feature_scores": {
            "risk_tier": 1.0,
            "interest_rate": 0.8,
            "loan_duration": 0.5,
            "loan_amount": 0.9,
            "loan_purpose": 1.0,
        },
    })
    assert len(explanation.feature_scores) == 5


def test_explanation_rejects_missing_score_or_out_of_range_value():
    payload = {
        "schema_version": "nexus_recommendation_explanation.v1",
        "algorithm": "content_based_cosine_similarity",
        "feature_scores": {"risk_tier": 1.2},
    }
    with pytest.raises(ValidationError):
        RecommendationResultExplanationContract.model_validate(payload)


def test_preference_snapshot_is_versioned_and_timezone_aware():
    snapshot = RecommendationRunPreferenceSnapshot.model_validate({
        "schema_version": "nexus_recommendation_preferences_snapshot.v1",
        "captured_at": "2026-11-05T12:00:00+07:00",
        "preferences": VALID_PREFERENCE,
    })
    assert snapshot.preferences.schema_version == "nexus_investor_preference.v1"
    with pytest.raises(ValidationError):
        RecommendationRunPreferenceSnapshot.model_validate({
            "schema_version": "nexus_recommendation_preferences_snapshot.v1",
            "captured_at": "2026-11-05T12:00:00",
            "preferences": VALID_PREFERENCE,
        })


def test_candidate_snapshot_contract_matches_repository_loan_fixture():
    fixture = Path(__file__).resolve().parents[1] / "fixtures" / "recommendation" / "loan.json"
    loans = json.loads(fixture.read_text(encoding="utf-8"))
    snapshot = RecommendationRunCandidateSnapshot.model_validate({
        "schema_version": "nexus_recommendation_candidates_snapshot.v1",
        "captured_at": "2026-11-05T12:00:00+07:00",
        "candidates": loans,
    })
    assert len(snapshot.candidates) == 4


def test_loan_viewed_event_contract():
    event = LoanViewedEventContract.model_validate({
        "event_type": "LOAN_VIEWED",
        "loan_id": "123e4567-e89b-12d3-a456-426614174000",
        "event_data": {
            "schema_version": "nexus_investor_behavior.v1",
            "surface": "marketplace",
        },
    })
    assert event.event_type == "LOAN_VIEWED"


def test_loan_compared_event_contract():
    event = LoanComparedEventContract.model_validate({
        "event_type": "LOAN_COMPARED",
        "loan_id": "123e4567-e89b-12d3-a456-426614174000",
        "event_data": {
            "schema_version": "nexus_investor_behavior.v1",
            "surface": "recommendations",
            "recommendation_run_id": "123e4567-e89b-12d3-a456-426614174001",
            "recommendation_position": 2,
            "comparison_id": "123e4567-e89b-12d3-a456-426614174002",
            "comparison_set_size": 3,
        },
    })
    assert event.event_data.comparison_set_size == 3


@pytest.mark.parametrize("event_data", [
    {"schema_version": "nexus_investor_behavior.v1", "surface": "marketplace", "dwell_ms": 5000},
    {"schema_version": "nexus_investor_behavior.v1", "surface": "saved_loans", "recommendation_position": 1},
])
def test_behavior_events_reject_extra_or_misplaced_recommendation_fields(event_data):
    with pytest.raises(ValidationError):
        LoanViewedEventContract.model_validate({
            "event_type": "LOAN_VIEWED",
            "loan_id": "123e4567-e89b-12d3-a456-426614174000",
            "event_data": event_data,
        })


def test_behavior_comparison_rejects_set_size_outside_two_to_three():
    with pytest.raises(ValidationError):
        LoanComparedEventContract.model_validate({
            "event_type": "LOAN_COMPARED",
            "loan_id": "123e4567-e89b-12d3-a456-426614174000",
            "event_data": {
                "schema_version": "nexus_investor_behavior.v1",
                "surface": "marketplace",
                "comparison_id": "123e4567-e89b-12d3-a456-426614174002",
                "comparison_set_size": 4,
            },
        })
