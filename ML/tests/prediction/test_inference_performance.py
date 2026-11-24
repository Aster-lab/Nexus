
import time
import numpy as np
import pytest

from predict import RiskEngine


@pytest.fixture(scope="module")
def predictor():
    return RiskEngine(model_dir="models")


def test_inference_latency(predictor):
    sample = [
        60000,
        25.0,
        10000,
        3,
        40.0,
        0.17,
        0.03,
        15,
        0.105,
        45.0,
        36,
    ]

    for _ in range(10):
        predictor.predict_risk(sample)

    timings = []

    for _ in range(100):
        start = time.perf_counter()

        predictor.predict_risk(sample)

        elapsed = time.perf_counter() - start

        timings.append(elapsed * 1000)

    p50 = np.percentile(timings, 50)
    p95 = np.percentile(timings, 95)
    maximum = max(timings)

    print(f"\nInference P50: {p50:.2f} ms")
    print(f"Inference P95: {p95:.2f} ms")
    print(f"Inference maximum: {maximum:.2f} ms")

    assert p95 < 250, (
        f"Inference P95 ({p95:.2f} ms) "
        "exceeds the 250 ms requirement."
    )
