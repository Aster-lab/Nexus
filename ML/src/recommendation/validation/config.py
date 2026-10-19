#validation
def validate_config(config):
    features = config["features"]

    total_weight = sum(
        feature.get("weight",0)
        for feature in features.values()
        if "weight" in feature
    )

    if abs(total_weight - 1.0) > 0.0001:
        raise ValueError(
            f"Feature weights mush sum to 1.0"
            f"Curent Total: {total_weight}"
        )

    for name, feature in features.items():
        weight = feature.get("weight")

        if weight is not None:
            if weight < 0 or weight > 1:
                raise ValueError(
                    f"Invalid weight for {name}: {weight}"
                )

        if feature["type"] == "numeric":
            if feature["min"] >= feature["max"]:
                raise ValueError(
                    f"Invalid bounds for {name}: "
                    f"min must be less than max"
                )

    return True