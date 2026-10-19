import json
from pathlib import Path
from decimal import Decimal

def load_json(path):
    """Load and return data from a JSON file."""
    path = Path(path)

    with path.open("r", encoding="utf-8") as file:
        try:
            return json.load(file)
        except json.JSONDecodeError as exc:
            raise ValueError(f"Invalid JSON in file: {path}") from exc

def _convert_exposure_decimals(investor):
    investor = dict(investor)
    exposure = dict(investor["exposure"])

    exposure["proposed_amount"] = Decimal(str(exposure["proposed_amount"]))
    limits = dict(exposure['limits'])
    for category, value in limits.items():
        limits[category]= Decimal(str(value))

    exposure['limits'] = limits
    investor['exposure'] = exposure

    return investor
\
from decimal import Decimal


def _convert_investment_decimals(investments):
    converted = []

    for investment in investments:
        item = dict(investment)
        amount = item.get("amount")

        if isinstance(amount, bool) or not isinstance(amount, (int, float, Decimal)):
            raise ValueError("Investment amount must be numeric.")

        item["amount"] = Decimal(str(amount))

        converted.append(item)

    return converted

def load_recommendation_data(
    investor_path,
    loans_path,
    investments_path,
    config_path,
):
    investor = load_json(investor_path)
    investments = load_json(investments_path)
    """Load all data required by the recommendation service."""
    return {
        "investor": _convert_exposure_decimals(investor),
        "loans": load_json(loans_path),
        "investments": _convert_investment_decimals(investments),
        "config": load_json(config_path),
    }