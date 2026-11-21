from contextlib import asynccontextmanager
from fastapi.testclient import TestClient

import main


SERVICE_TOKEN = "api06-ml-contract-test-token-32-bytes"


REQUEST = {
    "schema_version": "nexus_investor_recommendation_request.v1",
    "preferences": {
        "schema_version": "nexus_investor_preference.v1",
        "risk_tier": ["TIER_A", "TIER_B"],
        "interest_rate": {"min": 5, "max": 25},
        "loan_duration": {"min": 3, "max": 36},
        "investment_amount": {"min": 10000, "max": 50000},
        "loan_purpose": ["education", "business"],
    },
    "candidates": [
        {
            "loan_id": "1f7cfe18-3ecc-4bd6-b0ac-dca9a1bc0a10",
            "principal_satang": 2000000,
            "funded_satang": 500000,
            "annual_interest_rate": 0.12,
            "term_months": 12,
            "loan_purpose": "education",
            "risk_tier": "TIER_A",
        }
    ],
}


def client(monkeypatch):
    monkeypatch.setenv("ML_SERVICE_TOKEN", SERVICE_TOKEN)

    @asynccontextmanager
    async def test_lifespan(app):
        yield

    monkeypatch.setattr(main.app.router, "lifespan_context", test_lifespan)
    return TestClient(main.app)


def test_dynamic_recommendation_contract_scores_only_supplied_candidates(monkeypatch):
    test_client = client(monkeypatch)
    response = test_client.post(
        "/recommendations",
        json=REQUEST,
        headers={"X-ML-Service-Token": SERVICE_TOKEN},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["schema_version"] == "nexus_investor_recommendation_response.v1"
    assert [item["loan_id"] for item in body["recommendations"]] == [
        REQUEST["candidates"][0]["loan_id"]
    ]
    assert set(body["recommendations"][0]["feature_scores"]) == {
        "risk_tier",
        "interest_rate",
        "loan_duration",
        "loan_amount",
        "loan_purpose",
    }


def test_dynamic_recommendations_require_service_authentication(monkeypatch):
    test_client = client(monkeypatch)
    response = test_client.post("/recommendations", json=REQUEST)
    assert response.status_code == 401


def test_dynamic_recommendations_reject_unknown_fields(monkeypatch):
    test_client = client(monkeypatch)
    invalid = {**REQUEST, "investor_id": "private-user-id"}
    response = test_client.post(
        "/recommendations",
        json=invalid,
        headers={"X-ML-Service-Token": SERVICE_TOKEN},
    )
    assert response.status_code == 422


def test_dynamic_recommendations_reject_invalid_candidate_values(monkeypatch):
    test_client = client(monkeypatch)
    invalid = {**REQUEST, "candidates": [{**REQUEST["candidates"][0], "risk_tier": "UNKNOWN"}]}
    response = test_client.post(
        "/recommendations",
        json=invalid,
        headers={"X-ML-Service-Token": SERVICE_TOKEN},
    )
    assert response.status_code == 422
