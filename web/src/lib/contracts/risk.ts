import { z } from "zod";

export const RISK_FEATURE_SCHEMA_VERSION = "nexus_risk_features.v1" as const;
export const NEXUS_RISK_FEATURE_SCHEMA_VERSION = "nexus_risk_features.v2" as const;
export const RISK_RESPONSE_SCHEMA_VERSION = "nexus_prediction_batch.v1" as const;
export const PERSISTED_PREDICTION_OUTPUT_SCHEMA_VERSION = "nexus_prediction_output.v1" as const;

// Keep this tuple aligned with ML/feature_contract.py. Its position is the
// vector order expected by the trained model; JSON object key order is ignored.
export const RISK_FEATURE_NAMES = [
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
] as const;

const finiteNumber = z.number().finite();

export const RiskFeaturesSchema = z
  .object({
    annual_income: finiteNumber.positive(),
    dti: finiteNumber.nonnegative(), // percentage points
    loan_amount: finiteNumber.positive(),
    acc_open_past_24mths: finiteNumber.nonnegative(),
    bc_util: finiteNumber.min(0).max(1), // proportion
    lti: finiteNumber.nonnegative(), // ratio
    interest_burden: finiteNumber.nonnegative(), // derived ratio
    sub_grade_num: z.number().int().min(1).max(35),
    int_rate: finiteNumber.min(0).max(1), // proportion
    revol_util: finiteNumber.min(0).max(1), // proportion
    term_months: z.number().int().positive(),
  })
  .strict();

const FeatureMetadataByNameSchema = z
  .object({
    annual_income: z.string().min(1),
    dti: z.string().min(1),
    loan_amount: z.string().min(1),
    acc_open_past_24mths: z.string().min(1),
    bc_util: z.string().min(1),
    lti: z.string().min(1),
    interest_burden: z.string().min(1),
    sub_grade_num: z.string().min(1),
    int_rate: z.string().min(1),
    revol_util: z.string().min(1),
    term_months: z.string().min(1),
  })
  .strict();

export const FeatureSnapshotContractSchema = z
  .object({
    schema_version: z.literal(RISK_FEATURE_SCHEMA_VERSION),
    feature_generation_version: z.string().min(1),
    source_application_version_id: z.uuid(),
    created_at: z.iso.datetime({ offset: true }),
    feature_values: RiskFeaturesSchema,
    feature_units: FeatureMetadataByNameSchema,
    source_mapping: FeatureMetadataByNameSchema,
  })
  .strict();

// NEXUS-native contract for retraining against THB amounts and application-
// time bureau inputs. Kept separate from v1 so old LendingClub artifacts and
// historical snapshots can never be mistaken for this model's input schema.
export const NEXUS_RISK_FEATURE_NAMES = [
  "annual_income", "dti", "loan_amount", "acc_open_past_24mths", "bc_util",
  "lti", "interest_burden", "credit_score", "int_rate", "revol_util", "term_months",
] as const;

export const NexusRiskFeaturesSchema = z.object({
  annual_income: finiteNumber.positive(),
  dti: finiteNumber.nonnegative(), // percentage points
  loan_amount: finiteNumber.positive(), // THB
  acc_open_past_24mths: finiteNumber.nonnegative(),
  bc_util: finiteNumber.nonnegative(), // ratio; may exceed 1 for over-limit accounts
  lti: finiteNumber.nonnegative(),
  interest_burden: finiteNumber.nonnegative(),
  credit_score: finiteNumber.nonnegative(), // bureau-native score; no unapproved scale conversion
  int_rate: finiteNumber.min(0).max(1),
  revol_util: finiteNumber.nonnegative(), // ratio; may exceed 1 for over-limit accounts
  term_months: z.number().int().positive(),
}).strict();
export type NexusRiskFeatures = z.infer<typeof NexusRiskFeaturesSchema>;

const NexusFeatureMetadataByNameSchema = z.object({
  annual_income: z.string().min(1),
  dti: z.string().min(1),
  loan_amount: z.string().min(1),
  acc_open_past_24mths: z.string().min(1),
  bc_util: z.string().min(1),
  lti: z.string().min(1),
  interest_burden: z.string().min(1),
  credit_score: z.string().min(1),
  int_rate: z.string().min(1),
  revol_util: z.string().min(1),
  term_months: z.string().min(1),
}).strict();

export const NexusFeatureSnapshotContractSchema = z.object({
  schema_version: z.literal(NEXUS_RISK_FEATURE_SCHEMA_VERSION),
  feature_generation_version: z.string().min(1),
  source_application_version_id: z.uuid(),
  created_at: z.iso.datetime({ offset: true }),
  feature_values: NexusRiskFeaturesSchema,
  feature_units: NexusFeatureMetadataByNameSchema,
  source_mapping: NexusFeatureMetadataByNameSchema,
}).strict();

export const VersionedRiskRequestSchema = z
  .object({
    schema_version: z.literal(RISK_FEATURE_SCHEMA_VERSION),
    features: RiskFeaturesSchema,
  })
  .strict();

export const PredictionPersistenceRequestSchema = z
  .object({
    schema_version: z.literal("nexus_prediction_persist_request.v1"),
    application_version_id: z.uuid(),
    model_version_id: z.uuid(),
    prediction_type: z.enum(["PRELIMINARY", "OFFICIAL", "DIAGNOSTIC"]),
    feature_generation_version: z.string().trim().min(1).max(50),
    feature_values: RiskFeaturesSchema,
    feature_units: FeatureMetadataByNameSchema,
    source_mapping: FeatureMetadataByNameSchema,
  })
  .strict();

// Raw feature objects are temporarily accepted as v1 for existing callers.
export const RiskRequestSchema = z.union([
  VersionedRiskRequestSchema,
  RiskFeaturesSchema,
]);

const TierSchema = z
  .object({
    tier_code: z.string(),
    tier_name: z.string(),
    risk_level: z.string(),
    action_code: z.string(),
    rate_markup: finiteNumber,
    ui_badge_color: z.string(),
  })
  .strict();

const PredictionSchema = z
  .object({
    default_probability: finiteNumber.min(0).max(1),
    tier: TierSchema,
    spatial_metrics: z
      .object({
        macro_cluster: z.number().int(),
        quantization_distance: finiteNumber.nonnegative(),
      })
      .strict(),
  })
  .strict();

// JSON stored in PredictionRecord.predictionOutput. The prediction fields
// match the item output in the API response, with a persisted-document version.
export const PersistedPredictionOutputSchema = PredictionSchema.extend({
  schema_version: z.literal(PERSISTED_PREDICTION_OUTPUT_SCHEMA_VERSION),
}).strict();

// No producer or approved non-null field catalog exists yet.
export const PredictionRecordExplanationSchema = z.null();

export const PredictionBatchResponseSchema = z
  .object({
    schema_version: z.literal(RISK_RESPONSE_SCHEMA_VERSION),
    status: z.enum(["success", "partial_success"]),
    processed_count: z.number().int().nonnegative(),
    data: z.array(
      z.object({ index: z.number().int().nonnegative(), prediction: PredictionSchema }).strict(),
    ),
    errors: z.array(
      z.object({
        index: z.number().int().nonnegative(),
        error_code: z.string(),
        details: z.array(
          z.object({ field: z.string().nullable(), message: z.string() }).strict(),
        ),
      }).strict(),
    ),
  })
  .strict()
  .superRefine((response, ctx) => {
    if (response.processed_count !== response.data.length) {
      ctx.addIssue({ code: "custom", path: ["processed_count"], message: "must equal data length" });
    }
    const dataIndices = response.data.map((item) => item.index);
    const errorIndices = response.errors.map((item) => item.index);
    if (new Set(dataIndices).size !== dataIndices.length) {
      ctx.addIssue({ code: "custom", path: ["data"], message: "indices must be unique" });
    }
    if (new Set(errorIndices).size !== errorIndices.length) {
      ctx.addIssue({ code: "custom", path: ["errors"], message: "indices must be unique" });
    }
    if (dataIndices.some((index) => errorIndices.includes(index))) {
      ctx.addIssue({ code: "custom", message: "an index cannot be both successful and erroneous" });
    }
    if (response.status === "success" && response.errors.length > 0) {
      ctx.addIssue({ code: "custom", path: ["status"], message: "success response cannot have errors" });
    }
    if (response.status === "partial_success" && response.errors.length === 0) {
      ctx.addIssue({ code: "custom", path: ["status"], message: "partial_success requires errors" });
    }
  });

export type RiskFeatures = z.infer<typeof RiskFeaturesSchema>;
export type VersionedRiskRequest = z.infer<typeof VersionedRiskRequestSchema>;
export type FeatureSnapshotContract = z.infer<typeof FeatureSnapshotContractSchema>;
export type PredictionBatchResponse = z.infer<typeof PredictionBatchResponseSchema>;
export type PersistedPredictionOutput = z.infer<typeof PersistedPredictionOutputSchema>;

const RecommendationRangeSchema = z
  .object({ min: z.number().finite().nonnegative(), max: z.number().finite().nonnegative() })
  .strict()
  .refine((range) => range.min <= range.max, "min must not exceed max");

export const InvestorPreferenceContractSchema = z
  .object({
    schema_version: z.literal("nexus_investor_preference.v1"),
    risk_tier: z.array(z.enum(["TIER_A", "TIER_B", "TIER_C", "TIER_D"])).min(1),
    interest_rate: RecommendationRangeSchema,
    loan_duration: RecommendationRangeSchema,
    investment_amount: RecommendationRangeSchema,
    loan_purpose: z.array(z.enum(["business", "education", "medical", "personal", "home", "other"])).min(1),
  })
  .strict();

// Persisted financial amounts are satang. Investor preference amounts and the
// Python recommendation algorithm use THB; the adapter converts the remaining
// funding amount to THB before scoring.
export const DynamicRecommendationCandidateSchema = z.object({
  loan_id: z.uuid(),
  principal_satang: z.number().int().positive().safe(),
  funded_satang: z.number().int().nonnegative().safe(),
  annual_interest_rate: z.number().finite().min(0).max(1),
  term_months: z.number().int().positive(),
  loan_purpose: z.enum(["business", "education", "medical", "personal", "home", "other"]),
  risk_tier: z.enum(["TIER_A", "TIER_B", "TIER_C", "TIER_D"]),
}).strict().refine((candidate) => candidate.funded_satang < candidate.principal_satang, "Candidate must have remaining funding capacity.");

export const DynamicRecommendationRequestSchema = z.object({
  schema_version: z.literal("nexus_investor_recommendation_request.v1"),
  preferences: InvestorPreferenceContractSchema,
  candidates: z.array(DynamicRecommendationCandidateSchema).max(200),
}).strict().superRefine((request, ctx) => {
  const ids = new Set<string>();
  request.candidates.forEach((candidate, index) => {
    if (ids.has(candidate.loan_id)) ctx.addIssue({ code: "custom", path: ["candidates", index, "loan_id"], message: "Candidate loan IDs must be unique." });
    ids.add(candidate.loan_id);
  });
});

export const DynamicRecommendationResponseSchema = z.object({
  schema_version: z.literal("nexus_investor_recommendation_response.v1"),
  recommendations: z.array(z.object({
    loan_id: z.uuid(),
    score: z.number().finite().min(0).max(1),
    feature_scores: z.object({
      risk_tier: z.number().finite().min(0).max(1),
      interest_rate: z.number().finite().min(0).max(1),
      loan_duration: z.number().finite().min(0).max(1),
      loan_amount: z.number().finite().min(0).max(1),
      loan_purpose: z.number().finite().min(0).max(1),
    }).strict(),
  }).strict()),
}).strict().superRefine((response, ctx) => {
  const ids = new Set<string>();
  response.recommendations.forEach((recommendation, index) => {
    if (ids.has(recommendation.loan_id)) ctx.addIssue({ code: "custom", path: ["recommendations", index, "loan_id"], message: "Recommendation loan IDs must be unique." });
    ids.add(recommendation.loan_id);
  });
});

export const RecommendationResultExplanationSchema = z
  .object({
    schema_version: z.literal("nexus_recommendation_explanation.v1"),
    algorithm: z.literal("content_based_cosine_similarity"),
    feature_scores: z
      .object({
        risk_tier: z.number().finite().min(0).max(1),
        interest_rate: z.number().finite().min(0).max(1),
        loan_duration: z.number().finite().min(0).max(1),
        loan_amount: z.number().finite().min(0).max(1),
        loan_purpose: z.number().finite().min(0).max(1),
      })
      .strict(),
  })
  .strict();

export const RecommendationRunPreferenceSnapshotSchema = z
  .object({
    schema_version: z.literal("nexus_recommendation_preferences_snapshot.v1"),
    captured_at: z.iso.datetime({ offset: true }),
    preferences: InvestorPreferenceContractSchema,
  })
  .strict();

const RecommendationCandidateSchema = z
  .object({
    loan_id: z.union([z.number().int(), z.string().min(1)]),
    borrower_id: z.union([z.number().int(), z.string().min(1)]),
    status: z.enum(["DRAFT", "OPEN", "FUNDED", "CANCELLED", "EXPIRED"]),
    amount: z
      .object({
        total: z.number().finite().positive(),
        funded: z.number().finite().nonnegative(),
        remaining: z.number().finite().nonnegative(),
        investment: z
          .object({ min: z.number().finite().nonnegative(), max: z.number().finite().positive() })
          .strict(),
      })
      .strict(),
    terms: z
      .object({
        interest_rate: z.number().finite().nonnegative(), // percentage points
        loan_duration: z.number().int().positive(), // months
        loan_purpose: z.enum(["business", "education", "medical", "personal", "home", "other"]),
      })
      .strict(),
    prediction: z
      .object({
        default_probability: z.number().finite().min(0).max(1),
        tier: TierSchema,
        spatial_metrics: z
          .object({
            macro_cluster: z.number().int(),
            quantization_distance: z.number().finite().nonnegative(),
          })
          .strict(),
      })
      .strict(),
    restrictions: z
      .object({
        allowed_investor_types: z.array(z.string().min(1)).min(1),
        allowed_countries: z.array(z.string().min(1)).min(1),
        minimum_age: z.number().int().nonnegative(),
        qualified_investor_required: z.boolean(),
      })
      .strict(),
    timing: z
      .object({
        opens_at: z.iso.datetime({ offset: true }),
        closes_at: z.iso.datetime({ offset: true }),
      })
      .strict(),
  })
  .strict();

export const RecommendationRunCandidateSnapshotSchema = z
  .object({
    schema_version: z.literal("nexus_recommendation_candidates_snapshot.v1"),
    captured_at: z.iso.datetime({ offset: true }),
    candidates: z.array(RecommendationCandidateSchema),
  })
  .strict();

const InvestorBehaviorEventDataSchema = z
  .object({
    schema_version: z.literal("nexus_investor_behavior.v1"),
    surface: z.enum(["marketplace", "recommendations", "saved_loans"]),
    recommendation_run_id: z.uuid().optional(),
    recommendation_position: z.number().int().positive().optional(),
  })
  .strict();

const RecommendationContextCheck = <T extends z.ZodType>(schema: T) =>
  schema.superRefine((event, ctx) => {
    const data = (event as { event_data: z.infer<typeof InvestorBehaviorEventDataSchema> }).event_data;
    if (data.surface !== "recommendations" && (data.recommendation_run_id || data.recommendation_position !== undefined)) {
      ctx.addIssue({ code: "custom", message: "recommendation context is allowed only on recommendations surface" });
    }
  });

export const LoanViewedEventContractSchema = RecommendationContextCheck(
  z.object({
    event_type: z.literal("LOAN_VIEWED"),
    loan_id: z.uuid(),
    event_data: InvestorBehaviorEventDataSchema,
  }).strict(),
);

export const LoanComparedEventContractSchema = RecommendationContextCheck(
  z.object({
    event_type: z.literal("LOAN_COMPARED"),
    loan_id: z.uuid(),
    event_data: InvestorBehaviorEventDataSchema.extend({
      comparison_id: z.uuid(),
      comparison_set_size: z.number().int().min(2).max(3),
    }).strict(),
  }).strict(),
);

export const InvestorBehaviorEventContractSchema = z.union([
  LoanViewedEventContractSchema,
  LoanComparedEventContractSchema,
]);
