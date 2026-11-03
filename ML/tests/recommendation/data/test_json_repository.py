import json

import pytest

from recommendation.data.json_repository import load_json, load_recommendation_data


def write_json(path, data):
    path.write_text(json.dumps(data), encoding="utf-8")
    return path


def test_load_json_reads_valid_json(tmp_path):
    path = write_json(tmp_path / "investor.json", {"investor_id": 1})

    result = load_json(path)

    assert result == {"investor_id": 1}


def test_load_json_supports_json_arrays(tmp_path):
    path = write_json(tmp_path / "loans.json", [{"loan_id": 10}])

    result = load_json(path)

    assert result == [{"loan_id": 10}]


def test_load_json_raises_for_missing_file(tmp_path):
    path = tmp_path / "missing.json"

    with pytest.raises(FileNotFoundError):
        load_json(path)


def test_load_json_raises_for_invalid_json(tmp_path):
    path = tmp_path / "invalid.json"
    path.write_text("{invalid json", encoding="utf-8")

    with pytest.raises(ValueError, match="Invalid JSON"):
        load_json(path)


def test_load_recommendation_data_loads_all_files(tmp_path):
    investor = {
    "investor_id": 1,
    "exposure": {
        "proposed_amount": 2000,
        "limits": {
            "total": 50000,
            "per_loan": 5000,
            "per_borrower": 10000,
            "per_purpose": 20000,
        },
        "current": {
            "total": 20000,
            "per_loan": 4000,
            "per_borrower": 7000,
            "per_purpose": 12000,
        },
    },
}
    loans = [{"loan_id": 10}]
    investments = [{"investor_id": 1, "loan_id": 10,"amount": 1000,}]
    config = {"features": {}}

    investor_path = write_json(tmp_path / "investor.json", investor)
    loans_path = write_json(tmp_path / "loans.json", loans)
    investments_path = write_json(tmp_path / "investment.json", investments)
    config_path = write_json(tmp_path / "config.json", config)

    result = load_recommendation_data(
        investor_path=investor_path,
        loans_path=loans_path,
        investments_path=investments_path,
        config_path=config_path,
    )

    assert result == {
        "investor": investor,
        "loans": loans,
        "investments": investments,
        "config": config,
    }


def test_load_recommendation_data_does_not_modify_source_files(tmp_path):
    investor = {
        "investor_id": 1,
        "exposure": {
            "proposed_amount": 2000,
            "limits": {
                "total": 50000,
                "per_loan": 5000,
                "per_borrower": 10000,
                "per_purpose": 20000,
            },
            "current": {
                "total": 20000,
                "per_loan": 4000,
                "per_borrower": 7000,
                "per_purpose": 12000,
            },
        },
    }
    loans = [{"loan_id": 10}]
    investments = []
    config = {"features": {}}

    investor_path = write_json(tmp_path / "investor.json", investor)
    loans_path = write_json(tmp_path / "loans.json", loans)
    investments_path = write_json(tmp_path / "investment.json", investments)
    config_path = write_json(tmp_path / "config.json", config)

    load_recommendation_data(
        investor_path=investor_path,
        loans_path=loans_path,
        investments_path=investments_path,
        config_path=config_path,
    )

    assert json.loads(investor_path.read_text(encoding="utf-8")) == investor
    assert json.loads(loans_path.read_text(encoding="utf-8")) == loans
    assert json.loads(investments_path.read_text(encoding="utf-8")) == investments
    assert json.loads(config_path.read_text(encoding="utf-8")) == config