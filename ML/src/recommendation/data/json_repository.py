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

    if "exposure" not in investor:
        raise ValueError("Investor data is missing required 'exposure'.")

    exposure = dict(investor["exposure"])

    required_fields = {"proposed_amount", "limits", "current"}
    missing_fields = required_fields - exposure.keys()

    if missing_fields:
        raise ValueError(
            f"Exposure data is missing required fields: {sorted(missing_fields)}"
        )

    def convert_category_values(values, section_name):
        values = dict(values)

        for category, value in values.items():
            if isinstance(value, bool) or not isinstance(
                value, (int, float, Decimal)
            ):
                raise ValueError(
                    f"Exposure {section_name}.{category} must be numeric."
                )

            converted = Decimal(str(value))

            if not converted.is_finite():
                raise ValueError(
                    f"Exposure {section_name}.{category} must be finite."
                )

            values[category] = converted

        return values

    exposure["proposed_amount"] = Decimal(
        str(exposure["proposed_amount"])
    )

    if not exposure["proposed_amount"].is_finite():
        raise ValueError("Exposure proposed_amount must be finite.")

    exposure["limits"] = convert_category_values(
        exposure["limits"], "limits"
    )

    exposure["current"] = convert_category_values(
        exposure["current"], "current"
    )

    investor["exposure"] = exposure

    return investor


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