"""Canonical feature contract used to build risk model input vectors."""

FEATURE_SCHEMA_VERSION = "nexus_risk_features.v1"
PREDICTION_RESPONSE_SCHEMA_VERSION = "nexus_prediction_batch.v1"
PREDICTION_OUTPUT_SCHEMA_VERSION = "nexus_prediction_output.v1"

FEATURE_NAMES = (
    "annual_income",
    "dti",
    "loan_amount",
    "acc_open_past_24mths",
    "bc_util",
    "lti",
    "interest_burden",
    "sub_grade_num",
    "int_rate",
    "revol_util",
    "term_months",
)
