import json
from pathlib import Path


def load_json(path):
    """Load and return data from a JSON file."""
    path = Path(path)

    with path.open("r", encoding="utf-8") as file:
        try:
            return json.load(file)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSON in file: {path}") from exc


def load_recommendation_data(
    investor_path,
    loans_path,
    investments_path,
    config_path,
):
    """Load all data required by the recommendation service."""
    return {
        "investor": load_json(investor_path),
        "loans": load_json(loans_path),
        "investments": load_json(investments_path),
        "config": load_json(config_path),
    }