from recommendation.scoring.ranking import rank_loans
def test_rank_by_score_descending():
    scored_loans = [
        {"loan_id": 1, "score": 0.70, "terms": {"interest_rate": 12}},
        {"loan_id": 2, "score": 0.90, "terms": {"interest_rate": 8}},
        {"loan_id": 3, "score": 0.80, "terms": {"interest_rate": 10}},
    ]

    result = rank_loans(scored_loans)

    assert [loan["loan_id"] for loan in result] == [2, 3, 1]


def test_higher_interest_rate_wins_when_scores_tie():
    scored_loans = [
        {"loan_id": 1, "score": 0.85, "terms": {"interest_rate": 10}},
        {"loan_id": 2, "score": 0.85, "terms": {"interest_rate": 12}},
        {"loan_id": 3, "score": 0.85, "terms": {"interest_rate": 9}},
    ]

    result = rank_loans(scored_loans)

    assert [loan["loan_id"] for loan in result] == [2, 1, 3]


def test_lower_loan_id_wins_when_score_and_rate_tie():
    scored_loans = [
        {"loan_id": 7, "score": 0.85, "terms": {"interest_rate": 12}},
        {"loan_id": 3, "score": 0.85, "terms": {"interest_rate": 12}},
        {"loan_id": 5, "score": 0.85, "terms": {"interest_rate": 12}},
    ]

    result = rank_loans(scored_loans)

    assert [loan["loan_id"] for loan in result] == [3, 5, 7]


def test_ranking_does_not_mutate_input_list():
    scored_loans = [
        {"loan_id": 2, "score": 0.70, "terms": {"interest_rate": 10}},
        {"loan_id": 1, "score": 0.90, "terms": {"interest_rate": 8}},
    ]
    original_order = [loan["loan_id"] for loan in scored_loans]

    rank_loans(scored_loans)

    assert [loan["loan_id"] for loan in scored_loans] == original_order


def test_empty_list_returns_empty_list():
    assert rank_loans([]) == []
