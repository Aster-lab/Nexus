
import pytest
from fastapi.testclient import TestClient

from main import app


VALID_APPLICATION = {
    "annual_income": 75000,
    "dti": 25.0,
    "loan_amount": 15000,
    "acc_open_past_24mths": 4,
    "bc_util": 0.35,
    "lti": 0.20,
    "interest_burden": 0.021,
    "sub_grade_num": 5,
    "int_rate": 0.105,
    "revol_util": 0.40,
    "term_months": 36,
}
SERVICE_TOKEN = "test-ml-service-token-32-bytes-minimum"


@pytest.fixture(scope="module")
def real_api_client():
    import os
    os.environ["ML_SERVICE_TOKEN"] = SERVICE_TOKEN
    with TestClient(app, headers={"X-ML-Service-Token": SERVICE_TOKEN}) as test_client:
        yield test_client


def test_predict_endpoint_with_real_model(real_api_client):
    response = real_api_client.post(
        "/predict",
        json=VALID_APPLICATION,
    )

    assert response.status_code == 200

    body = response.json()

    assert body["status"] == "success"
    assert body["processed_count"] == 1
    assert len(body["data"]) == 1
    assert body["errors"] == []

    prediction = body["data"][0]["prediction"]

    assert isinstance(prediction, dict)
    assert prediction
