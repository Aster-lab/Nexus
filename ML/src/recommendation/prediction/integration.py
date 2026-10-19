import copy
def attach_predictions(loans, predictions):
    """Attach predictions to loans by loan_id without mutating inputs."""
    loan_ids = [loan["loan_id"] for loan in loans]
    if len(loan_ids) != len(set(loan_ids)):
        raise ValueError("Duplicate loan IDs found")

    prediction_by_id = {}

    for prediction in predictions:
        loan_id = prediction["loan_id"]

        if loan_id in prediction_by_id:
            raise ValueError(f"Duplicate prediction for loan ID {loan_id}")

        prediction_by_id[loan_id] = prediction

    loan_id_set = set(loan_ids)

    for prediction_id in prediction_by_id:
        if prediction_id not in loan_id_set:
            raise ValueError(
                f"Prediction references unknown loan ID {prediction_id}"
            )

    enriched_loans = []

    for loan in loans:
        loan_id = loan["loan_id"]

        if loan_id not in prediction_by_id:
            raise ValueError(f"Missing prediction for loan ID {loan_id}")

        enriched_loan = copy.deepcopy(loan)
        enriched_loan["prediction"] = copy.deepcopy(
            {
                key: value
                for key, value in prediction_by_id[loan_id].items()
                if key != "loan_id"
            }
        )
        enriched_loans.append(enriched_loan)

    return enriched_loans