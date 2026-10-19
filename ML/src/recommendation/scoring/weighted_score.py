from decimal import Decimal
#weighted score
def calculate_weighted_score(scores, weights):
    return sum(
        float(scores[feature]) * float(weights[feature]["weight"])
        for feature in scores
    )