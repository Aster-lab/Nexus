import math

def validate_config(config):
    if "features" not in config:
        raise ValueError("Configuration must contain 'features'.")

    features = config["features"]

    if not isinstance(features, dict) or not features:
        raise ValueError("At least one feature must be configured.")

    for name, feature in features.items():
        if not isinstance(feature, dict):
            raise ValueError(f"Feature '{name}' must be an object.")

        if "weight" not in feature:
            raise ValueError(f"Feature '{name}' is missing its weight.")

    total_weight = sum(
        feature["weight"] for feature in features.values()
    )

    if abs(total_weight - 1.0) > 0.0001:
        raise ValueError(
            f"Feature weights must sum to 1.0. "
            f"Current total: {total_weight}"
        )

    for name, feature in features.items():
        weight = feature["weight"]

        if isinstance(weight, bool) or not isinstance(weight, (int, float)):
            raise ValueError(f"Invalid weight for {name}: {weight}")

        if not math.isfinite(weight):
            raise ValueError(f"Invalid weight for {name}: {weight}")

        if weight < 0 or weight > 1:
            raise ValueError(f"Invalid weight for {name}: {weight}")

        if feature.get("type") == "numeric":
            if "min" not in feature or "max" not in feature:
                raise ValueError(f"Missing numeric bounds for {name}.")

            if feature["min"] >= feature["max"]:
                raise ValueError(
                    f"Invalid bounds for {name}: "
                    f"min must be less than max"
                )

    return True
