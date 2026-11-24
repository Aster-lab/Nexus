import {describe, expect,it } from 'vitest';
import {
    EssentialNotificationPolicyValuesSchema,
    LoanOfferPolicyValuesSchema,
    LoanInterestPolicyValuesSchema,
    RepaymentPolicyValuesSchema,
    PlatformFeePolicyValuesSchema,
    PlatformPolicyContractSchema,
    validateInterestRepaymentConsistency,
    type PlatformPolicy,
} from '../../src/lib/contracts/platform-policy';

const validNotificationPolicy = {
    schema_version: "essential_notification_policy.v1",
    categories : [
        {category_code: "APPLICATION_SUBMITTED", required_channels: ["IN_APP"]},
        {category_code: "LOAN_OFFER_RECEIVED", required_channels: ["IN_APP","EMAIL"]},
    ],
};

const validLoanOfferPolicy = {
  schema_version: "loan_offer_policy.v1",
  min_principal_satang: 100000,
  max_principal_satang: 5000000,
  allowed_term_months: [3, 6, 9, 12, 18, 24],
  offer_validity_days: 7,
};

const validInterestPolicy = {
  schema_version: "loan_interest_policy.v1",
  annual_interest_rate_basis_points: 1200,
  calculation_method: "REDUCING_BALANCE",
  calculation_frequency: "MONTHLY",
  currency: "THB",
};

const validFeePolicy = {
  schema_version: "platform_fee_policy.v1",
  fee_rate_basis_points: 200,
  calculation_basis: "ORIGINAL_LOAN_PRINCIPAL",
  calculation_timing: "ONCE_PER_LOAN",
  wallet_deduction: false,
  treatment: "CALCULATE_AND_DISPLAY_ONLY",
  currency: "THB",
};

const validRepaymentPolicy = {
  schema_version: "repayment_policy.v1",
  repayment_frequency: "MONTHLY",
  repayment_schedule: "EQUAL_MONTHLY_INSTALLMENTS",
  interest_calculation_method: "REDUCING_BALANCE",
  annual_interest_rate_basis_points: 1200,
  repayment_components: ["PRINCIPAL", "INTEREST"],
  currency: "THB",
};


describe("EssentialNotificationPolicyValuesSchema", () => {
  it("accepts a valid notification policy", () => {
      const result =
    EssentialNotificationPolicyValuesSchema.safeParse(
      validNotificationPolicy,
    );

    if (!result.success) {
        console.log(
        "Notification validation errors:",
        result.error.issues,
        );
    }

    expect(result.success).toBe(true);
    });

  it("rejects duplicate category codes", () => {
    const invalid = {
      ...validNotificationPolicy,
      categories: [
        ...validNotificationPolicy.categories,
        validNotificationPolicy.categories[0],
      ],
    };

    expect(
      EssentialNotificationPolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });

  it("rejects an empty required_channels array", () => {
    const invalid = {
      ...validNotificationPolicy,
      categories: [
        {
          category_code: "APPLICATION_SUBMITTED",
          required_channels: [],
        },
      ],
    };

    expect(
      EssentialNotificationPolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });

  it("rejects unsupported notification channels", () => {
    const invalid = {
      ...validNotificationPolicy,
      categories: [
        {
          category_code: "APPLICATION_SUBMITTED",
          required_channels: ["SMS"],
        },
      ],
    };

    expect(
      EssentialNotificationPolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });

  it("rejects lowercase category codes", () => {
    const invalid = {
      ...validNotificationPolicy,
      categories: [
        {
          category_code: "application_submitted",
          required_channels: ["IN_APP"],
        },
      ],
    };

    expect(
      EssentialNotificationPolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });
});


describe("LoanOfferPolicyValuesSchema", () => {
  it("accepts a valid loan offer policy", () => {
    expect(
      LoanOfferPolicyValuesSchema.safeParse(validLoanOfferPolicy).success,
    ).toBe(true);
  });

  it("rejects a principal below the minimum", () => {
    const invalid = {
      ...validLoanOfferPolicy,
      min_principal_satang: 99999,
    };

    expect(
      LoanOfferPolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });

  it("rejects a principal above the maximum", () => {
    const invalid = {
      ...validLoanOfferPolicy,
      max_principal_satang: 5000001,
    };

    expect(
      LoanOfferPolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });

  it("rejects unsupported loan terms", () => {
    const invalid = {
      ...validLoanOfferPolicy,
      allowed_term_months: [3, 6, 10],
    };

    expect(
      LoanOfferPolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });

  it("rejects duplicate loan terms", () => {
    const invalid = {
      ...validLoanOfferPolicy,
      allowed_term_months: [3, 6, 6],
    };

    expect(
      LoanOfferPolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });

  it("rejects an invalid offer validity period", () => {
    const invalid = {
      ...validLoanOfferPolicy,
      offer_validity_days: 0,
    };

    expect(
      LoanOfferPolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });
});


describe("LoanInterestPolicyValuesSchema", () => {
  it("accepts the approved 12% reducing-balance policy", () => {
    expect(
      LoanInterestPolicyValuesSchema.safeParse(validInterestPolicy).success,
    ).toBe(true);
  });

  it("rejects a zero interest rate", () => {
    const invalid = {
      ...validInterestPolicy,
      annual_interest_rate_basis_points: 0,
    };

    expect(
      LoanInterestPolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });

  it("rejects a different calculation method", () => {
    const invalid = {
      ...validInterestPolicy,
      calculation_method: "FLAT_RATE",
    };

    expect(
      LoanInterestPolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });

  it("rejects a non-monthly calculation frequency", () => {
    const invalid = {
      ...validInterestPolicy,
      calculation_frequency: "DAILY",
    };

    expect(
      LoanInterestPolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });

  it("rejects a currency other than THB", () => {
    const invalid = {
      ...validInterestPolicy,
      currency: "USD",
    };

    expect(
      LoanInterestPolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });
});


describe("PlatformFeePolicyValuesSchema", () => {
  it("accepts the approved 2% fee policy", () => {
    expect(
      PlatformFeePolicyValuesSchema.safeParse(validFeePolicy).success,
    ).toBe(true);
  });

  it("rejects a zero fee rate", () => {
    const invalid = {
      ...validFeePolicy,
      fee_rate_basis_points: 0,
    };

    expect(
      PlatformFeePolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });

  it("rejects a different calculation basis", () => {
    const invalid = {
      ...validFeePolicy,
      calculation_basis: "REMAINING_BALANCE",
    };

    expect(
      PlatformFeePolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });

  it("rejects a different calculation timing", () => {
    const invalid = {
      ...validFeePolicy,
      calculation_timing: "MONTHLY",
    };

    expect(
      PlatformFeePolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });

  it("rejects wallet deduction", () => {
    const invalid = {
      ...validFeePolicy,
      wallet_deduction: true,
    };

    expect(
      PlatformFeePolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });

  it("rejects a different fee treatment", () => {
    const invalid = {
      ...validFeePolicy,
      treatment: "COLLECT_AND_DEDUCT",
    };

    expect(
      PlatformFeePolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });

  it("rejects a currency other than THB", () => {
    const invalid = {
      ...validFeePolicy,
      currency: "USD",
    };

    expect(
      PlatformFeePolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });
});


describe("RepaymentPolicyValuesSchema", () => {
  it("accepts the approved repayment policy", () => {
    expect(
      RepaymentPolicyValuesSchema.safeParse(validRepaymentPolicy).success,
    ).toBe(true);
  });

  it("rejects a different repayment frequency", () => {
    const invalid = {
      ...validRepaymentPolicy,
      repayment_frequency: "WEEKLY",
    };

    expect(
      RepaymentPolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });

  it("rejects a different repayment schedule", () => {
    const invalid = {
      ...validRepaymentPolicy,
      repayment_schedule: "BULLET_REPAYMENT",
    };

    expect(
      RepaymentPolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });

  it("rejects a different interest calculation method", () => {
    const invalid = {
      ...validRepaymentPolicy,
      interest_calculation_method: "FLAT_RATE",
    };

    expect(
      RepaymentPolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });

  it("rejects an annual interest rate other than 12%", () => {
    const invalid = {
      ...validRepaymentPolicy,
      annual_interest_rate_basis_points: 1000,
    };

    expect(
      RepaymentPolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });

  it("rejects a missing repayment component", () => {
    const invalid = {
      ...validRepaymentPolicy,
      repayment_components: ["PRINCIPAL"],
    };

    expect(
      RepaymentPolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });

  it("rejects duplicate repayment components", () => {
    const invalid = {
      ...validRepaymentPolicy,
      repayment_components: ["PRINCIPAL", "PRINCIPAL"],
    };

    expect(
      RepaymentPolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });

  it("rejects an unsupported repayment component", () => {
    const invalid = {
      ...validRepaymentPolicy,
      repayment_components: ["PRINCIPAL", "FEE"],
    };

    expect(
      RepaymentPolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });

  it("rejects a currency other than THB", () => {
    const invalid = {
      ...validRepaymentPolicy,
      currency: "USD",
    };

    expect(
      RepaymentPolicyValuesSchema.safeParse(invalid).success,
    ).toBe(false);
  });
});


describe("PlatformPolicyContractSchema", () => {
  it("accepts a valid loan offer contract", () => {
    expect(
      PlatformPolicyContractSchema.safeParse({
        policy_code: "LOAN_OFFER_POLICY",
        policy_values: validLoanOfferPolicy,
      }).success,
    ).toBe(true);
  });

  it("accepts a valid notification contract", () => {
    expect(
      PlatformPolicyContractSchema.safeParse({
        policy_code: "ESSENTIAL_NOTIFICATION_POLICY",
        policy_values: validNotificationPolicy,
      }).success,
    ).toBe(true);
  });

  it("accepts a valid interest contract", () => {
    expect(
      PlatformPolicyContractSchema.safeParse({
        policy_code: "LOAN_INTEREST_POLICY",
        policy_values: validInterestPolicy,
      }).success,
    ).toBe(true);
  });

  it("accepts a valid fee contract", () => {
    expect(
      PlatformPolicyContractSchema.safeParse({
        policy_code: "PLATFORM_FEE_POLICY",
        policy_values: validFeePolicy,
      }).success,
    ).toBe(true);
  });

  it("accepts a valid repayment contract", () => {
    expect(
      PlatformPolicyContractSchema.safeParse({
        policy_code: "REPAYMENT_POLICY",
        policy_values: validRepaymentPolicy,
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown policy code", () => {
    expect(
      PlatformPolicyContractSchema.safeParse({
        policy_code: "UNKNOWN_POLICY",
        policy_values: validInterestPolicy,
      }).success,
    ).toBe(false);
  });

  it("rejects a policy code and schema version mismatch", () => {
    expect(
      PlatformPolicyContractSchema.safeParse({
        policy_code: "LOAN_INTEREST_POLICY",
        policy_values: validFeePolicy,
      }).success,
    ).toBe(false);
  });

  it("rejects unknown fields in policy values", () => {
    const invalid = {
      ...validInterestPolicy,
      unexpected_field: "not allowed",
    };

    expect(
      PlatformPolicyContractSchema.safeParse({
        policy_code: "LOAN_INTEREST_POLICY",
        policy_values: invalid,
      }).success,
    ).toBe(false);
  });
});


describe("validateInterestRepaymentConsistency", () => {
  const interestContract = PlatformPolicyContractSchema.parse({
    policy_code: "LOAN_INTEREST_POLICY",
    policy_values: validInterestPolicy,
  });

  const repaymentContract = PlatformPolicyContractSchema.parse({
    policy_code: "REPAYMENT_POLICY",
    policy_values: validRepaymentPolicy,
  });

  it("accepts matching annual interest rates", () => {
    expect(() =>
      validateInterestRepaymentConsistency(
        interestContract,
        repaymentContract,
      ),
    ).not.toThrow();
  });

  it("rejects mismatched annual interest rates", () => {
    const mismatchedRepayment = {
      policy_code: "REPAYMENT_POLICY",
      policy_values: {
        ...validRepaymentPolicy,
        annual_interest_rate_basis_points: 1000,
      },
    } as unknown as PlatformPolicy;

    expect(() =>
      validateInterestRepaymentConsistency(
        interestContract,
        mismatchedRepayment,
      ),
    ).toThrow();
  });
});