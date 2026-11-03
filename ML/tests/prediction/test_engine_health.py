
import pytest
from fastapi.testclient import TestClient

import main



from contextlib import asynccontextmanager

@pytest.fixture
def client_with_engine_state(monkeypatch):
    @asynccontextmanager
    async def test_lifespan(app):
        yield

    monkeypatch.setattr(
        main.app.router,
        "lifespan_context",
        test_lifespan,
    )

    def make_client(engine):
        monkeypatch.setattr(main, "engine", engine)
        return TestClient(main.app)

    return make_client


def test_health_check_returns_healthy_when_engine_available(
    client_with_engine_state,
):
    fake_engine = object()

    with client_with_engine_state(fake_engine) as client:
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "healthy",
        "model_engine": "online",
    }


def test_health_check_returns_503_when_engine_unavailable(
    client_with_engine_state,
):
    with client_with_engine_state(None) as client:
        response = client.get("/health")

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "Risk Engine is uninitialized or degraded."
    )


def test_predict_returns_engine_unavailable_when_engine_is_none(
    client_with_engine_state,
):
    with client_with_engine_state(None) as client:
        response = client.post(
            "/predict",
            json={
                "annual_income": 75000,
                "dti": 0.25,
                "loan_amount": 15000,
                "acc_open_past_24mths": 4,
                "bc_util": 0.35,
                "lti": 0.20,
                "interest_burden": 0.08,
                "sub_grade_num": 5,
                "int_rate": 0.105,
                "revol_util": 0.40,
                "term_months": 36,
            },
        )

    assert response.status_code == 500

    detail = response.json()["detail"]

    assert detail["error_code"] == "ENGINE_UNAVAILABLE"
    assert detail["message"] == (
        "Prediction service is currently unavailable."
    )
