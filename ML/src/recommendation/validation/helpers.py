def validate_range(preference, config,name):
    min_value = preference['min']
    max_value = preference['max']

    config_min = config['min']
    config_max = config['max']

    if min_value > max_value:
        raise ValueError(
            f"{name} min must be less than max"
        )

    if min_value <config_min or max_value > config_max:
        raise ValueError(
            f"{name} must be between {config_min} and {config_max}"
        )

def validate_value(value,config,name):
    if value < config["min"]:
        raise ValueError(
            f"{name} is below allowed range"
        )
    if value > config["max"]:
        raise ValueError(
            f"{name} is above range"
        )
    
    
def validate_categories(values, valid_values, name):
    if not isinstance(values,(list,set,tuple)):
        values = [values]
    for value in values:
        if value not in valid_values:
            raise ValueError(
                f"Invalid {name}: {value}"
            )

def validate_investment_amount(investor, config):
    preference = investor['preferences']['investment_amount']
    config_feature = config['features']['investment_amount']
    validate_range(preference,config_feature,"Investment amount")