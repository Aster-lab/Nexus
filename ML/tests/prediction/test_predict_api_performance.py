
import math
import statistics
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
import pytest
from fastapi.testclient import TestClient

from main import app


VALID_APPLICATION = {
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
}

P95_LIMIT_MS = 250.0


@pytest.fixture(scope="module")
def api_client():
    with TestClient(app) as client:
        yield client


def percentile(values, percentile_value):
    ordered = sorted(values)
    index = math.ceil(
        percentile_value / 100 * len(ordered)
    ) - 1
    return ordered[max(index, 0)]


def run_benchmark(client, payload, iterations=100):
    latencies = []
    failures = []

    # Warm-up: allow initial model/runtime overhead to settle.
    for _ in range(5):
        response = client.post("/predict", json=payload)
        assert response.status_code == 200

    for iteration in range(iterations):
        start = time.perf_counter()

        response = client.post("/predict", json=payload)

        elapsed_ms = (
            time.perf_counter() - start
        ) * 1000

        if response.status_code != 200:
            failures.append({
                "iteration": iteration,
                "status_code": response.status_code,
                "body": response.text,
            })
        else:
            latencies.append(elapsed_ms)

    assert not failures, f"API failures: {failures}"

    return {
        "count": len(latencies),
        "p50_ms": statistics.median(latencies),
        "p95_ms": percentile(latencies, 95),
        "max_ms": max(latencies),
        "mean_ms": statistics.mean(latencies),
    }


def test_single_prediction_http_performance(api_client):
    results = run_benchmark(
        api_client,
        VALID_APPLICATION,
        iterations=100,
    )

    print("\nSingle prediction HTTP benchmark:")
    for metric, value in results.items():
        print(f"{metric}: {value}")

    assert results["p95_ms"] < P95_LIMIT_MS


@pytest.mark.parametrize("batch_size", [5, 10])
def test_batch_prediction_http_performance(api_client, batch_size):
    payload = [
        VALID_APPLICATION.copy()
        for _ in range(batch_size)
    ]

    results = run_benchmark(
        api_client,
        payload,
        iterations=50,
    )

    per_application_p95 = (
        results["p95_ms"] / batch_size
    )

    print(f"\nBatch size: {batch_size}")
    print(f"Total P50: {results['p50_ms']:.2f} ms")
    print(f"Total P95: {results['p95_ms']:.2f} ms")
    print(f"Maximum: {results['max_ms']:.2f} ms")
    print(
        f"P95 per application: "
        f"{per_application_p95:.2f} ms"
    )

    assert results["count"] == 50
    assert results["p95_ms"] < P95_LIMIT_MS

def test_concurrent_prediction_http_performance(api_client):
    concurrency_levels = [5, 10, 20]
    requests_per_level = 50

    for workers in concurrency_levels:
        latencies = []
        failures = []

        def send_request():
            start = time.perf_counter()

            response = api_client.post(
                "/predict",
                json=VALID_APPLICATION,
            )

            elapsed_ms = (
                time.perf_counter() - start
            ) * 1000

            return response, elapsed_ms

        with ThreadPoolExecutor(
            max_workers=workers
        ) as executor:

            futures = [
                executor.submit(send_request)
                for _ in range(requests_per_level)
            ]

            for future in as_completed(futures):
                try:
                    response, elapsed_ms = future.result()

                    if response.status_code != 200:
                        failures.append(response.status_code)
                    else:
                        latencies.append(elapsed_ms)

                except Exception as exc:
                    failures.append(str(exc))

        assert not failures, (
            f"{workers} concurrent requests failed: "
            f"{failures}"
        )

        p50 = statistics.median(latencies)
        p95 = percentile(latencies, 95)
        maximum = max(latencies)

        print(f"\nConcurrency level: {workers}")
        print(f"Successful requests: {len(latencies)}")
        print(f"P50: {p50:.2f} ms")
        print(f"P95: {p95:.2f} ms")
        print(f"Maximum: {maximum:.2f} ms")

        assert len(latencies) == requests_per_level
        assert p95 < P95_LIMIT_MS
