from decimal import Decimal


def to_decimal(value, field_name="Amount"):
    """Convert a JSON monetary value to Decimal safely."""
    if isinstance(value, bool):
        raise ValueError(f"{field_name} must be a valid monetary amount.")

    if isinstance(value, Decimal):
        result = value
    elif isinstance(value, (int, float, str)):
        try:
            result = Decimal(str(value))
        except Exception as exc:
            raise ValueError(
                f"{field_name} must be a valid monetary amount."
            ) from exc
    else:
        raise ValueError(f"{field_name} must be a valid monetary amount.")

    if not result.is_finite():
        raise ValueError(f"{field_name} must be finite.")

    return result