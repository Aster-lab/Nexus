#purpose
def calculate_purpose_score(loan_purpose,investor_purposes):
    if loan_purpose in investor_purposes:
        return 1.0
    else:
        return 0.0
