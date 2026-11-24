import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { GET as getProfile, PATCH as patchProfile } from "../../src/app/api/investor/profile/route";
import { GET as getMarketplace } from "../../src/app/api/investor/marketplace/route";
import { GET as getMarketplaceLoan } from "../../src/app/api/investor/marketplace/[loanId]/route";
import { GET as listInvestments, POST as createInvestment } from "../../src/app/api/investor/investments/route";
import { GET as getInvestment } from "../../src/app/api/investor/investments/[investmentId]/route";
import { GET as getPortfolio } from "../../src/app/api/investor/portfolio/route";
import { GET as getInvestorDashboardOverview } from "../../src/app/api/investor/dashboard/overview/route";
import { GET as getPreferences, PUT as savePreferences } from "../../src/app/api/investor/preferences/route";
import { GET as getInvestorWallet } from "../../src/app/api/investor/wallet/route";
import { GET as listPayouts } from "../../src/app/api/investor/payouts/route";
import { GET as getPayout } from "../../src/app/api/investor/payouts/[payoutId]/route";
import { POST as initiatePayout } from "../../src/app/api/investor/payouts/route";
import { GET as listAllocations } from "../../src/app/api/investor/allocations/route";
import { prisma } from "../../src/lib/prisma";
import { postInvestorPayout } from "../../src/lib/services/investor-payout.service";
import { submitRepayment } from "../../src/lib/services/repayment/repayment-submitrepayment";
import { createRepaymentAllocationLifecycleContext } from "../fixtures/repayment-allocation.fixture";
import { activateRepaymentTestAccounts } from "../fixtures/repayment.fixture";
import { createInvestorContributionFixture, fundInvestorWallet } from "../fixtures/investor-contribution.fixture";
import { createAuthenticatedApiRequest, expectApiError, expectApiSuccess } from "../helpers/api";

type Investor = { userId: string; profileId: string; token: string; loanId: string; walletId: string };
const sessionUsers = new Set<string>();
const lifecycleContexts: Array<Awaited<ReturnType<typeof createRepaymentAllocationLifecycleContext>>> = [];
const accountActivations: Array<Awaited<ReturnType<typeof activateRepaymentTestAccounts>>> = [];

async function createNonInvestor() {
  const role = await prisma.role.upsert({ where: { code: "BORROWER" }, create: { code: "BORROWER", name: "Borrower" }, update: {}, select: { id: true } });
  const user = await prisma.user.create({ data: { email: `${randomUUID()}@non-investor-api.test`, accountStatus: "ACTIVE" }, select: { id: true } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({ data: { userId: user.id, sessionTokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  sessionUsers.add(user.id);
  return { userId: user.id, token };
}

async function createInvestor(): Promise<Investor> {
  accountActivations.push(await activateRepaymentTestAccounts());
  const role = await prisma.role.upsert({ where: { code: "INVESTOR" }, create: { code: "INVESTOR", name: "Investor" }, update: {}, select: { id: true } });
  const user = await prisma.user.create({ data: { email: `${randomUUID()}@investor-api.test`, accountStatus: "ACTIVE" }, select: { id: true } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  const profile = await prisma.investorProfile.create({ data: { userId: user.id, displayName: "API Investor" }, select: { id: true } });
  const wallet = await prisma.wallet.create({ data: { ownerUserId: user.id, currency: "THB", balanceSatang: 0n, status: "ACTIVE" }, select: { id: true } });
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({ data: { userId: user.id, sessionTokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  sessionUsers.add(user.id);
  const admin = await prisma.user.findFirstOrThrow({ where: { roles: { some: { role: { code: "ADMIN" }, revokedAt: null } } }, select: { id: true } });
  await fundInvestorWallet({ walletId: wallet.id, administratorUserId: admin.id, amountSatang: 2_000_000n });
  const fixture = await createInvestorContributionFixture({ administratorUserId: admin.id });
  return { userId: user.id, profileId: profile.id, token, loanId: fixture.loan.id, walletId: wallet.id };
}

function request(investor: Investor, url: string, init: RequestInit = {}): Request {
  return createAuthenticatedApiRequest(url, { userId: investor.userId, role: "INVESTOR", sessionCookie: investor.token }, init);
}

afterEach(async () => {
  if (sessionUsers.size) await prisma.session.deleteMany({ where: { userId: { in: [...sessionUsers] } } });
  sessionUsers.clear();
  for (const context of lifecycleContexts.splice(0).reverse()) await context.cleanup();
  for (const activation of accountActivations.splice(0).reverse()) await activation.cleanup();
});

describe("API-04 investor APIs", () => {
  it("API-04-20 returns independently scoped dashboard sections in one authenticated request", async () => {
    const investor = await createInvestor();
    const result = await expectApiSuccess<{
      portfolio: { status: string; data?: { investorProfileId: string } };
      investments: { status: string; data?: Array<{ id: string; loan: { id: string } }> };
      payouts: { status: string; data?: unknown[] };
      wallet: { status: string; data?: { wallet: { balanceSatang: string } | null; transactions: unknown[] } };
    }>(await getInvestorDashboardOverview(request(investor, "http://localhost/api/investor/dashboard/overview")));
    expect(result.portfolio.data?.investorProfileId).toBe(investor.profileId);
    expect(result.investments.status).toBe("success");
    expect(result.payouts.status).toBe("success");
    expect(result.wallet.status).toBe("success");
  });

  it("API-04-01 returns only the authenticated investor profile", async () => {
    const investor = await createInvestor();
    const profile = await expectApiSuccess<{ id: string; displayName: string }>(await getProfile(request(investor, "http://localhost/api/investor/profile")));
    expect(profile).toMatchObject({ id: investor.profileId, displayName: "API Investor" });
  });

  it("API-04-20 returns the investor's persisted wallet and posted ledger activity only", async () => {
    const investor = await createInvestor();
    const response = await getInvestorWallet(request(investor, "http://localhost/api/investor/wallet?page=1&limit=10"));
    const result = await expectApiSuccess<{ wallet: { balanceSatang: string; currency: string; status: string }; transactions: Array<{ amountSatang: string; status: string }>; pagination: { total: number } }>(response);
    expect(result.wallet).toMatchObject({ currency: "THB", status: "ACTIVE" });
    expect(result.wallet.balanceSatang).toMatch(/^\d+$/);
    expect(result.transactions.every((row) => row.status === "POSTED" && /^\d+$/.test(row.amountSatang))).toBe(true);
    expect(result.pagination.total).toBeGreaterThan(0);
  });

  it("API-04-21 rejects a borrower from the investor wallet activity endpoint", async () => {
    const borrower = await createNonInvestor();
    const response = await getInvestorWallet(createAuthenticatedApiRequest("http://localhost/api/investor/wallet", { userId: borrower.userId, role: "BORROWER", sessionCookie: borrower.token }));
    await expectApiError(response, { status: 403, code: "FORBIDDEN" });
  });

  it("API-04-22 reads and saves only the authenticated investor's recommendation preferences", async () => {
    const investor = await createInvestor();
    const initial = await expectApiSuccess<{ preferences: unknown | null }>(await getPreferences(request(investor, "http://localhost/api/investor/preferences")));
    expect(initial.preferences).toBeNull();
    const preferences = { schema_version: "nexus_investor_preference.v2", interest_rate: { min: 0, max: 18 }, loan_duration: { min: 3, max: 24 }, investment_amount: { min: 1000, max: 50000 }, loan_purpose: ["education", "business"] };
    const saved = await expectApiSuccess<{ preferences: typeof preferences }>(await savePreferences(request(investor, "http://localhost/api/investor/preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(preferences) })));
    expect(saved.preferences).toEqual(preferences);
    const loaded = await expectApiSuccess<{ preferences: typeof preferences }>(await getPreferences(request(investor, "http://localhost/api/investor/preferences")));
    expect(loaded.preferences).toEqual(preferences);
  });

  it("API-04-23 rejects invalid recommendation preferences", async () => {
    const investor = await createInvestor();
    await expectApiError(await savePreferences(request(investor, "http://localhost/api/investor/preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ schema_version: "wrong", risk_tier: [] }) })), { status: 400, code: "VALIDATION_ERROR" });
  });

  it("normalizes previously saved model-dependent preferences for preference matching", async () => {
    const investor = await createInvestor();
    await prisma.investorPreference.create({ data: { investorProfileId: investor.profileId, preferenceData: { schema_version: "nexus_investor_preference.v1", risk_tier: ["TIER_A"], interest_rate: { min: 5, max: 12 }, loan_duration: { min: 3, max: 24 }, investment_amount: { min: 1000, max: 50000 }, loan_purpose: ["education"] } } });

    const loaded = await expectApiSuccess<{ preferences: { schema_version: string; interest_rate: { min: number; max: number }; loan_purpose: string[] } }>(await getPreferences(request(investor, "http://localhost/api/investor/preferences")));
    expect(loaded.preferences.schema_version).toBe("nexus_investor_preference.v2");
    expect(loaded.preferences.interest_rate).toEqual({ min: 5, max: 12 });
    expect(loaded.preferences.loan_purpose).toEqual(["education"]);
    expect(loaded.preferences).not.toHaveProperty("risk_tier");
  });

  it("API-04-24 does not allow a borrower to read or save investor preferences", async () => {
    const borrower = await createNonInvestor();
    const api = (method = "GET") => createAuthenticatedApiRequest("http://localhost/api/investor/preferences", { userId: borrower.userId, role: "BORROWER", sessionCookie: borrower.token }, { method, headers: method === "PUT" ? { "content-type": "application/json" } : undefined, body: method === "PUT" ? "{}" : undefined });
    await expectApiError(await getPreferences(api()), { status: 403, code: "FORBIDDEN" });
    await expectApiError(await savePreferences(api("PUT")), { status: 403, code: "FORBIDDEN" });
  });

  it("API-04-02 rejects callers without an investor identity", async () => {
    const borrower = await createNonInvestor();
    const response = await getProfile(createAuthenticatedApiRequest("http://localhost/api/investor/profile", { userId: borrower.userId, role: "BORROWER", sessionCookie: borrower.token }));
    await expectApiError(response, { status: 403, code: "FORBIDDEN" });
  });

  it("API-04-03 lists only loans currently open for funding", async () => {
    const investor = await createInvestor();
    const response = await getMarketplace(request(investor, "http://localhost/api/investor/marketplace"));
    const rows = await expectApiSuccess<Array<{ id: string; status: string }>>(response);
    expect(rows.some((row) => row.id === investor.loanId && row.status === "FUNDING")).toBe(true);
    expect(rows.every((row) => row.status === "FUNDING")).toBe(true);
  });

  it("API-04-04 never exposes private borrower identity in marketplace results", async () => {
    const investor = await createInvestor();
    const loan = await expectApiSuccess<Record<string, unknown>>(await getMarketplaceLoan(
      request(investor, `http://localhost/api/investor/marketplace/${investor.loanId}`),
      { params: Promise.resolve({ loanId: investor.loanId }) },
    ));
    expect(loan).not.toHaveProperty("borrowerProfile");
    expect(loan).not.toHaveProperty("borrowerName");
    expect(loan).not.toHaveProperty("borrowerEmail");
  });

  it("API-04-05 posts a valid contribution through the funding service", async () => {
    const investor = await createInvestor();
    const response = await createInvestment(request(investor, "http://localhost/api/investor/investments", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": `api-invest-${randomUUID()}` },
      body: JSON.stringify({ loanId: investor.loanId, amountSatang: "100000" }),
    }));
    const contribution = await expectApiSuccess<{ investmentId: string; amountSatang: string }>(response, 201);
    expect(contribution.amountSatang).toBe("100000");
    expect(contribution.investmentId).toBeTruthy();
  });

  it.each(["0", "-1", "not-an-integer", "1000001"])("API-04-06 rejects an invalid investment amount (%s)", async (amountSatang) => {
    const investor = await createInvestor();
    const response = await createInvestment(request(investor, "http://localhost/api/investor/investments", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": `api-invest-${randomUUID()}` },
      body: JSON.stringify({ loanId: investor.loanId, amountSatang }),
    }));
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("API-04-07 rejects investment in a loan that is no longer available", async () => {
    const investor = await createInvestor();
    await prisma.loan.update({ where: { id: investor.loanId }, data: { fundingDeadline: new Date(Date.now() - 1_000) } });
    const response = await createInvestment(request(investor, "http://localhost/api/investor/investments", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": `api-invest-${randomUUID()}` },
      body: JSON.stringify({ loanId: investor.loanId, amountSatang: "100000" }),
    }));
    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it("API-04-08 reuses an identical investment idempotency key without duplicating contribution records", async () => {
    const investor = await createInvestor();
    const key = `api-invest-${randomUUID()}`;
    const makeRequest = () => createInvestment(request(investor, "http://localhost/api/investor/investments", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify({ loanId: investor.loanId, amountSatang: "100000" }),
    }));
    const first = await expectApiSuccess<{ contributionId: string }>(await makeRequest(), 201);
    const second = await expectApiSuccess<{ contributionId: string }>(await makeRequest(), 201);
    expect(second.contributionId).toBe(first.contributionId);
    expect(await prisma.investmentContribution.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it("API-04-09 returns investor-owned investments with backend-aggregated posted contribution totals", async () => {
    const investor = await createInvestor();
    const portfolio = await expectApiSuccess<{ investorProfileId: string; totalInvestedPrincipalSatang: string; wallet: { balanceSatang: string; currency: string; status: string } | null }>(await getPortfolio(request(investor, "http://localhost/api/investor/portfolio")));
    expect(portfolio.investorProfileId).toBe(investor.profileId);
    expect(portfolio.totalInvestedPrincipalSatang).toBe("0");
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: investor.walletId }, select: { balanceSatang: true, currency: true, status: true } });
    expect(portfolio.wallet).toEqual({ balanceSatang: wallet.balanceSatang.toString(), currency: wallet.currency, status: wallet.status });
    const posted = await expectApiSuccess<{ investmentId: string }>(await createInvestment(request(investor, "http://localhost/api/investor/investments", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": `api-invest-${randomUUID()}` },
      body: JSON.stringify({ loanId: investor.loanId, amountSatang: "100000" }),
    })), 201);
    await expectApiSuccess<{ investmentId: string }>(await createInvestment(request(investor, "http://localhost/api/investor/investments", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": `api-invest-${randomUUID()}` },
      body: JSON.stringify({ loanId: investor.loanId, amountSatang: "200000" }),
    })), 201);
    for (let index = 0; index < 4; index += 1) {
      await expectApiSuccess<{ investmentId: string }>(await createInvestment(request(investor, "http://localhost/api/investor/investments", {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": `api-invest-${randomUUID()}` },
        body: JSON.stringify({ loanId: investor.loanId, amountSatang: "10000" }),
      })), 201);
    }
    const updatedPortfolio = await expectApiSuccess<{ totalInvestedPrincipalSatang: string }>(await getPortfolio(request(investor, "http://localhost/api/investor/portfolio")));
    expect(updatedPortfolio.totalInvestedPrincipalSatang).toBe("340000");
    const investments = await expectApiSuccess<Array<{ id: string; totalContributedSatang: string; contributionCount: number; hasMoreContributions: boolean; contributions: Array<{ amountSatang: string; ledgerTransaction: { status: string } }> }>>(await listInvestments(request(investor, "http://localhost/api/investor/investments")));
    const ownInvestment = investments.find((investment) => investment.id === posted.investmentId);
    expect(ownInvestment).toBeDefined();
    expect(ownInvestment?.contributions).toHaveLength(5);
    expect(ownInvestment?.contributionCount).toBe(6);
    expect(ownInvestment?.hasMoreContributions).toBe(true);
    expect(ownInvestment?.contributions.every((item) => item.ledgerTransaction.status === "POSTED")).toBe(true);
    expect(ownInvestment?.totalContributedSatang).toBe("340000");
    const detailUrl = `http://localhost/api/investor/investments/${posted.investmentId}?contributionPage=1&contributionLimit=5&allocationPage=1&allocationLimit=5`;
    const detail = await expectApiSuccess<{ totalContributedSatang: string; contributions: unknown[]; contributionCount: number; hasMoreContributions: boolean; contributionPagination: { total: number; totalPages: number; hasNextPage: boolean } }>(await getInvestment(request(investor, detailUrl), { params: Promise.resolve({ investmentId: posted.investmentId }) }));
    expect(detail.totalContributedSatang).toBe("340000");
    expect(detail.contributions).toHaveLength(5);
    expect(detail.contributionCount).toBe(6);
    expect(detail.hasMoreContributions).toBe(true);
    expect(detail.contributionPagination).toMatchObject({ total: 6, totalPages: 2, hasNextPage: true });
    const nextHistoryPage = await expectApiSuccess<{ contributions: unknown[]; contributionPagination: { page: number; hasPreviousPage: boolean; hasNextPage: boolean } }>(await getInvestment(request(investor, `http://localhost/api/investor/investments/${posted.investmentId}?contributionPage=2&contributionLimit=5&allocationPage=1&allocationLimit=5`), { params: Promise.resolve({ investmentId: posted.investmentId }) }));
    expect(nextHistoryPage.contributions).toHaveLength(1);
    expect(nextHistoryPage.contributionPagination).toMatchObject({ page: 2, hasPreviousPage: true, hasNextPage: false });
  });

  it("API-04-10 does not allow an investor to retrieve another investor's investment", async () => {
    const investor = await createInvestor();
    const other = await createInvestor();
    const createResponse = await createInvestment(request(other, "http://localhost/api/investor/investments", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": `api-invest-${randomUUID()}` },
      body: JSON.stringify({ loanId: other.loanId, amountSatang: "100000" }),
    }));
    const created = await expectApiSuccess<{ investmentId: string }>(createResponse, 201);
    const response = await getInvestment(request(investor, `http://localhost/api/investor/investments/${created.investmentId}`), { params: Promise.resolve({ investmentId: created.investmentId }) });
    expect(response.status).toBe(404);
  });

  it("API-04-11 returns persisted completed payout details for the owning investor", async () => {
    const context = await createRepaymentAllocationLifecycleContext(1);
    lifecycleContexts.push(context);
    const investorRole = await prisma.role.upsert({ where: { code: "INVESTOR" }, create: { code: "INVESTOR", name: "Investor" }, update: {}, select: { id: true } });
    await prisma.userRole.create({ data: { userId: context.investorUser.id, roleId: investorRole.id } });
    const token = randomBytes(32).toString("base64url");
    await prisma.session.create({ data: { userId: context.investorUser.id, sessionTokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
    sessionUsers.add(context.investorUser.id);
    const installment = await prisma.installment.findFirstOrThrow({ where: { scheduleVersion: { schedule: { loanId: context.loan.id } }, dueDate: { lte: new Date() }, status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } }, orderBy: [{ dueDate: "asc" }, { installmentNumber: "asc" }] });
    const amountSatang = installment.principalDueSatang - installment.paidPrincipalSatang + installment.interestDueSatang - installment.paidInterestSatang;
    const repayment = await submitRepayment({ loanId: context.loan.id, borrowerUserId: context.borrowerUser.id, amountSatang, idempotencyKey: `api04-payout-history-repayment-${randomUUID()}` });
    const allocation = await prisma.payoutAllocation.findFirstOrThrow({ where: { repayment: { ledgerTransactionId: repayment.ledgerTransactionId }, investment: { investorProfile: { userId: context.investorUser.id } } }, select: { id: true, investmentId: true, repaymentId: true } });
    const posted = await postInvestorPayout({ actorUserId: context.administratorUserId, payoutAllocationId: allocation.id, idempotencyKey: `api04-payout-history-${randomUUID()}` });
    const persistedPayout = await prisma.investorPayout.findUniqueOrThrow({
      where: { id: posted.investorPayoutId },
      select: { principalSatang: true, interestSatang: true },
    });
    const portfolio = await expectApiSuccess<{ principalReceivedSatang: string; interestReceivedSatang: string }>(await getPortfolio(
      createAuthenticatedApiRequest("http://localhost/api/investor/portfolio", { userId: context.investorUser.id, role: "INVESTOR", sessionCookie: token }),
    ));
    expect(portfolio).toMatchObject({
      principalReceivedSatang: persistedPayout.principalSatang.toString(),
      interestReceivedSatang: persistedPayout.interestSatang.toString(),
    });
    const investorRequest = createAuthenticatedApiRequest("http://localhost/api/investor/payouts", { userId: context.investorUser.id, role: "INVESTOR", sessionCookie: token });
    const rows = await expectApiSuccess<Array<{ id: string; status: string; principalSatang: string; interestSatang: string; ledgerTransactionId: string; completedAt: string; payoutAllocation: { id: string; investmentId: string; repaymentId: string } }>>(await listPayouts(investorRequest));
    expect(rows).toContainEqual(expect.objectContaining({ id: posted.investorPayoutId, status: "COMPLETED", ledgerTransactionId: posted.ledgerTransactionId, payoutAllocation: expect.objectContaining({ id: allocation.id, investmentId: allocation.investmentId, repaymentId: allocation.repaymentId }) }));
    const detail = await expectApiSuccess<{ id: string; status: string; principalSatang: string; interestSatang: string; ledgerTransactionId: string; payoutAllocation: { repaymentId: string; investmentId: string; repayment: { loanId: string; ledgerTransactionId: string } } }>(await getPayout(createAuthenticatedApiRequest(`http://localhost/api/investor/payouts/${posted.investorPayoutId}`, { userId: context.investorUser.id, role: "INVESTOR", sessionCookie: token }), { params: Promise.resolve({ payoutId: posted.investorPayoutId }) }));
    expect(detail).toMatchObject({ id: posted.investorPayoutId, status: "COMPLETED", ledgerTransactionId: posted.ledgerTransactionId, payoutAllocation: { repaymentId: allocation.repaymentId, investmentId: allocation.investmentId, repayment: { loanId: context.loan.id, ledgerTransactionId: repayment.ledgerTransactionId } } });
  });

  it("API-04-12 rejects investor initiated payouts", async () => {
    const investor = await createInvestor();
    await expectApiError(await initiatePayout(request(investor, "http://localhost/api/investor/payouts", { method: "POST", body: "{}" })), { status: 405, code: "METHOD_NOT_ALLOWED" });
  });

  it("API-04-13 returns persisted allocation details scoped to the authenticated investor", async () => {
    const context = await createRepaymentAllocationLifecycleContext(1);
    lifecycleContexts.push(context);
    const investorRole = await prisma.role.upsert({ where: { code: "INVESTOR" }, create: { code: "INVESTOR", name: "Investor" }, update: {}, select: { id: true } });
    await prisma.userRole.create({ data: { userId: context.investorUser.id, roleId: investorRole.id } });
    const token = randomBytes(32).toString("base64url");
    await prisma.session.create({ data: { userId: context.investorUser.id, sessionTokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
    sessionUsers.add(context.investorUser.id);
    const installment = await prisma.installment.findFirstOrThrow({ where: { scheduleVersion: { schedule: { loanId: context.loan.id } }, dueDate: { lte: new Date() }, status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } }, orderBy: [{ dueDate: "asc" }, { installmentNumber: "asc" }] });
    const amountSatang = installment.principalDueSatang - installment.paidPrincipalSatang + installment.interestDueSatang - installment.paidInterestSatang;
    const repayment = await submitRepayment({ loanId: context.loan.id, borrowerUserId: context.borrowerUser.id, amountSatang, idempotencyKey: `api04-allocation-${randomUUID()}` });
    const persisted = await prisma.payoutAllocation.findFirstOrThrow({ where: { repayment: { ledgerTransactionId: repayment.ledgerTransactionId }, investment: { investorProfile: { userId: context.investorUser.id } } }, select: { id: true, principalSatang: true, interestSatang: true, recoverySatang: true, investmentId: true, repaymentId: true, allocationMethod: true } });
    const rows = await expectApiSuccess<Array<{ id: string; principalSatang: string; interestSatang: string; recoverySatang: string; investmentId: string; repaymentId: string; allocationMethod: string; repayment: { loanId: string; ledgerTransactionId: string } }>>(await listAllocations(createAuthenticatedApiRequest("http://localhost/api/investor/allocations", { userId: context.investorUser.id, role: "INVESTOR", sessionCookie: token })));
    expect(rows).toContainEqual(expect.objectContaining({
      id: persisted.id,
      principalSatang: persisted.principalSatang.toString(),
      interestSatang: persisted.interestSatang.toString(),
      recoverySatang: persisted.recoverySatang.toString(),
      investmentId: persisted.investmentId,
      repaymentId: persisted.repaymentId,
      allocationMethod: persisted.allocationMethod,
      repayment: expect.objectContaining({ loanId: context.loan.id, ledgerTransactionId: repayment.ledgerTransactionId }),
    }));
  });

  it("API-04-14 does not expose another investor's payout", async () => {
    const investor = await createInvestor();
    const context = await createRepaymentAllocationLifecycleContext(1);
    lifecycleContexts.push(context);
    const investorRole = await prisma.role.upsert({ where: { code: "INVESTOR" }, create: { code: "INVESTOR", name: "Investor" }, update: {}, select: { id: true } });
    await prisma.userRole.create({ data: { userId: context.investorUser.id, roleId: investorRole.id } });
    const token = randomBytes(32).toString("base64url");
    await prisma.session.create({ data: { userId: context.investorUser.id, sessionTokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
    sessionUsers.add(context.investorUser.id);
    const installment = await prisma.installment.findFirstOrThrow({ where: { scheduleVersion: { schedule: { loanId: context.loan.id } }, dueDate: { lte: new Date() }, status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } }, orderBy: [{ dueDate: "asc" }, { installmentNumber: "asc" }] });
    const amountSatang = installment.principalDueSatang - installment.paidPrincipalSatang + installment.interestDueSatang - installment.paidInterestSatang;
    const repayment = await submitRepayment({ loanId: context.loan.id, borrowerUserId: context.borrowerUser.id, amountSatang, idempotencyKey: `api04-repayment-${randomUUID()}` });
    const allocation = await prisma.payoutAllocation.findFirstOrThrow({ where: { repayment: { ledgerTransactionId: repayment.ledgerTransactionId }, investment: { investorProfile: { userId: context.investorUser.id } } }, select: { id: true } });
    const posted = await postInvestorPayout({ actorUserId: context.administratorUserId, payoutAllocationId: allocation.id, idempotencyKey: `api04-payout-${randomUUID()}` });
    const response = await getPayout(request(investor, `http://localhost/api/investor/payouts/${posted.investorPayoutId}`), { params: Promise.resolve({ payoutId: posted.investorPayoutId }) });
    expect(response.status).toBe(404);
  });

  it("API-04-15 allows the investor to update only their display name", async () => {
    const investor = await createInvestor();
    const response = await patchProfile(request(investor, "http://localhost/api/investor/profile", {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ displayName: "Updated Investor" }),
    }));
    const updated = await expectApiSuccess<{ displayName: string }>(response);
    expect(updated.displayName).toBe("Updated Investor");
  });
});
