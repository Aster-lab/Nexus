from recommendation.prediction.ml_adapter import predict_and_attach


def assess_loan(engine, loan):
    """Assess a single loan and return it with its ML prediction."""
    assessed_loans = predict_and_attach(engine, [loan])

    if len(assessed_loans) != 1:
        raise ValueError(
            "Expected exactly one assessed loan"
        )

    return assessed_loans[0]