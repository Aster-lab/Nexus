import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "../../src/generated/prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST as createBorrowerApplication } from "../../src/app/api/borrower/applications/route";
import { POST as submitBorrowerApplication } from "../../src/app/api/borrower/applications/[applicationId]/submit/route";
import { POST as decideAdminApplication } from "../../src/app/api/admin/applications/[applicationId]/decision/route";
import { POST as issueAdminOffer } from "../../src/app/api/admin/applications/[applicationId]/offers/route";
import { POST as acceptBorrowerOffer } from "../../src/app/api/borrower/offers/[offerId]/accept/route";
import { GET as listInvestorMarketplace } from "../../src/app/api/investor/marketplace/route";
import { GET as listInvestorInvestments, POST as postInvestorInvestment } from "../../src/app/api/investor/investments/route";
import { POST as postAdminOpeningBalance } from "../../src/app/api/admin/opening-balances/route";
import { POST as postAdminDisbursement } from "../../src/app/api/admin/loans/[loanId]/disburse/route";
import { POST as postBorrowerConsent } from "../../src/app/api/borrower/loans/[loanId]/disbursement-consent/route";
import { POST as postBorrowerWalletTopUp } from "../../src/app/api/borrower/wallet/top-ups/route";
import { GET as listAdminPendingAllocations } from "../../src/app/api/admin/payout-allocations/route";
import { GET as getAdminReconciliation } from "../../src/app/api/admin/reconciliation/route";
import { POST as processAdminPayout } from "../../src/app/api/admin/payouts/route";
import { GET as getBorrowerPayable } from "../../src/app/api/borrower/loans/[loanId]/payable/route";
import { GET as getBorrowerSchedule } from "../../src/app/api/borrower/loans/[loanId]/schedule/route";
import { GET as getBorrowerReceipt } from "../../src/app/api/borrower/repayments/[repaymentId]/receipt/route";
import { GET as listBorrowerRepayments, POST as submitBorrowerRepayment } from "../../src/app/api/borrower/repayments/route";
import { GET as getInvestorWallet } from "../../src/app/api/investor/wallet/route";
import { GET as listInvestorAllocations } from "../../src/app/api/investor/allocations/route";
import { prisma } from "../../src/lib/prisma";
import { createRepaymentAllocationLifecycleContext } from "../fixtures/repayment-allocation.fixture";
import { activateEscrowAccountForTests } from "../fixtures/investor-contribution.fixture";
import { activateRepaymentTestAccounts } from "../fixtures/repayment.fixture";
import { createAuthenticatedApiRequest, expectApiSuccess, type ApiTestRole } from "../helpers/api";

type JourneyContext = Awaited<ReturnType<typeof createRepaymentAllocationLifecycleContext>>;
type Identity = { userId: string; role: ApiTestRole; token: string };

let journeyContext: JourneyContext | undefined;
const sessionUserIds = new Set<string>();
const accountSetups: Array<{ cleanup: () => Promise<void> }> = [];

async function ensureActivePolicy(adminUserId: string, definition: { code: string; name: string; values: Record<string, unknown> }): Promise<void> {
  const policy = await prisma.platformPolicy.upsert({
    where: { policyCode: definition.code },
    create: { policyCode: definition.code, name: definition.name, description: "Test-only activation for the full cross-role journey." },
    update: {},
    select: { id: true },
  });
  const active = await prisma.policyVersion.findFirst({
    where: { policyId: policy.id, status: "ACTIVE", OR: [{ effectiveAt: null }, { effectiveAt: { lte: new Date() } }] },
    select: { id: true },
  });
  if (active) return;
  const latest = await prisma.policyVersion.findFirst({ where: { policyId: policy.id }, orderBy: { versionNumber: "desc" }, select: { versionNumber: true } });
  await prisma.policyVersion.create({
    data: {
      policyId: policy.id,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      policyValues: definition.values as Prisma.InputJsonValue,
      status: "ACTIVE",
      approvedByUserId: adminUserId,
      effectiveAt: new Date(),
    },
  });
}

async function createSessionIdentity(userId: string, role: ApiTestRole): Promise<Identity> {
  const roleRecord = await prisma.role.upsert({
    where: { code: role },
    create: { code: role, name: role },
    update: {},
    select: { id: true },
  });
  const assignment = await prisma.userRole.findFirst({
    where: { userId, roleId: roleRecord.id, revokedAt: null },
    select: { id: true },
  });
  if (!assignment) await prisma.userRole.create({ data: { userId, roleId: roleRecord.id } });

  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      userId,
      sessionTokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  sessionUserIds.add(userId);
  return { userId, role, token };
}

function apiRequest(identity: Identity, url: string, init: RequestInit = {}): Request {
  return createAuthenticatedApiRequest(url, {
    userId: identity.userId,
    role: identity.role,
    sessionCookie: identity.token,
  }, init);
}

afterEach(async () => {
  if (sessionUserIds.size) {
    await prisma.session.deleteMany({ where: { userId: { in: [...sessionUserIds] } } });
    sessionUserIds.clear();
  }
  if (journeyContext) {
    await journeyContext.cleanup();
    journeyContext = undefined;
  }
  for (const setup of accountSetups.splice(0).reverse()) await setup.cleanup();
});

describe("WP10 cross-role financial system journey", () => {
  it("completes the borrower application-to-investor-funding-to-admin-disbursement handoffs", async () => {
    const escrowSetup = await activateEscrowAccountForTests();
    accountSetups.push(escrowSetup);
    accountSetups.push(await activateRepaymentTestAccounts());

    const adminUser = await prisma.user.create({ data: { email: `journey-admin-${randomUUID()}@nexus.test`, accountStatus: "ACTIVE" }, select: { id: true } });
    const borrowerUser = await prisma.user.create({ data: { email: `journey-borrower-${randomUUID()}@nexus.test`, accountStatus: "ACTIVE" }, select: { id: true } });
    const investorUser = await prisma.user.create({ data: { email: `journey-investor-${randomUUID()}@nexus.test`, accountStatus: "ACTIVE" }, select: { id: true } });
    await ensureActivePolicy(adminUser.id, {
      code: "LOAN_OFFER_POLICY",
      name: "Loan offer policy",
      values: { schema_version: "loan_offer_policy.v1", min_principal_satang: 100_000, max_principal_satang: 5_000_000, allowed_term_months: [3, 6, 9, 12, 18, 24], offer_validity_days: 7 },
    });
    await ensureActivePolicy(adminUser.id, {
      code: "LOAN_INTEREST_POLICY",
      name: "Loan interest policy",
      values: { schema_version: "loan_interest_policy.v1", annual_interest_rate_basis_points: 1200, calculation_method: "REDUCING_BALANCE", calculation_frequency: "MONTHLY", currency: "THB" },
    });
    await prisma.borrowerProfile.create({ data: { userId: borrowerUser.id, legalName: "System Journey Borrower", phone: "0812345678", address: { country: "Thailand" } } });
    await prisma.investorProfile.create({ data: { userId: investorUser.id, displayName: "System Journey Investor" } });
    const investorWallet = await prisma.wallet.create({ data: { ownerUserId: investorUser.id, currency: "THB", balanceSatang: 0n, status: "ACTIVE" }, select: { id: true } });
    await prisma.wallet.create({ data: { ownerUserId: borrowerUser.id, currency: "THB", balanceSatang: 0n, status: "ACTIVE" } });
    const administrator = await createSessionIdentity(adminUser.id, "ADMIN");
    const borrower = await createSessionIdentity(borrowerUser.id, "BORROWER");
    const investor = await createSessionIdentity(investorUser.id, "INVESTOR");

    const snapshot = {
      schema_version: "application_snapshot.v1",
      borrower: {
        legal_name: "System Journey Borrower",
        phone: "0812345678",
        address: { line1: "1 Journey Road", line2: null, subdistrict: null, district: null, province: "Bangkok", postal_code: "10100", country_code: "TH" },
      },
      employment: { employment_status: "EMPLOYED", employer_name: "NEXUS Test Co", occupation: "Analyst", months_in_role: 12 },
      requested_loan: { purpose: "education", amount_satang: 300_000, term_months: 3 },
    };
    const application = await expectApiSuccess<{ id: string }>(await createBorrowerApplication(apiRequest(borrower, "http://localhost/api/borrower/applications", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(snapshot),
    })), 201);
    await expectApiSuccess(await submitBorrowerApplication(apiRequest(borrower, `http://localhost/api/borrower/applications/${application.id}/submit`, { method: "POST" }), {
      params: Promise.resolve({ applicationId: application.id }),
    }));
    await expectApiSuccess(await decideAdminApplication(apiRequest(administrator, `http://localhost/api/admin/applications/${application.id}/decision`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "APPROVED", reason: "System journey approval" }),
    }), { params: Promise.resolve({ applicationId: application.id }) }));
    const offer = await expectApiSuccess<{ offerId: string; principalSatang: string; termMonths: number }>(await issueAdminOffer(apiRequest(administrator, `http://localhost/api/admin/applications/${application.id}/offers`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ principalSatang: "300000", termMonths: 3, reason: "System journey offer" }),
    }), { params: Promise.resolve({ applicationId: application.id }) }), 201);
    expect(offer).toMatchObject({ principalSatang: "300000", termMonths: 3 });

    const loan = await expectApiSuccess<{ loanId: string; status: string }>(await acceptBorrowerOffer(apiRequest(borrower, `http://localhost/api/borrower/offers/${offer.offerId}/accept`, { method: "POST" }), {
      params: Promise.resolve({ offerId: offer.offerId }),
    }), 201);
    expect(loan.status).toBe("FUNDING");
    const createdEscrow = await prisma.escrowAccount.findUniqueOrThrow({ where: { loanId: loan.loanId }, select: { status: true, heldSatang: true } });
    expect(createdEscrow).toMatchObject({ status: "OPEN", heldSatang: 0n });

    const initialBalance = await expectApiSuccess<{ amountSatang: string; status: string }>(await postAdminOpeningBalance(apiRequest(administrator, "http://localhost/api/admin/opening-balances", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": `journey-opening-${randomUUID()}` },
      body: JSON.stringify({ walletId: investorWallet.id, amountSatang: "300000", reason: "Initial simulated investor funds for system journey" }),
    })), 201);
    expect(initialBalance).toMatchObject({ amountSatang: "300000", status: "POSTED" });
    const marketplace = await expectApiSuccess<Array<{ id: string; remainingFundingSatang: string }>>(await listInvestorMarketplace(apiRequest(investor, "http://localhost/api/investor/marketplace?page=1&limit=100")));
    expect(marketplace).toContainEqual(expect.objectContaining({ id: loan.loanId, remainingFundingSatang: "300000" }));
    const contribution = await expectApiSuccess<{ amountSatang: string; ledgerStatus: string }>(await postInvestorInvestment(apiRequest(investor, "http://localhost/api/investor/investments", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": `journey-contribution-${randomUUID()}` },
      body: JSON.stringify({ loanId: loan.loanId, amountSatang: "300000" }),
    })), 201);
    expect(contribution).toMatchObject({ amountSatang: "300000", ledgerStatus: "POSTED" });
    const investorPortfolio = await expectApiSuccess<Array<{ loan: { id: string }; totalContributedSatang: string }>>(await listInvestorInvestments(apiRequest(investor, "http://localhost/api/investor/investments?page=1&limit=100")));
    expect(investorPortfolio).toContainEqual(expect.objectContaining({ loan: expect.objectContaining({ id: loan.loanId }), totalContributedSatang: "300000" }));
    await expect(prisma.loan.findUniqueOrThrow({ where: { id: loan.loanId }, select: { status: true, fundedSatang: true } })).resolves.toMatchObject({ status: "FUNDED", fundedSatang: 300_000n });

    await expectApiSuccess(await postBorrowerConsent(apiRequest(borrower, `http://localhost/api/borrower/loans/${loan.loanId}/disbursement-consent`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmDisbursement: true }),
    }), { params: Promise.resolve({ loanId: loan.loanId }) }), 201);

    const wallClockNow = Date.now();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(wallClockNow - 70 * 24 * 60 * 60 * 1000));
    let disbursement: { ledgerTransactionId: string; status: string; installmentCount: number };
    try {
      disbursement = await expectApiSuccess(await postAdminDisbursement(apiRequest(administrator, `http://localhost/api/admin/loans/${loan.loanId}/disburse`, {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": `journey-disbursement-${randomUUID()}` },
        body: JSON.stringify({ reason: "Borrower confirmed; post the simulated loan release" }),
      }), { params: Promise.resolve({ loanId: loan.loanId }) }), 201);
    } finally {
      vi.useRealTimers();
    }
    expect(disbursement).toMatchObject({ status: "POSTED", installmentCount: 3 });
    const borrowerWalletAfter = await prisma.wallet.findUniqueOrThrow({ where: { ownerUserId: borrowerUser.id }, select: { balanceSatang: true } });
    expect(borrowerWalletAfter.balanceSatang).toBe(300_000n);
    const persistedSchedule = await prisma.repaymentSchedule.findUniqueOrThrow({ where: { loanId: loan.loanId }, select: { currentVersion: { select: { installments: { select: { installmentNumber: true } } } } } });
    expect(persistedSchedule.currentVersion?.installments).toHaveLength(3);

    const payable = await expectApiSuccess<{ payableAmountSatang: string }>(await getBorrowerPayable(apiRequest(borrower, `http://localhost/api/borrower/loans/${loan.loanId}/payable`), {
      params: Promise.resolve({ loanId: loan.loanId }),
    }));
    const payableAmount = BigInt(payable.payableAmountSatang);
    expect(payableAmount).toBeGreaterThan(0n);
    const currentBorrowerBalance = (await prisma.wallet.findUniqueOrThrow({
      where: { ownerUserId: borrowerUser.id },
      select: { balanceSatang: true },
    })).balanceSatang;
    if (currentBorrowerBalance < payableAmount) {
      await expectApiSuccess(await postBorrowerWalletTopUp(apiRequest(borrower, "http://localhost/api/borrower/wallet/top-ups", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": `journey-borrower-top-up-${randomUUID()}` },
        body: JSON.stringify({ amountSatang: (payableAmount - currentBorrowerBalance).toString() }),
      })), 201);
    }
    const repayment = await expectApiSuccess<{ ledgerTransactionId: string; totalSatang: string; receipt: { repaymentIds: string[]; status: string } }>(await submitBorrowerRepayment(apiRequest(borrower, "http://localhost/api/borrower/repayments", {
      method: "POST", headers: { "content-type": "application/json", "idempotency-key": `journey-repayment-${randomUUID()}` },
      body: JSON.stringify({ loanId: loan.loanId, amountSatang: payableAmount.toString() }),
    })), 201);
    expect(repayment).toMatchObject({ totalSatang: payableAmount.toString(), receipt: { status: "POSTED" } });
    expect(repayment.receipt.repaymentIds.length).toBeGreaterThan(0);
    const receipt = await expectApiSuccess<{ ledgerTransactionId: string; totalReceivedSatang: string }>(await getBorrowerReceipt(apiRequest(borrower, `http://localhost/api/borrower/repayments/${repayment.receipt.repaymentIds[0]}/receipt`), {
      params: Promise.resolve({ repaymentId: repayment.receipt.repaymentIds[0] }),
    }));
    expect(receipt).toMatchObject({ ledgerTransactionId: repayment.ledgerTransactionId, totalReceivedSatang: payableAmount.toString() });

    const investorBalanceBeforePayout = await prisma.wallet.findUniqueOrThrow({ where: { id: investorWallet.id }, select: { balanceSatang: true } });
    const investorAllocationRows = await expectApiSuccess<Array<{ id: string; repayment: { id: string; ledgerTransactionId: string; status: string }; investorPayout: null | { status: string } }>>(await listInvestorAllocations(apiRequest(investor, "http://localhost/api/investor/allocations?page=1&limit=100&sortOrder=desc")));
    const journeyAllocations = investorAllocationRows.filter((row) => row.repayment.ledgerTransactionId === repayment.ledgerTransactionId);
    expect(journeyAllocations.length).toBeGreaterThan(0);
    expect(journeyAllocations.every((row) => row.repayment.status === "POSTED" && row.investorPayout === null)).toBe(true);
    const pendingPayouts = await expectApiSuccess<Array<{ id: string; repayment: { id: string } }>>(await listAdminPendingAllocations(apiRequest(administrator, "http://localhost/api/admin/payout-allocations?page=1&limit=100&sortBy=createdAt&sortOrder=desc")));
    const payoutAllocationIds = pendingPayouts.filter((row) => repayment.receipt.repaymentIds.includes(row.repayment.id)).map((row) => row.id);
    expect(payoutAllocationIds.sort()).toEqual(journeyAllocations.map((row) => row.id).sort());
    for (const payoutAllocationId of payoutAllocationIds) {
      const payout = await expectApiSuccess<{ status: string }>(await processAdminPayout(apiRequest(administrator, "http://localhost/api/admin/payouts", {
        method: "POST", headers: { "content-type": "application/json", "idempotency-key": `journey-payout-${payoutAllocationId}` },
        body: JSON.stringify({ payoutAllocationId }),
      })), 201);
      expect(payout.status).toBe("COMPLETED");
    }
    const investorBalanceAfterPayout = await prisma.wallet.findUniqueOrThrow({ where: { id: investorWallet.id }, select: { balanceSatang: true } });
    expect(investorBalanceAfterPayout.balanceSatang).toBeGreaterThan(investorBalanceBeforePayout.balanceSatang);
    const reconciliation = await expectApiSuccess<{ valid: boolean; issues: unknown[] }>(await getAdminReconciliation(apiRequest(administrator, "http://localhost/api/admin/reconciliation")));
    expect(reconciliation.valid).toBe(true);
  });

  it("SYS-17/26/27/36/37/44/45/56 completes repayment, receipt, investor payouts, and reconciliation", async () => {
    journeyContext = await createRepaymentAllocationLifecycleContext(2);

    const borrower = await createSessionIdentity(journeyContext.borrowerUser.id, "BORROWER");
    const administrator = await createSessionIdentity(journeyContext.administratorUserId, "ADMIN");
    const investmentOwners = await prisma.investment.findMany({
      where: { loanId: journeyContext.loan.id },
      select: { investorProfile: { select: { id: true, userId: true } } },
      orderBy: { investorProfileId: "asc" },
    });
    expect(investmentOwners).toHaveLength(2);
    const investors = await Promise.all(investmentOwners.map(({ investorProfile }) =>
      createSessionIdentity(investorProfile.userId, "INVESTOR"),
    ));

    const scheduleUrl = `http://localhost/api/borrower/loans/${journeyContext.loan.id}/schedule`;
    const scheduleBefore = await expectApiSuccess<{
      installments: Array<{ id: string; status: string; remainingAmountSatang: string }>;
    }>(await getBorrowerSchedule(apiRequest(borrower, scheduleUrl), { params: Promise.resolve({ loanId: journeyContext.loan.id }) }));
    expect(scheduleBefore.installments.some((installment) => BigInt(installment.remainingAmountSatang) > 0n)).toBe(true);

    const payable = await expectApiSuccess<{ payableAmountSatang: string }>(
      await getBorrowerPayable(apiRequest(borrower, `http://localhost/api/borrower/loans/${journeyContext.loan.id}/payable`), {
        params: Promise.resolve({ loanId: journeyContext.loan.id }),
      }),
    );
    const amountSatang = BigInt(payable.payableAmountSatang);
    expect(amountSatang).toBeGreaterThan(0n);
    const borrowerBalance = (await prisma.wallet.findUniqueOrThrow({
      where: { id: journeyContext.borrowerWalletId },
      select: { balanceSatang: true },
    })).balanceSatang;
    if (borrowerBalance < amountSatang) {
      await expectApiSuccess(await postBorrowerWalletTopUp(apiRequest(borrower, "http://localhost/api/borrower/wallet/top-ups", {
        method: "POST",
        headers: { "content-type": "application/json", "idempotency-key": `wp10-borrower-top-up-${randomUUID()}` },
        body: JSON.stringify({ amountSatang: (amountSatang - borrowerBalance).toString() }),
      })), 201);
    }
    const borrowerWalletBefore = await prisma.wallet.findUniqueOrThrow({
      where: { id: journeyContext.borrowerWalletId },
      select: { balanceSatang: true },
    });

    const idempotencyKey = `wp10-repayment-${randomUUID()}`;
    const submission = await expectApiSuccess<{
      ledgerTransactionId: string;
      totalSatang: string;
      receipt: { status: string; totalReceivedSatang: string; repaymentIds: string[] };
    }>(await submitBorrowerRepayment(apiRequest(borrower, "http://localhost/api/borrower/repayments", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
      body: JSON.stringify({ loanId: journeyContext.loan.id, amountSatang: amountSatang.toString() }),
    })), 201);

    expect(submission.totalSatang).toBe(amountSatang.toString());
    expect(submission.receipt).toMatchObject({ status: "POSTED", totalReceivedSatang: amountSatang.toString() });
    expect(submission.receipt.repaymentIds.length).toBeGreaterThan(0);

    const persistedRepayments = await prisma.repayment.findMany({
      where: { ledgerTransactionId: submission.ledgerTransactionId },
      select: { id: true, totalSatang: true, principalSatang: true, interestSatang: true, status: true },
    });
    expect(persistedRepayments.map(({ id }) => id).sort()).toEqual([...submission.receipt.repaymentIds].sort());
    expect(persistedRepayments.every(({ status }) => status === "POSTED")).toBe(true);
    expect(persistedRepayments.reduce((total, row) => total + row.totalSatang, 0n)).toBe(amountSatang);
    expect(persistedRepayments.reduce((total, row) => total + row.principalSatang + row.interestSatang, 0n)).toBe(amountSatang);

    const postedLedger = await prisma.ledgerTransaction.findUniqueOrThrow({
      where: { id: submission.ledgerTransactionId },
      select: { status: true, entries: { select: { entryType: true, amountSatang: true } } },
    });
    expect(postedLedger.status).toBe("POSTED");
    const debits = postedLedger.entries.filter((entry) => entry.entryType === "DEBIT").reduce((sum, entry) => sum + entry.amountSatang, 0n);
    const credits = postedLedger.entries.filter((entry) => entry.entryType === "CREDIT").reduce((sum, entry) => sum + entry.amountSatang, 0n);
    expect(debits).toBe(credits);

    const borrowerWalletAfter = await prisma.wallet.findUniqueOrThrow({
      where: { id: journeyContext.borrowerWalletId },
      select: { balanceSatang: true },
    });
    expect(borrowerWalletBefore.balanceSatang - borrowerWalletAfter.balanceSatang).toBe(amountSatang);

    const receipt = await expectApiSuccess<{
      ledgerTransactionId: string;
      totalReceivedSatang: string;
      repayments: Array<{ repaymentId: string; totalSatang: string }>;
    }>(await getBorrowerReceipt(apiRequest(borrower, `http://localhost/api/borrower/repayments/${persistedRepayments[0].id}/receipt`), {
      params: Promise.resolve({ repaymentId: persistedRepayments[0].id }),
    }));
    expect(receipt.ledgerTransactionId).toBe(submission.ledgerTransactionId);
    expect(receipt.totalReceivedSatang).toBe(amountSatang.toString());
    expect(receipt.repayments.map(({ repaymentId }) => repaymentId).sort()).toEqual([...submission.receipt.repaymentIds].sort());

    const repaymentHistory = await expectApiSuccess<Array<{ ledgerTransactionId: string; status: string }>>(
      await listBorrowerRepayments(apiRequest(borrower, "http://localhost/api/borrower/repayments?page=1&limit=100&sortBy=createdAt&sortOrder=desc")),
    );
    expect(repaymentHistory.filter((row) => row.ledgerTransactionId === submission.ledgerTransactionId)).toHaveLength(persistedRepayments.length);

    const investorBalancesBefore = new Map<string, bigint>();
    for (const investor of investors) {
      const wallet = await expectApiSuccess<{ wallet: { balanceSatang: string } }>(
        await getInvestorWallet(apiRequest(investor, "http://localhost/api/investor/wallet?page=1&limit=100")),
      );
      investorBalancesBefore.set(investor.userId, BigInt(wallet.wallet.balanceSatang));
    }

    const investorAllocations = await Promise.all(investors.map(async (investor) => {
      const rows = await expectApiSuccess<Array<{
        id: string;
        principalSatang: string;
        interestSatang: string;
        repayment: { ledgerTransactionId: string; status: string };
        investorPayout: { status: string } | null;
      }>>(await listInvestorAllocations(apiRequest(investor, "http://localhost/api/investor/allocations?page=1&limit=100&sortOrder=desc")));
      return rows.filter((row) => row.repayment.ledgerTransactionId === submission.ledgerTransactionId);
    }));
    const allocations = investorAllocations.flat();
    const allocationOwnerById = new Map<string, string>();
    investorAllocations.forEach((rows, index) => {
      rows.forEach((row) => allocationOwnerById.set(row.id, investors[index].userId));
    });
    expect(allocations.length).toBeGreaterThanOrEqual(2);
    expect(allocations.every((row) => row.repayment.status === "POSTED" && row.investorPayout === null)).toBe(true);

    const pendingAllocations = await expectApiSuccess<Array<{
      id: string;
      amountSatang: string;
      repayment: { id: string; ledgerTransaction: { status: string } };
    }>>(await listAdminPendingAllocations(apiRequest(administrator, "http://localhost/api/admin/payout-allocations?page=1&limit=100&sortBy=createdAt&sortOrder=desc")));
    const currentAllocations = pendingAllocations.filter((row) =>
      row.repayment.ledgerTransaction.status === "POSTED" && submission.receipt.repaymentIds.includes(row.repayment.id),
    );
    expect(currentAllocations.map(({ id }) => id).sort()).toEqual(allocations.map(({ id }) => id).sort());

    const payoutAmountByInvestor = new Map<string, bigint>();
    for (const allocation of currentAllocations) {
      const payout = await expectApiSuccess<{ status: string; amountSatang: string }>(
        await processAdminPayout(apiRequest(administrator, "http://localhost/api/admin/payouts", {
          method: "POST",
          headers: { "content-type": "application/json", "idempotency-key": `wp10-payout-${allocation.id}` },
          body: JSON.stringify({ payoutAllocationId: allocation.id }),
        })),
        201,
      );
      expect(payout.status).toBe("COMPLETED");
      const userId = allocationOwnerById.get(allocation.id);
      expect(userId).toBeDefined();
      if (!userId) throw new Error(`Investor ownership was not resolved for allocation ${allocation.id}.`);
      payoutAmountByInvestor.set(userId, (payoutAmountByInvestor.get(userId) ?? 0n) + BigInt(payout.amountSatang));
    }

    for (const investor of investors) {
      const wallet = await expectApiSuccess<{ wallet: { balanceSatang: string }; transactions: Array<{ status: string }> }>(
        await getInvestorWallet(apiRequest(investor, "http://localhost/api/investor/wallet?page=1&limit=100")),
      );
      expect(BigInt(wallet.wallet.balanceSatang) - investorBalancesBefore.get(investor.userId)!).toBe(payoutAmountByInvestor.get(investor.userId) ?? 0n);
      expect(wallet.transactions.every((transaction) => transaction.status === "POSTED")).toBe(true);
    }

    const scheduleAfter = await expectApiSuccess<{ installments: Array<{ id: string; status: string; remainingAmountSatang: string }> }>(
      await getBorrowerSchedule(apiRequest(borrower, scheduleUrl), { params: Promise.resolve({ loanId: journeyContext.loan.id }) }),
    );
    expect(scheduleAfter.installments.some((installment) => BigInt(installment.remainingAmountSatang) === 0n)).toBe(true);

    const reconciliation = await expectApiSuccess<{ valid: boolean; issues: unknown[] }>(
      await getAdminReconciliation(apiRequest(administrator, "http://localhost/api/admin/reconciliation")),
    );
    expect(reconciliation.valid).toBe(true);
  });
});
