import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as evaluateBorrower } from "../../src/app/api/ml/borrower-evaluation/route";
import { GET as getBorrowerEvaluation } from "../../src/app/api/ml/borrower-evaluation/[evaluationId]/route";
import { GET as getRecommendations, POST as refreshRecommendations } from "../../src/app/api/ml/investor-recommendations/route";
import { prisma } from "../../src/lib/prisma";
import { createAuthenticatedApiRequest, expectApiError, expectApiSuccess } from "../helpers/api";

const sessionUserIds = new Set<string>();
const SERVICE_TOKEN = "api06-test-ml-service-token-32-bytes";
const featureValues = { annual_income: 75000, dti: 16.5, loan_amount: 12000, acc_open_past_24mths: 2, bc_util: 0.195, lti: 0.16, interest_burden: 0.0184, sub_grade_num: 12, int_rate: 0.115, revol_util: 0.382, term_months: 36 };
const featureMeta = { annual_income: "THB/year", dti: "%", loan_amount: "THB", acc_open_past_24mths: "count", bc_util: "ratio", lti: "ratio", interest_burden: "ratio", sub_grade_num: "ordinal", int_rate: "ratio", revol_util: "ratio", term_months: "months" };

async function createIdentity(roleCode: "BORROWER" | "INVESTOR") {
  const role = await prisma.role.upsert({ where: { code: roleCode }, create: { code: roleCode, name: roleCode }, update: {}, select: { id: true } });
  const user = await prisma.user.create({ data: { email: `${randomUUID()}@api06.test`, accountStatus: "ACTIVE" }, select: { id: true } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({ data: { userId: user.id, sessionTokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  sessionUserIds.add(user.id);
  return { userId: user.id, token, roleCode };
}

function apiRequest(identity: Awaited<ReturnType<typeof createIdentity>>, url: string, init: RequestInit = {}) {
  return createAuthenticatedApiRequest(url, { userId: identity.userId, role: identity.roleCode, sessionCookie: identity.token }, init);
}

async function createEvaluationFixture() {
  const identity = await createIdentity("BORROWER");
  const profile = await prisma.borrowerProfile.create({ data: { userId: identity.userId, legalName: "API06 Borrower", address: { country: "Thailand" } }, select: { id: true } });
  const application = await prisma.loanApplication.create({ data: { borrowerProfileId: profile.id, status: "SUBMITTED", submittedAt: new Date() }, select: { id: true } });
  const version = await prisma.applicationVersion.create({ data: { applicationId: application.id, versionNumber: 1, submittedData: { schema_version: "application_snapshot.v1" }, requestedPrincipalSatang: 300_000n, requestedTermMonths: 3, submittedAt: new Date(), createdByUserId: identity.userId }, select: { id: true } });
  await prisma.loanApplication.update({ where: { id: application.id }, data: { currentVersionId: version.id } });
  const model = await prisma.modelVersion.create({ data: { modelName: `api06-risk-${randomUUID()}`, version: "1", artifactLocation: "test://model", artifactChecksum: randomUUID(), featureSchemaVersion: "nexus_risk_features.v1", status: "APPROVED", isActive: true }, select: { id: true } });
  const snapshot = await prisma.featureSnapshot.create({ data: { applicationVersionId: version.id, featureSchemaVersion: "nexus_risk_features.v1", featureGenerationVersion: "api06-fixture.v1", featureValues, featureUnits: featureMeta, sourceMapping: featureMeta } , select: { id: true } });
  return { identity, applicationId: application.id, applicationVersionId: version.id, modelVersionId: model.id, featureSnapshotId: snapshot.id };
}

function validPredictionResponse() {
  return { schema_version: "nexus_prediction_batch.v1", status: "success", processed_count: 1, errors: [], data: [{ index: 0, prediction: { default_probability: 0.1, tier: { tier_code: "TIER_A", tier_name: "Tier A", risk_level: "LOW", action_code: "APPROVE", rate_markup: 0, ui_badge_color: "green" }, spatial_metrics: { macro_cluster: 2, quantization_distance: 0.15 } } }] };
}

async function createInvestorWithEligibleLoan() {
  const identity = await createIdentity("INVESTOR");
  const investorProfile = await prisma.investorProfile.create({ data: { userId: identity.userId, displayName: "API06 Investor" }, select: { id: true } });
  await prisma.investorPreference.create({ data: { investorProfileId: investorProfile.id, preferenceData: { schema_version: "nexus_investor_preference.v2", interest_rate: { min: 5, max: 25 }, loan_duration: { min: 3, max: 36 }, investment_amount: { min: 10000, max: 1000000 }, loan_purpose: ["education", "business"] } } });
  const adminRole = await prisma.role.upsert({ where: { code: "ADMIN" }, create: { code: "ADMIN", name: "ADMIN" }, update: {}, select: { id: true } });
  const admin = await prisma.user.create({ data: { email: `${randomUUID()}@api06-admin.test`, accountStatus: "ACTIVE" }, select: { id: true } });
  await prisma.userRole.create({ data: { userId: admin.id, roleId: adminRole.id } });
  const borrower = await prisma.user.create({ data: { email: `${randomUUID()}@api06-loan.test`, accountStatus: "ACTIVE" }, select: { id: true } });
  const borrowerProfile = await prisma.borrowerProfile.create({ data: { userId: borrower.id, legalName: "Marketplace Borrower", address: { country: "Thailand" } }, select: { id: true } });
  const application = await prisma.loanApplication.create({ data: { borrowerProfileId: borrowerProfile.id, status: "APPROVED" }, select: { id: true } });
  const version = await prisma.applicationVersion.create({ data: { applicationId: application.id, versionNumber: 1, submittedData: { requested_loan: { purpose: "education" } }, requestedPrincipalSatang: 2_000_000n, requestedTermMonths: 12, createdByUserId: borrower.id }, select: { id: true } });
  await prisma.loanApplication.update({ where: { id: application.id }, data: { currentVersionId: version.id } });
  const offer = await prisma.loanOffer.create({ data: { applicationId: application.id, applicationVersionId: version.id, principalSatang: 2_000_000n, annualInterestRate: "0.12", termMonths: 12, expiresAt: new Date(Date.now() + 7 * 86_400_000), status: "ACCEPTED", acceptedAt: new Date(), createdByUserId: admin.id }, select: { id: true } });
  const loan = await prisma.loan.create({ data: { borrowerProfileId: borrowerProfile.id, applicationId: application.id, acceptedOfferId: offer.id, principalSatang: 2_000_000n, annualInterestRate: "0.12", termMonths: 12, status: "FUNDING", fundingDeadline: new Date(Date.now() + 7 * 86_400_000) }, select: { id: true } });
  const escrowPlatformAccount = await prisma.platformAccount.upsert({
    where: { accountCode: "2200" },
    update: { status: "ACTIVE" },
    create: { accountCode: "2200", accountName: "Shared Simulated Escrow", accountType: "LIABILITY", currency: "THB", status: "ACTIVE" },
    select: { id: true },
  });
  const escrowWallet = await prisma.wallet.upsert({
    where: { ownerPlatformAccountId: escrowPlatformAccount.id },
    update: { status: "ACTIVE", currency: "THB" },
    create: { ownerPlatformAccountId: escrowPlatformAccount.id, balanceSatang: 0n, currency: "THB", status: "ACTIVE" },
    select: { id: true },
  });
  await prisma.escrowAccount.create({ data: { loanId: loan.id, platformWalletId: escrowWallet.id, status: "OPEN" } });
  return { identity, investorProfileId: investorProfile.id, loanId: loan.id };
}

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  if (sessionUserIds.size) await prisma.session.deleteMany({ where: { userId: { in: [...sessionUserIds] } } });
  sessionUserIds.clear();
});

describe("API-06 Python ML integration APIs", () => {
  it("API-06-01 evaluates the authenticated borrower's application and persists a valid result", async () => {
    const context = await createEvaluationFixture();
    vi.stubEnv("ML_SERVICE_URL", "http://ml.test");
    vi.stubEnv("ML_SERVICE_TOKEN", SERVICE_TOKEN);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(validPredictionResponse())));
    const response = await evaluateBorrower(apiRequest(context.identity, "http://localhost/api/ml/borrower-evaluation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ applicationId: context.applicationId }) }));
    const result = await expectApiSuccess<{ predictionRecordId: string; prediction: { default_probability: number } }>(response, 201);
    expect(result.prediction.default_probability).toBe(0.1);
    expect(await prisma.predictionRecord.count({ where: { id: result.predictionRecordId, modelVersionId: context.modelVersionId } })).toBe(1);
  });

  it("API-06-02 rejects invalid evaluation input", async () => {
    const context = await createEvaluationFixture();
    const response = await evaluateBorrower(apiRequest(context.identity, "http://localhost/api/ml/borrower-evaluation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ applicationId: "not-a-uuid", feature_values: featureValues }) }));
    await expectApiError(response, { status: 400, code: "VALIDATION_ERROR" });
  });

  it("API-06-03 denies an authenticated borrower who does not own the application", async () => {
    const owner = await createEvaluationFixture();
    const other = await createIdentity("BORROWER");
    await prisma.borrowerProfile.create({ data: { userId: other.userId, legalName: "Other API06 Borrower", address: { country: "Thailand" } } });
    const response = await evaluateBorrower(apiRequest(other, "http://localhost/api/ml/borrower-evaluation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ applicationId: owner.applicationId }) }));
    await expectApiError(response, { status: 404, code: "NOT_FOUND" });
  });

  it("API-06-04 returns a controlled 503 when the Python service is unavailable", async () => {
    const context = await createEvaluationFixture();
    vi.stubEnv("ML_SERVICE_URL", "http://ml.test");
    vi.stubEnv("ML_SERVICE_TOKEN", SERVICE_TOKEN);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("connect ECONNREFUSED")));
    await expectApiError(await evaluateBorrower(apiRequest(context.identity, "http://localhost/api/ml/borrower-evaluation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ applicationId: context.applicationId }) })), { status: 503, code: "ML_SERVICE_UNAVAILABLE" });
  });

  it("API-06-05 returns a controlled timeout response", async () => {
    const context = await createEvaluationFixture();
    vi.stubEnv("ML_SERVICE_URL", "http://ml.test");
    vi.stubEnv("ML_SERVICE_TOKEN", SERVICE_TOKEN);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new DOMException("request timed out", "TimeoutError")));
    await expectApiError(await evaluateBorrower(apiRequest(context.identity, "http://localhost/api/ml/borrower-evaluation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ applicationId: context.applicationId }) })), { status: 504, code: "ML_SERVICE_TIMEOUT" });
  });

  it("API-06-06 rejects invalid Python output without persisting a prediction", async () => {
    const context = await createEvaluationFixture();
    vi.stubEnv("ML_SERVICE_URL", "http://ml.test");
    vi.stubEnv("ML_SERVICE_TOKEN", SERVICE_TOKEN);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ status: "success", data: [{ prediction: { default_probability: 1.5 } }] })));
    await expectApiError(await evaluateBorrower(apiRequest(context.identity, "http://localhost/api/ml/borrower-evaluation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ applicationId: context.applicationId }) })), { status: 502, code: "INVALID_ML_RESPONSE" });
    expect(await prisma.predictionRecord.count({ where: { modelVersionId: context.modelVersionId } })).toBe(0);
  });

  it("API-06-07 ranks eligible loans from investor preferences without an active risk model", async () => {
    const context = await createInvestorWithEligibleLoan();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const response = await refreshRecommendations(apiRequest(context.identity, "http://localhost/api/ml/investor-recommendations", { method: "POST" }));
    const result = await expectApiSuccess<{ recommendationRunId: string; modelVersionId: string | null; recommendations: Array<{ loanId: string; score: string; explanation: { feature_scores: Record<string, number> } }> }>(response, 201);
    expect(result.recommendations.length).toBeGreaterThan(0);
    expect(result.recommendations.every((item) => Number(item.score) >= 0 && Number(item.score) <= 1)).toBe(true);
    expect(result.modelVersionId).toBeNull();
    expect(Object.keys(result.recommendations[0].explanation.feature_scores)).toEqual(["interest_rate", "loan_duration", "investment_amount", "loan_purpose"]);
    expect(Object.values(result.recommendations[0].explanation.feature_scores).every((score) => score >= 0 && score <= 1)).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("API-06-08 excludes expired funding opportunities from deterministic recommendations", async () => {
    const context = await createInvestorWithEligibleLoan();
    await prisma.loan.update({ where: { id: context.loanId }, data: { fundingDeadline: new Date(Date.now() - 1000) } });
    const result = await expectApiSuccess<{ recommendations: Array<{ loanId: string }> }>(await refreshRecommendations(apiRequest(context.identity, "http://localhost/api/ml/investor-recommendations", { method: "POST" })), 201);
    expect(result.recommendations.some((item) => item.loanId === context.loanId)).toBe(false);
  });

  it("API-06-09 does not return another investor's recommendation run", async () => {
    const owner = await createInvestorWithEligibleLoan();
    const requester = await createInvestorWithEligibleLoan();
    const run = await prisma.recommendationRun.create({ data: { investorProfileId: owner.investorProfileId, modelVersionId: null, preferenceSnapshot: { schema_version: "nexus_recommendation_preferences_snapshot.v2", captured_at: new Date().toISOString(), preferences: { schema_version: "nexus_investor_preference.v2", interest_rate: { min: 0, max: 20 }, loan_duration: { min: 1, max: 24 }, investment_amount: { min: 1, max: 100 }, loan_purpose: ["education"] } }, candidateSetSnapshot: { schema_version: "nexus_recommendation_candidates_snapshot.v3", candidates: [] }, inputVersion: "nexus_investor_preference_match.v1" }, select: { id: true } });
    await expectApiError(await getRecommendations(apiRequest(requester.identity, `http://localhost/api/ml/investor-recommendations?runId=${run.id}`)), { status: 404, code: "NOT_FOUND" });
  });

  it("API-06-10 persists model-independent recommendation metadata and results", async () => {
    const context = await createInvestorWithEligibleLoan();
    const result = await expectApiSuccess<{ recommendationRunId: string; recommendations: Array<{ loanId: string }> }>(await refreshRecommendations(apiRequest(context.identity, "http://localhost/api/ml/investor-recommendations", { method: "POST" })), 201);
    const run = await prisma.recommendationRun.findUniqueOrThrow({ where: { id: result.recommendationRunId }, include: { results: true } });
    expect(run.investorProfileId).toBe(context.investorProfileId);
    expect(run.modelVersionId).toBeNull();
    expect(run.results).toHaveLength(result.recommendations.length);
    expect(new Set(run.results.map((item) => item.loanId))).toEqual(new Set(result.recommendations.map((item) => item.loanId)));
  });

  it("returns a persisted borrower evaluation only to its borrower", async () => {
    const context = await createEvaluationFixture();
    vi.stubEnv("ML_SERVICE_URL", "http://ml.test");
    vi.stubEnv("ML_SERVICE_TOKEN", SERVICE_TOKEN);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(validPredictionResponse())));
    const created = await expectApiSuccess<{ predictionRecordId: string }>(await evaluateBorrower(apiRequest(context.identity, "http://localhost/api/ml/borrower-evaluation", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ applicationId: context.applicationId }) })), 201);
    const detail = await getBorrowerEvaluation(apiRequest(context.identity, `http://localhost/api/ml/borrower-evaluation/${created.predictionRecordId}`), { params: Promise.resolve({ evaluationId: created.predictionRecordId }) });
    await expectApiSuccess<{ predictionRecordId: string }>(detail);
  });
});
