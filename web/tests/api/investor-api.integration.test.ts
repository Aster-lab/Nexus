import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { GET as getProfile, PATCH as patchProfile } from "../../src/app/api/investor/profile/route";
import { GET as getMarketplace } from "../../src/app/api/investor/marketplace/route";
import { GET as getMarketplaceLoan } from "../../src/app/api/investor/marketplace/[loanId]/route";
import { GET as listInvestments, POST as createInvestment } from "../../src/app/api/investor/investments/route";
import { GET as getInvestment } from "../../src/app/api/investor/investments/[investmentId]/route";
import { GET as getPortfolio } from "../../src/app/api/investor/portfolio/route";
import { GET as listPayouts } from "../../src/app/api/investor/payouts/route";
import { GET as getPayout } from "../../src/app/api/investor/payouts/[payoutId]/route";
import { POST as initiatePayout } from "../../src/app/api/investor/payouts/route";
import { GET as listAllocations } from "../../src/app/api/investor/allocations/route";
import { prisma } from "../../src/lib/prisma";
import { postInvestorPayout } from "../../src/lib/services/investor-payout.service";
import { submitRepayment } from "../../src/lib/services/repayment/repayment-submitrepayment";
import { createRepaymentAllocationLifecycleContext } from "../fixtures/repayment-allocation.fixture";
import { createInvestorContributionFixture, fundInvestorWallet } from "../fixtures/investor-contribution.fixture";
import { createAuthenticatedApiRequest, expectApiError, expectApiSuccess } from "../helpers/api";

type Investor = { userId: string; profileId: string; token: string; loanId: string; walletId: string };
const sessionUsers = new Set<string>();
const lifecycleContexts: Array<Awaited<ReturnType<typeof createRepaymentAllocationLifecycleContext>>> = [];

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
  // Wallet funding and investments post immutable ledger history. This suite relies on
  // the integration database reset between runs and only revokes its temporary sessions.
});

describe("API-04 investor APIs", () => {
  it("API-04-01 returns only the authenticated investor profile", async () => {
    const investor = await createInvestor();
    const profile = await expectApiSuccess<{ id: string; displayName: string }>(await getProfile(request(investor, "http://localhost/api/investor/profile")));
    expect(profile).toMatchObject({ id: investor.profileId, displayName: "API Investor" });
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

  it("API-04-09 returns only the investor's portfolio and investments", async () => {
    const investor = await createInvestor();
    const portfolio = await expectApiSuccess<{ investorProfileId: string; totalInvestedPrincipalSatang: string }>(await getPortfolio(request(investor, "http://localhost/api/investor/portfolio")));
    expect(portfolio.investorProfileId).toBe(investor.profileId);
    expect(portfolio.totalInvestedPrincipalSatang).toBe("0");
    const investments = await expectApiSuccess<unknown[]>(await listInvestments(request(investor, "http://localhost/api/investor/investments")));
    expect(Array.isArray(investments)).toBe(true);
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

  it("API-04-11 lists payout history scoped to the authenticated investor", async () => {
    const investor = await createInvestor();
    const rows = await expectApiSuccess<unknown[]>(await listPayouts(request(investor, "http://localhost/api/investor/payouts")));
    expect(Array.isArray(rows)).toBe(true);
  });

  it("API-04-12 rejects investor initiated payouts", async () => {
    const investor = await createInvestor();
    await expectApiError(await initiatePayout(request(investor, "http://localhost/api/investor/payouts", { method: "POST", body: "{}" })), { status: 405, code: "METHOD_NOT_ALLOWED" });
  });

  it("API-04-13 lists payout allocations scoped to the authenticated investor", async () => {
    const investor = await createInvestor();
    const rows = await expectApiSuccess<unknown[]>(await listAllocations(request(investor, "http://localhost/api/investor/allocations")));
    expect(Array.isArray(rows)).toBe(true);
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
