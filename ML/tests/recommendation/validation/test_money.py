
from decimal import Decimal

import pytest

from recommendation.validation.money import to_decimal


@pytest.mark.parametrize(
    "value, expected",
    [
        (100, Decimal("100")),
        (10.50, Decimal("10.5")),
        ("250.75", Decimal("250.75")),
        (Decimal("125.50"), Decimal("125.50")),
        (0, Decimal("0")),
        (-100, Decimal("-100")),
    ],
)
def test_to_decimal_accepts_valid_values(value, expected):
    result = to_decimal(value)

    assert result == expected
    assert isinstance(result, Decimal)


def test_to_decimal_preserves_existing_decimal():
    value = Decimal("125.50")

    result = to_decimal(value)

    assert result is value


@pytest.mark.parametrize(
    "value",
    [
        True,
        False,
        None,
        [],
        {},
        object(),
    ],
)
def test_to_decimal_rejects_unsupported_types(value):
    with pytest.raises(ValueError, match="valid monetary amount"):
        to_decimal(value)


@pytest.mark.parametrize(
    "value",
    [
        "abc",
        "",
        "12.3.4",
        "not-a-number",
    ],
)
def test_to_decimal_rejects_invalid_numeric_strings(value):
    with pytest.raises(ValueError, match="valid monetary amount"):
        to_decimal(value)


@pytest.mark.parametrize(
    "value",
    [
        Decimal("NaN"),
        Decimal("Infinity"),
        Decimal("-Infinity"),
        float("nan"),
        float("inf"),
        float("-inf"),
    ],
)
def test_to_decimal_rejects_non_finite_values(value):
    with pytest.raises(ValueError, match="must be finite"):
        to_decimal(value)


def test_to_decimal_uses_custom_field_name():
    with pytest.raises(
        ValueError,
        match="Investment amount must be a valid monetary amount",
    ):
        to_decimal(True, field_name="Investment amount")


def test_to_decimal_uses_default_field_name():
    with pytest.raises(
        ValueError,
        match="Amount must be a valid monetary amount",
    ):
        to_decimal(True)
