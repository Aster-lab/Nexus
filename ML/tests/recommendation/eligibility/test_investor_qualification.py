import copy
import pytest
from recommendation.eligibility.investor_qualification import(
    check_minimum_age,
    check_country,
    check_type,
    check_qualified,
    check_investor_qualification,
)

MISSING = object()

def make_investor(*,age=30,country = "TH",type = "INDIVIDUAL",qualified_investor=False):
    return {
        "eligibility" : {
        "age" : age,
        "country" : country,
        "investor_type" : type,
        "qualified_investor" : qualified_investor
        }
    }

def make_loan(*,age = 18, countries = None,types = None,required = False):
    return {
        "restrictions" : {
            "allowed_investor_types" : types,
            "allowed_countries" : countries,
            "minimum_age" : age,
            "qualified_investor_required" : required
        }
    }

def remove_investor_field(investor,field):
    del investor['eligibility'][field]

def remove_loan_field(loan,field):
    del loan['restrictions'][field]


@pytest.mark.parametrize(
    ("age","minimum_age","expected"),
     [
        (18, 18, True),
        (19, 18, True),
        (100, 18, True),
        (17, 18, False),
        (0, 0, True),
        (0, 1, False),
        (30, None, True),
    ],
)
def test_check_minimum_age_valid(age,minimum_age,expected):
    assert check_minimum_age(make_investor(age=age),make_loan(age=minimum_age)) is expected

@pytest.mark.parametrize("age",[None,MISSING])
def test_check_minimum_age_missing_when_unrestricted(age):
    investor = make_investor()

    if age is MISSING:
        remove_investor_field(investor,"age")
    else:
        investor['eligibility']['age'] = age

    assert check_minimum_age(investor,make_loan(age=None)) is True

@pytest.mark.parametrize("age",[None,MISSING])
def test_check_minimum_age_missing_when_restricted(age):
    investor = make_investor()
    if age is MISSING:
        remove_investor_field(investor,"age")
    else:
        investor['eligibility']['age'] = age

    with pytest.raises(ValueError):
        assert check_minimum_age(investor,make_loan(age=18))

@pytest.mark.parametrize(
    "age",
    [
        -1,
        -100,
        18.0,
        18.5,
        True,
        False,
        "18",
        "",
        [],
        {},
    ],
)
def test_check_minimum_age_invalid_investor(age):
    investor = make_investor(age=age)

    with pytest.raises(ValueError):
        check_minimum_age(investor,make_loan(age=18))

@pytest.mark.parametrize(
    "minimum_age",
    [
        -1,
        -100,
        18.0,
        18.5,
        True,
        False,
        "18",
        "",
        [],
        {},
    ],
)
def test_minimum_age_invalid_loan(minimum_age):
    with pytest.raises(ValueError):
        assert check_minimum_age(make_investor(),make_loan(age=minimum_age))


@pytest.mark.parametrize(
    ("country", "allowed", "expected"),
    [
        ("TH", ["TH"], True),
        ("SG", ["TH"], False),
        ("SG", ["TH", "SG"], True),
        ("TH", ["TH", "SG"], True),
        ("TH", None, True),
        ("th", ["TH"], False),
    ],
)
def test_country_valid(country, allowed, expected):
    assert check_country(
        make_investor(country=country),
        make_loan(countries=allowed),
    ) is expected


@pytest.mark.parametrize("country", [None, MISSING])
def test_country_missing_when_unrestricted(country):
    investor = make_investor()

    if country is MISSING:
        remove_investor_field(investor, "country")
    else:
        investor["eligibility"]["country"] = country

    assert check_country(
        investor,
        make_loan(countries=None),
    ) is True


@pytest.mark.parametrize("country", [None, MISSING])
def test_country_missing_when_restricted(country):
    investor = make_investor()

    if country is MISSING:
        remove_investor_field(investor, "country")
    else:
        investor["eligibility"]["country"] = country

    with pytest.raises(ValueError):
        check_country(
            investor,
            make_loan(countries=["TH"]),
        )


@pytest.mark.parametrize(
    "country",
    [
        "",
        " ",
        1,
        True,
        [],
        {},
    ],
)
def test_country_invalid_investor_country(country):
    with pytest.raises(ValueError):
        check_country(
            make_investor(country=country),
            make_loan(countries=["TH"]),
        )


@pytest.mark.parametrize(
    "allowed",
    [
        [],
        "",
        "TH",
        1,
        True,
        {},
        [""],
        [" "],
        [None],
        [1],
        [True],
        [[]],
        [{}],
    ],
)
def test_country_rejects_invalid_loan_country(allowed):
    with pytest.raises(ValueError):
        check_country(
            make_investor(),
            make_loan(countries=allowed),
        )


def test_country_allows_duplicate_allowed_values():
    assert check_country(
        make_investor(country="TH"),
        make_loan(countries=["TH", "TH"]),
    ) is True



@pytest.mark.parametrize(
    ("investor_type", "allowed", "expected"),
    [
        ("INDIVIDUAL", ["INDIVIDUAL"], True),
        ("INSTITUTIONAL", ["INSTITUTIONAL"], True),
        ("COMPANY", ["INDIVIDUAL"], False),
        ("INSTITUTIONAL", ["INDIVIDUAL", "INSTITUTIONAL"], True),
        ("INDIVIDUAL", None, True),
        ("individual", ["INDIVIDUAL"], False),
    ],
)
def test_investor_type_valid(investor_type, allowed, expected):
    assert check_type(
        make_investor(type=investor_type),
        make_loan(types=allowed),
    ) is expected


@pytest.mark.parametrize("investor_type", [None, MISSING])
def test_investor_type_missing_when_unrestricted(investor_type):
    investor = make_investor()

    if investor_type is MISSING:
        remove_investor_field(investor, "investor_type")
    else:
        investor["eligibility"]["investor_type"] = investor_type

    assert check_type(
        investor,
        make_loan(types=None),
    ) is True


@pytest.mark.parametrize("investor_type", [None, MISSING])
def test_investor_type_missing_when_restricted(investor_type):
    investor = make_investor()

    if investor_type is MISSING:
        remove_investor_field(investor, "investor_type")
    else:
        investor["eligibility"]["investor_type"] = investor_type

    with pytest.raises(ValueError):
        check_type(
            investor,
            make_loan(types=["INDIVIDUAL"]),
        )


@pytest.mark.parametrize(
    "investor_type",
    [
        "",
        " ",
        1,
        True,
        [],
        {},
    ],
)
def test_investor_type_rejects_invalid_investor(investor_type):
    with pytest.raises(ValueError):
        check_type(
            make_investor(type=investor_type),
            make_loan(types=["INDIVIDUAL"]),
        )


@pytest.mark.parametrize(
    "allowed",
    [
        [],
        "",
        "INDIVIDUAL",
        1,
        True,
        {},
        [""],
        [" "],
        [None],
        [1],
        [True],
        [[]],
        [{}],
    ],
)
def test_investor_type_rejects_invalid_loan(allowed):
    with pytest.raises(ValueError):
        check_type(
            make_investor(),
            make_loan(types=allowed),
        )


def test_investor_type_allows_duplicate_values():
    assert check_type(
        make_investor(type="INDIVIDUAL"),
        make_loan(
            types=["INDIVIDUAL", "INDIVIDUAL"]
        ),
    ) is True


@pytest.mark.parametrize(
    ("required", "qualified", "expected"),
    [
        (False, False, True),
        (False, True, True),
        (True, True, True),
        (True, False, False),
    ],
)
def test_qualified_investor_valid(required, qualified, expected):
    assert check_qualified(
        make_investor(qualified_investor=qualified),
        make_loan(required=required),
    ) is expected


@pytest.mark.parametrize("qualified", [None, MISSING])
def test_qualified_status_missing_when_unrestricted(qualified):
    investor = make_investor()

    if qualified is MISSING:
        remove_investor_field(investor, "qualified_investor")
    else:
        investor["eligibility"]["qualified_investor"] = qualified

    assert check_qualified(
        investor,
        make_loan(required=False),
    ) is True


@pytest.mark.parametrize("qualified", [None, MISSING])
def test_qualified_status_missing_when_required(qualified):
    investor = make_investor()

    if qualified is MISSING:
        remove_investor_field(investor, "qualified_investor")
    else:
        investor["eligibility"]["qualified_investor"] = qualified

    with pytest.raises(ValueError):
        check_qualified(
            investor,
            make_loan(required=True),
        )


@pytest.mark.parametrize(
    "qualified",
    [
        0,
        1,
        "true",
        "false",
        "yes",
        "",
        [],
        {},
    ],
)
def test_qualified_status_boolean_investor(qualified):
    with pytest.raises(ValueError):
        check_qualified(
            make_investor(qualified_investor=qualified),
            make_loan(required=True),
        )


@pytest.mark.parametrize(
    "required",
    [
        None,
        0,
        1,
        "true",
        "false",
        "",
        [],
        {},
    ],
)
def test_qualified_requirement_boolean_loan(required):
    with pytest.raises(ValueError):
        check_qualified(
            make_investor(),
            make_loan(required=required),
        )

@pytest.mark.parametrize(
    "restriction",
    [
        "minimum_age",
        "allowed_countries",
        "allowed_investor_types",
        "qualified_investor_required",
    ],
)
def test_each_required_loan_restriction_must_exist(restriction):
    loan = make_loan()
    remove_loan_field(loan, restriction)

    with pytest.raises(ValueError):
        check_investor_qualification(make_investor(), loan)


@pytest.mark.parametrize("restrictions", [None, [], "", 1, True])
def test_invalid_restrictions_container_raises(restrictions):
    loan = make_loan()
    loan["restrictions"] = restrictions

    with pytest.raises(ValueError):
        check_investor_qualification(make_investor(), loan)


@pytest.mark.parametrize("eligibility", [None, [], "", 1, True])
def test_invalid_investor_eligibility_container_raises(eligibility):
    investor = make_investor()
    investor["eligibility"] = eligibility

    with pytest.raises(ValueError):
        check_investor_qualification(investor, make_loan())


@pytest.mark.parametrize(
    "investor",
    [
        None,
        [],
        "",
        1,
        True,
        {},
    ],
)
def test_invalid_investor_container_raises(investor):
    with pytest.raises(ValueError):
        check_investor_qualification(investor, make_loan())


@pytest.mark.parametrize(
    "loan",
    [
        None,
        [],
        "",
        1,
        True,
        {},
    ],
)
def test_invalid_loan_container_raises(loan):
    with pytest.raises(ValueError):
        check_investor_qualification(make_investor(), loan)


def test_missing_top_level_eligibility_raises_when_checking_active_restriction():
    investor = {"account": {"status": "ACTIVE"}}

    with pytest.raises(ValueError):
        check_investor_qualification(investor, make_loan())


def test_missing_top_level_restrictions_raises():
    loan = {"loan_id": 1, "status": "OPEN"}

    with pytest.raises(ValueError):
        check_investor_qualification(make_investor(), loan)



def test_combined_check_passes_all_restrictions():
    investor = make_investor(
        age=30,
        country="TH",
        type="INDIVIDUAL",
        qualified_investor=True,
    )
    loan = make_loan(
        age=18,
        countries=["TH"],
        types=["INDIVIDUAL"],
        required=True,
    )

    assert check_investor_qualification(investor, loan) is True


@pytest.mark.parametrize(
    ("investor_changes", "loan_changes"),
    [
        ({"age": 17}, {"age": 18}),
        ({"country": "SG"}, {"countries": ["TH"]}),
        (
            {"type": "COMPANY"},
            {"types": ["INDIVIDUAL"]},
        ),
        (
            {"qualified_investor": False},
            {"required": True},
        ),
    ],
)
def test_combined_check_returns_false_when_any_restriction_fails(
    investor_changes, loan_changes
):
    investor = make_investor(**investor_changes)
    loan = make_loan(**loan_changes)

    assert check_investor_qualification(investor, loan) is False


def test_combined_check_allows_missing_data_for_inactive_restrictions():
    investor = make_investor()
    loan = make_loan(
        age=None,
        countries=None,
        types=None,
        required=False,
    )

    for field in (
        "age",
        "country",
        "investor_type",
        "qualified_investor",
    ):
        remove_investor_field(investor, field)

    assert check_investor_qualification(investor, loan) is True


@pytest.mark.parametrize(
    ("investor_field", "loan_changes"),
    [
        ("age", {"age": 18}),
        ("country", {"countries": ["TH"]}),
        ("investor_type", {"types": ["INDIVIDUAL"]}),
        ("qualified_investor", {"required": True}),
    ],
)
def test_combined_check_raises_for_missing_data_required_by_restriction(
    investor_field, loan_changes
):
    investor = make_investor()
    remove_investor_field(investor, investor_field)

    with pytest.raises(ValueError):
        check_investor_qualification(
            investor,
            make_loan(**loan_changes),
        )


def test_combined_check_rejects_invalid_data_even_if_another_check_would_fail():
    investor = make_investor(age=17)
    loan = make_loan(age=18, countries=[])

    with pytest.raises(ValueError):
        check_investor_qualification(investor, loan)


def test_checks_do_not_mutate_input_data():
    investor = make_investor()
    loan = make_loan(
        age=18,
        countries=["TH"],
        types=["INDIVIDUAL"],
    )
    investor_before = copy.deepcopy(investor)
    loan_before = copy.deepcopy(loan)

    check_investor_qualification(investor, loan)

    assert investor == investor_before
    assert loan == loan_before

def test_investor_qualification_usecase(load_test_investor,load_test_loan):
    investor = load_test_investor
    loans = load_test_loan
    results = []

    assert isinstance(investor, dict)
    assert isinstance(loans, list)
    assert loans, "Expected at least one loan in the fixture"

    for loan in loans:
        result = check_investor_qualification(investor,loan)
        assert isinstance(result,bool)
        results.append((loan['loan_id'],result))

    assert len(results) == len(loans)
    print(
        f"Investor {investor.get('investor_id')}: "
        f"qualification results = {results}"
    )


def test_usecase_malformed_loan(load_test_investor,load_test_loan):
    if not load_test_loan:
        pytest.skip("No loans available in the test fixture.")

    loan = load_test_loan[0].copy()
    loan["restrictions"] = loan.get("restrictions", {}).copy()
    loan["restrictions"].pop("minimum_age", None)

    with pytest.raises(ValueError):
        check_investor_qualification(load_test_investor, loan)