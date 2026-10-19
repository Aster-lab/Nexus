from .helpers import validate_categories,validate_value
def validate_loan(loan,config):
    features = config["features"]

    valid_risk_tiers = set(features["risk_tier"]["mapping"])
    validate_categories(loan['prediction']['tier']['tier_code'],valid_risk_tiers,"Risk tier")

    valid_purpose = set(config['categories']['loan_purpose'])
    validate_categories(loan['terms']['loan_purpose'],valid_purpose,'Loan Purpose')

    numeric_features = {
        "interest_rate" : ('interest_rate',"Interest rate"),
        "loan_duration" : ("loan_duration","Loan duration"),
    }

    for loan_key,(key,name) in numeric_features.items():
        validate_value(loan['terms'][loan_key],features[key],name)
    validate_value(loan['amount']['remaining'],features['loan_amount'],'Loan amount')

    return True