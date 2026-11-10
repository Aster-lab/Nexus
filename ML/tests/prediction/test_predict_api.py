
import pytest
import asyncio
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, Mock
from contextlib import asynccontextmanager

import main


VALID_APPLICATION = {
    "annual_income": 75000.0,
    "dti": 16.5,
    "loan_amount": 12000.0,
    "acc_open_past_24mths": 2.0,
    "bc_util": 0.195,
    "lti": 0.16,
    "interest_burden": 0.0184,
    "sub_grade_num": 12.0,
    "int_rate": 0.115,
    "revol_util": 0.382,
    "term_months": 36.0,
}
SERVICE_TOKEN = "test-ml-service-token-32-bytes-minimum"


def mock_prediction(probability=0.10):
    return {
        "default_probability": probability,
        "tier": {
            "tier_code": "TIER_A",
            "tier_name": "Tier A",
            "risk_level": "LOW",
            "action_code": "APPROVE",
            "rate_markup": 0.0,
            "ui_badge_color": "green",
        },
        "spatial_metrics": {
            "macro_cluster": 2,
            "quantization_distance": 0.15,
        },
    }


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("ML_SERVICE_TOKEN", SERVICE_TOKEN)
    mock_engine = MagicMock()

    mock_engine.predict_risk.side_effect = (
        lambda batch: [
            mock_prediction()
            for _ in batch
        ]
    )

    @asynccontextmanager
    async def test_lifespan(app):
        yield

    monkeypatch.setattr(main.app.router, "lifespan_context", test_lifespan)
    monkeypatch.setattr(main, "engine", mock_engine)

    with TestClient(main.app, headers={"X-ML-Service-Token": SERVICE_TOKEN}) as test_client:
        yield test_client, mock_engine


def test_single_valid_application(client):
    test_client, _ = client

    response = test_client.post(
        "/predict",
        json=VALID_APPLICATION,
    )

    assert response.status_code == 200

    body = response.json()

    assert body["status"] == "success"
    assert body["processed_count"] == 1
    assert len(body["data"]) == 1
    assert body["data"][0]["index"] == 0


def test_batch_of_three_valid_applications(client):
    test_client, mock_engine = client

    response = test_client.post(
        "/predict",
        json=[
            VALID_APPLICATION,
            VALID_APPLICATION,
            VALID_APPLICATION,
        ],
    )

    assert response.status_code == 200

    body = response.json()

    assert body["status"] == "success"
    assert body["processed_count"] == 3
    assert len(body["data"]) == 3

    mock_engine.predict_risk.assert_called_once()


def test_invalid_application_returns_422(client):
    test_client, mock_engine = client

    invalid = VALID_APPLICATION.copy()
    invalid["annual_income"] = -100

    response = test_client.post(
        "/predict",
        json=invalid,
    )

    assert response.status_code == 422
    mock_engine.predict_risk.assert_not_called()


def test_mixed_batch_returns_partial_success(client):
    test_client, _ = client

    invalid = VALID_APPLICATION.copy()
    invalid["annual_income"] = -100

    response = test_client.post(
        "/predict",
        json=[
            VALID_APPLICATION,
            invalid,
            VALID_APPLICATION,
        ],
    )

    assert response.status_code == 200

    body = response.json()

    assert body["status"] == "partial_success"
    assert body["processed_count"] == 2

    assert [
        item["index"] for item in body["data"]
    ] == [0, 2]

    assert body["errors"][0]["index"] == 1


def test_empty_batch_returns_422(client):
    test_client, _ = client

    response = test_client.post(
        "/predict",
        json=[],
    )

    assert response.status_code == 422


def test_unknown_fields_are_rejected(client):
    test_client, mock_engine = client

    invalid = VALID_APPLICATION.copy()
    invalid["unknown_field"] = 123

    response = test_client.post(
        "/predict",
        json=invalid,
    )

    assert response.status_code == 422
    mock_engine.predict_risk.assert_not_called()


def test_boolean_input_is_rejected(client):
    test_client, mock_engine = client

    invalid = VALID_APPLICATION.copy()
    invalid["annual_income"] = True

    response = test_client.post(
        "/predict",
        json=invalid,
    )

    assert response.status_code == 422
    mock_engine.predict_risk.assert_not_called()


def test_non_whole_term_is_rejected(client):
    test_client, mock_engine = client

    invalid = VALID_APPLICATION.copy()
    invalid["term_months"] = 36.5

    response = test_client.post(
        "/predict",
        json=invalid,
    )

    assert response.status_code == 422
    mock_engine.predict_risk.assert_not_called()


@pytest.mark.parametrize("field", ["bc_util", "revol_util"])
def test_utilization_above_proportion_range_is_rejected(client, field):
    test_client, mock_engine = client
    invalid = VALID_APPLICATION.copy()
    invalid[field] = 19.5

    response = test_client.post("/predict", json=invalid)

    assert response.status_code == 422
    mock_engine.predict_risk.assert_not_called()


def test_missing_feature_is_rejected(client):
    test_client, mock_engine = client
    invalid = VALID_APPLICATION.copy()
    del invalid["lti"]

    response = test_client.post("/predict", json=invalid)

    assert response.status_code == 422
    mock_engine.predict_risk.assert_not_called()


@pytest.mark.parametrize("field", [
    "annual_income", "dti", "loan_amount", "acc_open_past_24mths",
    "bc_util", "lti", "interest_burden", "sub_grade_num", "int_rate",
    "revol_util", "term_months",
])
def test_numeric_strings_are_rejected(client, field):
    test_client, mock_engine = client
    invalid = VALID_APPLICATION.copy()
    invalid[field] = str(invalid[field])

    response = test_client.post("/predict", json=invalid)

    assert response.status_code == 422
    mock_engine.predict_risk.assert_not_called()


def test_engine_unavailable_returns_500(monkeypatch):
    monkeypatch.setenv("ML_SERVICE_TOKEN", SERVICE_TOKEN)
    @asynccontextmanager
    async def test_lifespan(app):
        yield

    monkeypatch.setattr(
        main.app.router,
        "lifespan_context",
        test_lifespan,
    )
    monkeypatch.setattr(main, "engine", None)

    with TestClient(main.app, headers={"X-ML-Service-Token": SERVICE_TOKEN}) as test_client:
        response = test_client.post(
            "/predict",
            json=VALID_APPLICATION,
        )

    assert response.status_code == 500


def test_inference_failure_returns_500(client):
    test_client, mock_engine = client

    mock_engine.predict_risk.side_effect = RuntimeError(
        "Simulated model failure"
    )

    response = test_client.post(
        "/predict",
        json=VALID_APPLICATION,
    )

    assert response.status_code == 500
    assert response.json()["detail"]["error_code"] == (
        "INFERENCE_FAILED"
    )


def test_prediction_count_mismatch_returns_500(client):
    test_client, mock_engine = client

    # Clear the fixture's side_effect; it takes precedence over return_value.
    mock_engine.predict_risk.side_effect = None
    mock_engine.predict_risk.return_value = []

    response = test_client.post("/predict", json=VALID_APPLICATION)

    assert response.status_code == 500
    assert response.json()["detail"]["error_code"] == "INFERENCE_FAILED"

def test_non_object_application_returns_validation_error(client):
    test_client, mock_engine = client

    response = test_client.post(
        "/predict",
        json=[123],
    )

    assert response.status_code == 422

    detail = response.json()["detail"]

    assert detail["error_code"] == "BATCH_VALIDATION_FAILED"
    assert detail["errors"][0]["error_code"] == "VALIDATION_ERROR"
    assert detail["errors"][0]["details"][0]["message"] == (
        "Each application must be a JSON object"
    )

    mock_engine.predict_risk.assert_not_called()

#model initialization
def test_lifespan_initializes_engine(monkeypatch):
    fake_engine = Mock()

    monkeypatch.setattr(
        main,
        "RiskEngine",
        lambda **kwargs: fake_engine,
    )

    async def run_lifespan():
        async with main.lifespan(main.app):
            assert main.engine is fake_engine
        assert main.engine is None

    asyncio.run(run_lifespan())


def test_predict_requires_service_token(monkeypatch):
    monkeypatch.setenv("ML_SERVICE_TOKEN", SERVICE_TOKEN)
    with TestClient(main.app) as test_client:
        response = test_client.post("/predict", json=VALID_APPLICATION)
    assert response.status_code == 401


def test_predict_fails_closed_when_service_token_is_unconfigured(monkeypatch):
    monkeypatch.delenv("ML_SERVICE_TOKEN", raising=False)
    with TestClient(main.app) as test_client:
        response = test_client.post(
            "/predict",
            json=VALID_APPLICATION,
            headers={"X-ML-Service-Token": SERVICE_TOKEN},
        )
    assert response.status_code == 503


def test_service_token_dependency_accepts_configured_token(monkeypatch):
    monkeypatch.setenv("ML_SERVICE_TOKEN", SERVICE_TOKEN)
    assert main.require_ml_service_token(SERVICE_TOKEN) is None


def test_service_token_dependency_rejects_invalid_token(monkeypatch):
    from fastapi import HTTPException

    monkeypatch.setenv("ML_SERVICE_TOKEN", SERVICE_TOKEN)
    with pytest.raises(HTTPException) as error:
        main.require_ml_service_token("wrong-token")
    assert error.value.status_code == 401


def test_service_token_dependency_fails_closed_without_configuration(monkeypatch):
    from fastapi import HTTPException

    monkeypatch.delenv("ML_SERVICE_TOKEN", raising=False)
    with pytest.raises(HTTPException) as error:
        main.require_ml_service_token(SERVICE_TOKEN)
    assert error.value.status_code == 503

def test_lifespan_initialization_failure(monkeypatch):
    def raise_initialization_error(**kwargs):
        raise RuntimeError("Model loading failed")

    monkeypatch.setattr(
        main,
        "RiskEngine",
        raise_initialization_error,
    )

    async def run_lifespan():
        async with main.lifespan(main.app):
            pass

    with pytest.raises(RuntimeError, match="Model loading failed"):
        asyncio.run(run_lifespan())

    assert main.engine is None

# health check
def test_health_check_when_engine_is_online(client):
    test_client, mock_engine = client

    response = test_client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "healthy",
        "model_engine": "online",
    }

def test_health_check_when_engine_is_unavailable(client):
    test_client, mock_engine = client

    main.engine = None

    response = test_client.get("/health")

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "Risk Engine is uninitialized or degraded."
    )

