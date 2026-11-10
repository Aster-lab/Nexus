from recommendation.prediction.integration import attach_predictions
from feature_contract import FEATURE_NAMES


def build_feature_rows(loans):
    """Build ML input rows in the exact order expected by RiskEngine."""
    rows = []

    for loan in loans:
        features = loan.get("ml_features")

        if not isinstance(features, dict):
            raise ValueError(
                f"Loan {loan.get('loan_id')} is missing 'ml_features'"
            )

        missing = [
            name for name in FEATURE_NAMES
            if name not in features
        ]

        if missing:
            raise ValueError(
                f"Loan {loan.get('loan_id')} is missing ML features: "
                f"{', '.join(missing)}"
            )

        rows.append([features[name] for name in FEATURE_NAMES])

    return rows


def predict_and_attach(engine, loans):
    """Predict risk for each loan and attach results by loan order."""
    if not loans:
        return []

    feature_rows = build_feature_rows(loans)
    predictions = engine.predict_risk(feature_rows)

    if len(predictions) != len(loans):
        raise ValueError(
            "Prediction count does not match the number of loans"
        )

    predictions_with_ids = [
        {
            "loan_id": loan["loan_id"],
            **prediction,
        }
        for loan, prediction in zip(loans, predictions)
    ]

    return attach_predictions(loans, predictions_with_ids)
