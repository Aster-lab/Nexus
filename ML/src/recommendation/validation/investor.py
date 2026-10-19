from .helpers import validate_categories,validate_investment_amount,validate_range

def validate_investor(investor,config):
    features = config['features']

    validate_risk_tiers = set(
        features['risk_tier']['mapping'].keys()
    )

    validate_categories(investor['preferences']['risk_tier'],validate_risk_tiers,"risk tier")

    range_features = {
        "interest_rate" : ('interest_rate',"Interest rate"),
        "loan_duration" : ("loan_duration","Loan duration"),
    }

    for investor_key,(config_key,name) in range_features.items():
        validate_range(investor['preferences'][investor_key],features[config_key],name)

    validate_investment_amount(investor, config)

    valid_purposes = set(
        config['categories']['loan_purpose']
    )
    validate_categories(investor['preferences']['loan_purpose'],valid_purposes,'Loan Purpose')

    return True