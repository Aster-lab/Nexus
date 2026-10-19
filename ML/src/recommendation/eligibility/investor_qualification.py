from collections.abc import Mapping

_MISSING = object()

def _require_mapping(value,field_name):
    if not isinstance(value,Mapping):
        raise ValueError(f"{field_name} must be a mapping")

def _get_required_mapping(data,field_name):
    if field_name not in data:
        raise ValueError(f"Missing required field: {field_name}")

    value = data[field_name]
    _require_mapping(value,field_name)
    return value

def _get_required_restrictions(loan):
    _require_mapping(loan,"loan")
    restrictions = _get_required_mapping(loan,"restrictions")

    required_fields = [
        "minimum_age",
        "allowed_countries",
        "allowed_investor_types",
        "qualified_investor_required",
    ]
    for field in required_fields:
        if field not in restrictions:
            raise ValueError(f"Missing required loan restriction: {field}")
    return restrictions

def _get_investor_eligibility(investor):
    _require_mapping(investor,"investor")
    if "eligibility" not in investor:
        raise ValueError("Missing required investor field: eligibility")

    eligibility = investor['eligibility']
    _require_mapping(eligibility,"investor.eligibility")
    return eligibility

def _get_investor_field(eligibility, field):
    return eligibility.get(field,_MISSING)

def _validate_integer(value,field_name):
    if isinstance(value,bool) or not isinstance(value,int):
        raise ValueError(f"{field_name}must be a non-negative number")
    
    if value < 0:
        raise ValueError(f"{field_name}cannot be negative")
    
def _validate_minimum_age(minimum_age):
    if minimum_age is None:
        return

    _validate_integer(minimum_age,"Loan minimum age")

def _validate_investor_age(age):
    if age is _MISSING or age is None:
        raise ValueError("Investor age is required by the loan restrictions")

    _validate_integer(age,"Investor age")

def _validate_non_empty_string(value,field_name):
    if not isinstance(value,str) or not value.strip():
        raise ValueError(f"{field_name} must be a non-empty string")

def _validate_allow_list(values,field_name):
    if values is None:
        return

    if not isinstance(values,list) or not values:
        raise ValueError(f"{field_name} must be a non-empty list")

    for value in values:
        _validate_non_empty_string(value,f"Each value in {field_name}")

def _validate_qualified_investor_required(required):
    if not isinstance(required,bool):
        raise ValueError(f"Loan qualified_investor_required must be a Boolean")

def _validate_all_restrictions(restrictions):
    _validate_minimum_age(restrictions['minimum_age'])
    _validate_allow_list(restrictions['allowed_countries'],"allowed_countries")
    _validate_allow_list(restrictions['allowed_investor_types'],"allowed_investor_types")
    _validate_qualified_investor_required(restrictions['qualified_investor_required'])


def _validate_country_restriction(value):
    _validate_allow_list(value, "allowed_countries")


def _validate_investor_type_restriction(value):
    _validate_allow_list(value, "allowed_investor_types")


def _validate_required_qualified_flag(value):
    _validate_qualified_investor_required(value)


def _validate_country(country):
    if not isinstance(country, str) or not country.strip():
        raise ValueError("Investor country must be a non-empty string.")
    _validate_non_empty_string(country, "Investor country")


def _validate_investor_type(value):
    if value is _MISSING or value is None:
        raise ValueError("Investor type is required by the loan restriction.")
    _validate_non_empty_string(value, "Investor type")


def _validate_qualified_status(value):
    if value is _MISSING or value is None:
        raise ValueError(
            "Investor qualified_investor status is required by the loan."
        )
    if not isinstance(value, bool):
        raise ValueError("Investor qualified_investor must be a Boolean.")

def _check_restriction(
    investor,
    loan,
    restriction_key,
    investor_field,
    validate_restriction,
    validate_investor_value,
    is_eligible,
    is_inactive,
):
    restrictions = _get_required_restrictions(loan)
    restriction = restrictions[restriction_key]

    validate_restriction(restriction)

    if is_inactive(restriction):
        return True

    eligibility = _get_investor_eligibility(investor)
    value = _get_investor_field(eligibility, investor_field)

    validate_investor_value(value)

    return is_eligible(value, restriction)

def check_minimum_age(investor, loan):
    return _check_restriction(
        investor=investor,
        loan=loan,
        restriction_key="minimum_age",
        investor_field="age",
        validate_restriction=_validate_minimum_age,
        validate_investor_value=_validate_investor_age,
        is_eligible=lambda age, minimum: age >= minimum,
        is_inactive=lambda minimum: minimum is None,
    )


def check_country(investor, loan):
    return _check_restriction(
        investor=investor,
        loan=loan,
        restriction_key="allowed_countries",
        investor_field="country",
        validate_restriction=_validate_country_restriction,
        validate_investor_value=_validate_country,
        is_eligible=lambda country, allowed: country in allowed,
        is_inactive=lambda allowed: allowed is None,
    )


def check_type(investor, loan):
    return _check_restriction(
        investor=investor,
        loan=loan,
        restriction_key="allowed_investor_types",
        investor_field="investor_type",
        validate_restriction=_validate_investor_type_restriction,
        validate_investor_value=_validate_investor_type,
        is_eligible=lambda investor_type, allowed: investor_type in allowed,
        is_inactive=lambda allowed: allowed is None,
    )


def check_qualified(investor, loan):
    return _check_restriction(
        investor=investor,
        loan=loan,
        restriction_key="qualified_investor_required",
        investor_field="qualified_investor",
        validate_restriction=_validate_required_qualified_flag,
        validate_investor_value=_validate_qualified_status,
        is_eligible=lambda qualified, required: qualified or not required,
        is_inactive=lambda required: required is False,
    )
#combined check
def check_investor_qualification(investor, loan):
    restrictions = _get_required_restrictions(loan)
    _validate_all_restrictions(restrictions)

    return (
        check_minimum_age(investor, loan)
        and check_country(investor, loan)
        and check_type(investor, loan)
        and check_qualified(investor, loan)
    )