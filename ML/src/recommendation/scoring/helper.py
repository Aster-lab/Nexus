#range score helper for 0-1 distance from range
def calculate_range_score(
        value,
        preferred_min,
        preferred_max,
        global_min,
        global_max
):
    if preferred_min > preferred_max:
        raise ValueError(
            "Preferred min must be less than preferred max"
        )

    if global_min > global_max:
        raise ValueError(
            "Global min must be less than global max"
        )
    
    if value < global_min or value > global_max:
        raise ValueError(
            "Value is outside of global bounds"
        )

    if preferred_min < global_min or preferred_max > global_max:
        raise ValueError(
            "Preferred range is outside of global bounds"
        )
    
    if preferred_min <= value <= preferred_max:
        return 1.0

    if value < preferred_min:
        return  1.0 - (preferred_min - value) / (preferred_min - global_min)

    if value > preferred_max:
        return 1.0 - (value - preferred_max) / (global_max - preferred_max)
#interest rate