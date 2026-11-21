import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { GET as listApplications } from "../../src/app/api/admin/applications/route";
import { GET as getApplication } from "../../src/app/api/admin/applications/[applicationId]/route";
import { POST as decideApplication } from "../../src/app/api/admin/applications/[applicationId]/decision/route";
import { POST as issueLoanOffer } from "../../src/app/api/admin/applications/[applicationId]/offers/route";
import { GET as listLoans } from "../../src/app/api/admin/loans/route";
import { GET as getLoan } from "../../src/app/api/admin/loans/[loanId]/route";
import { GET as getFunding } from "../../src/app/api/admin/loans/[loanId]/funding/route";
import { POST as disburseLoan } from "../../src/app/api/admin/loans/[loanId]/disburse/route";
import { GET as listRepayments } from "../../src/app/api/admin/repayments/route";
import { GET as listRepaymentAllocations } from "../../src/app/api/admin/repayments/[repaymentId]/allocations/route";
import { GET as listPayouts, POST as processPayout } from "../../src/app/api/admin/payouts/route";
import { GET as listPendingPayoutAllocations } from "../../src/app/api/admin/payout-allocations/route";
import { GET as getReconciliation } from "../../src/app/api/admin/reconciliation/route";
import { GET as listAdminWallets } from "../../src/app/api/admin/wallets/route";
import { GET as listAdminLedgerTransactions } from "../../src/app/api/admin/ledger-transactions/route";
import { GET as listAuditLogs } from "../../src/app/api/admin/audit-logs/route";
import { GET as listUsers } from "../../src/app/api/admin/users/route";
import { PATCH as updateUser } from "../../src/app/api/admin/users/[userId]/route";
import { prisma } from "../../src/lib/prisma";
import { postInvestorContribution } from "../../src/lib/services/investor-contribution.service";
import { createInvestorContributionFixture, fundInvestorWallet } from "../fixtures/investor-contribution.fixture";
import { createRepaymentAllocationLifecycleContext } from "../fixtures/repayment-allocation.fixture";
import { submitRepayment } from "../../src/lib/services/repayment/repayment-submitrepayment";
import { createAuthenticatedApiRequest, expectApiError, expectApiSuccess } from "../helpers/api";

type Admin = { userId: string; token: string; roleCode: "ADMIN" | "BORROWER" };
type AdminContext = Awaited<ReturnType<typeof createRepaymentAllocationLifecycleContext>>;
const sessionUserIds = new Set<string>();
const lifecycleContexts: AdminContext[] = [];
const sharedStates: Array<{ accountId: string; accountStatus: "ACTIVE" | "INACTIVE"; walletId?: string; walletStatus?: "ACTIVE" | "RESTRICTED" | "CLOSED" }> = [];
const temporaryPolicyVersionIds: string[] = [];
const createdOfferIds: string[] = [];

async function ensureActiveOfferPolicies(actorUserId: string): Promise<void> {
  const definitions = [
    {
      policyCode: "LOAN_OFFER_POLICY",
      values: {
        schema_version: "loan_offer_policy.v1",
        min_principal_satang: 100_000,
        max_principal_satang: 5_000_000,
        allowed_term_months: [3, 6, 9, 12, 18, 24],
        offer_validity_days: 7,
      },
    },
    {
      policyCode: "LOAN_INTEREST_POLICY",
      values: {
        schema_version: "loan_interest_policy.v1",
        annual_interest_rate_basis_points: 1200,
        calculation_method: "REDUCING_BALANCE",
        calculation_frequency: "MONTHLY",
        currency: "THB",
      },
    },
  ] as const;

  for (const definition of definitions) {
    const policy = await prisma.platformPolicy.upsert({
      where: { policyCode: definition.policyCode },
      create: { policyCode: definition.policyCode, name: definition.policyCode },
      update: {},
      select: { id: true },
    });
    const active = await prisma.policyVersion.findFirst({
      where: { policyId: policy.id, status: "ACTIVE" },
      select: { id: true },
    });
    if (active) continue;
    const latest = await prisma.policyVersion.findFirst({
      where: { policyId: policy.id },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    const created = await prisma.policyVersion.create({
      data: {
        policyId: policy.id,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        policyValues: definition.values,
        status: "ACTIVE",
        approvedByUserId: actorUserId,
        effectiveAt: new Date(),
      },
      select: { id: true },
    });
    temporaryPolicyVersionIds.push(created.id);
  }
}

async function createIdentity(roleCode: "ADMIN" | "BORROWER" = "ADMIN"): Promise<Admin> {
  const role = await prisma.role.upsert({ where: { code: roleCode }, create: { code: roleCode, name: roleCode }, update: {}, select: { id: true } });
  const user = await prisma.user.create({ data: { email: `${randomUUID()}@admin-api.test`, accountStatus: "ACTIVE" }, select: { id: true } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({ data: { userId: user.id, sessionTokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3_600_000) } });
  sessionUserIds.add(user.id);
  return { userId: user.id, token, roleCode };
}

function apiRequest(identity: Admin, url: string, init: RequestInit = {}): Request {
  return createAuthenticatedApiRequest(url, { userId: identity.userId, role: identity.roleCode, sessionCookie: identity.token }, init);
}

async function createSubmittedApplication() {
  const borrower = await prisma.user.create({ data: { email: `${randomUUID()}@admin-api-borrower.test`, accountStatus: "ACTIVE" }, select: { id: true } });
  const profile = await prisma.borrowerProfile.create({ data: { userId: borrower.id, legalName: "Admin API Borrower", address: { country: "Thailand" } }, select: { id: true } });
  const application = await prisma.loanApplication.create({ data: { borrowerProfileId: profile.id }, select: { id: true } });
  const version = await prisma.applicationVersion.create({ data: { applicationId: application.id, versionNumber: 1, submittedData: { schema_version: "test.v1" }, requestedPrincipalSatang: 300_000n, requestedTermMonths: 3, submittedAt: new Date(), createdByUserId: borrower.id }, select: { id: true } });
  await prisma.loanApplication.update({ where: { id: application.id }, data: { currentVersionId: version.id, status: "SUBMITTED", submittedAt: new Date() } });
  return application.id;
}

async function createFundedLoanContext(admin: Admin) {
  const sourceAccount = await prisma.platformAccount.findUniqueOrThrow({ where: { accountCode: "1300" }, select: { id: true, status: true } });
  sharedStates.push({ accountId: sourceAccount.id, accountStatus: sourceAccount.status });
  await prisma.platformAccount.update({ where: { id: sourceAccount.id }, data: { status: "ACTIVE" } });
  const previousAccount = await prisma.platformAccount.findUnique({ where: { accountCode: "2200" }, select: { id: true, status: true } });
  const previousWallet = previousAccount ? await prisma.wallet.findUnique({ where: { ownerPlatformAccountId: previousAccount.id }, select: { id: true, status: true } }) : null;
  const fixture = await createInvestorContributionFixture({ administratorUserId: admin.userId });
  const escrowAccount = await prisma.platformAccount.findUniqueOrThrow({ where: { id: fixture.platformAccount.id }, select: { id: true, status: true } });
  const escrowWallet = await prisma.wallet.findUniqueOrThrow({ where: { id: fixture.escrowWallet.id }, select: { id: true, status: true } });
  sharedStates.push({ accountId: escrowAccount.id, walletId: escrowWallet.id, accountStatus: previousAccount?.status ?? escrowAccount.status, walletStatus: previousWallet?.status ?? escrowWallet.status });
  await prisma.platformAccount.update({ where: { id: escrowAccount.id }, data: { status: "ACTIVE" } });
  await prisma.wallet.update({ where: { id: escrowWallet.id }, data: { status: "ACTIVE" } });
  await fundInvestorWallet({ walletId: fixture.investorWallet.id, administratorUserId: admin.userId, amountSatang: fixture.loan.principalSatang });
  await postInvestorContribution({ userId: fixture.investorUser.id, loanId: fixture.loan.id, amountSatang: fixture.loan.principalSatang, idempotencyKey: fixture.idempotencyKey });
  await prisma.wallet.create({ data: { ownerUserId: fixture.borrowerUser.id, currency: "THB", balanceSatang: 0n, status: "ACTIVE" } });
  return fixture.loan.id;
}

async function createUnfundedLoanContext(admin: Admin) {
  const previousAccount = await prisma.platformAccount.findUnique({ where: { accountCode: "2200" }, select: { id: true, status: true } });
  const previousWallet = previousAccount ? await prisma.wallet.findUnique({ where: { ownerPlatformAccountId: previousAccount.id }, select: { id: true, status: true } }) : null;
  const fixture = await createInvestorContributionFixture({ administratorUserId: admin.userId });
  sharedStates.push({ accountId: fixture.platformAccount.id, accountStatus: previousAccount?.status ?? fixture.platformAccount.status, walletId: fixture.escrowWallet.id, walletStatus: previousWallet?.status ?? fixture.escrowWallet.status });
  return fixture.loan.id;
}

async function createPendingAllocation() {
  const context = await createRepaymentAllocationLifecycleContext(1);
  lifecycleContexts.push(context);
  const installment = await prisma.installment.findFirstOrThrow({ where: { scheduleVersion: { schedule: { loanId: context.loan.id } }, dueDate: { lte: new Date() }, status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] } }, orderBy: [{ dueDate: "asc" }, { installmentNumber: "asc" }] });
  const amountSatang = installment.principalDueSatang - installment.paidPrincipalSatang + installment.interestDueSatang - installment.paidInterestSatang;
  const submission = await submitRepayment({ loanId: context.loan.id, borrowerUserId: context.borrowerUser.id, amountSatang, idempotencyKey: `api05-repayment-${randomUUID()}` });
  const allocation = await prisma.payoutAllocation.findFirstOrThrow({ where: { repayment: { ledgerTransactionId: submission.ledgerTransactionId } }, select: { id: true } });
  return { context, allocationId: allocation.id };
}

afterEach(async () => {
  if (createdOfferIds.length) {
    await prisma.loanOffer.deleteMany({ where: { id: { in: createdOfferIds } } });
    createdOfferIds.length = 0;
  }
  if (temporaryPolicyVersionIds.length) {
    await prisma.policyVersion.deleteMany({ where: { id: { in: temporaryPolicyVersionIds } } });
    temporaryPolicyVersionIds.length = 0;
  }
  if (sessionUserIds.size) await prisma.session.deleteMany({ where: { userId: { in: [...sessionUserIds] } } });
  sessionUserIds.clear();
  for (const context of lifecycleContexts.splice(0).reverse()) await context.cleanup();
  for (const state of sharedStates.splice(0).reverse()) {
    if (state.walletId && state.walletStatus) await prisma.wallet.update({ where: { id: state.walletId }, data: { status: state.walletStatus } });
    await prisma.platformAccount.update({ where: { id: state.accountId }, data: { status: state.accountStatus } });
  }
});

describe("API-05 administrator APIs", () => {
  it("API-05-20 lists wallet balances and ownership references for administrators", async () => {
    const admin = await createIdentity("ADMIN");
    const wallets = await expectApiSuccess<Array<{ id: string; balanceSatang: string; currency: string; status: string }>>(await listAdminWallets(apiRequest(admin, "http://localhost/api/admin/wallets?page=1&limit=10")));
    expect(wallets.length).toBeGreaterThan(0);
    expect(wallets.every((wallet) => /^\d+$/.test(wallet.balanceSatang) && wallet.currency.length === 3)).toBe(true);
  });

  it("API-05-21 lists posted ledger transactions and balanced entry references read-only", async () => {
    const admin = await createIdentity("ADMIN");
    const rows = await expectApiSuccess<Array<{ status: string; entries: Array<{ amountSatang: string; entryType: string }> }>>(await listAdminLedgerTransactions(apiRequest(admin, "http://localhost/api/admin/ledger-transactions?page=1&limit=10&status=POSTED")));
    expect(rows.every((row) => row.status === "POSTED" && row.entries.every((entry) => /^\d+$/.test(entry.amountSatang)))).toBe(true);
  });

  it("API-05-22 denies platform wallet and ledger visibility to borrowers", async () => {
    const borrower = await createIdentity("BORROWER");
    await expectApiError(await listAdminWallets(apiRequest(borrower, "http://localhost/api/admin/wallets")), { status: 403, code: "FORBIDDEN" });
    await expectApiError(await listAdminLedgerTransactions(apiRequest(borrower, "http://localhost/api/admin/ledger-transactions")), { status: 403, code: "FORBIDDEN" });
  });
  it("API-05-01 lists applications for an administrator", async () => {
    const admin = await createIdentity();
    const applicationId = await createSubmittedApplication();
    const rows = await expectApiSuccess<Array<{ id: string }>>(await listApplications(apiRequest(admin, "http://localhost/api/admin/applications")));
    expect(rows.some((row) => row.id === applicationId)).toBe(true);
  });

  it("API-05-02 retrieves application details", async () => {
    const admin = await createIdentity();
    const applicationId = await createSubmittedApplication();
    const row = await expectApiSuccess<{ id: string; currentVersion: { requestedPrincipalSatang: string } }>(await getApplication(apiRequest(admin, `http://localhost/api/admin/applications/${applicationId}`), { params: Promise.resolve({ applicationId }) }));
    expect(row.id).toBe(applicationId);
    expect(row.currentVersion.requestedPrincipalSatang).toBe("300000");
  });

  it("API-05-03 records an administrator approval decision", async () => {
    const admin = await createIdentity();
    const applicationId = await createSubmittedApplication();
    const response = await decideApplication(apiRequest(admin, `http://localhost/api/admin/applications/${applicationId}/decision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "APPROVED", reason: "Meets underwriting criteria" }) }), { params: Promise.resolve({ applicationId }) });
    await expectApiSuccess<{ status: string }>(response, 200);
    expect(await prisma.loanApplication.findUniqueOrThrow({ where: { id: applicationId }, select: { status: true } })).toEqual({ status: "APPROVED" });
    const application = await prisma.loanApplication.findUniqueOrThrow({ where: { id: applicationId }, select: { borrowerProfile: { select: { userId: true } } } });
    await expect(prisma.notification.findFirst({ where: { userId: application.borrowerProfile.userId, category: "APPLICATION_STATUS", actionPath: `/borrower/applications/${applicationId}` } })).resolves.toMatchObject({ status: "UNREAD", title: "Application approved" });
  });

  it("API-05-18 issues a policy-compliant offer for an approved application and audits the actor", async () => {
    const admin = await createIdentity();
    await ensureActiveOfferPolicies(admin.userId);
    const applicationId = await createSubmittedApplication();
    await expectApiSuccess(await decideApplication(apiRequest(admin, `http://localhost/api/admin/applications/${applicationId}/decision`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "APPROVED", reason: "Meets underwriting criteria" }),
    }), { params: Promise.resolve({ applicationId }) }), 200);

    const response = await issueLoanOffer(apiRequest(admin, `http://localhost/api/admin/applications/${applicationId}/offers`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ principalSatang: "300000", termMonths: 3, reason: "Approved offer terms" }),
    }), { params: Promise.resolve({ applicationId }) });
    const offer = await expectApiSuccess<{ offerId: string; status: string; principalSatang: string; annualInterestRate: string }>(response, 201);
    createdOfferIds.push(offer.offerId);
    expect(offer).toMatchObject({ status: "ISSUED", principalSatang: "300000" });
    expect(Number(offer.annualInterestRate)).toBeCloseTo(0.12);

    const persistedOffer = await prisma.loanOffer.findUniqueOrThrow({
      where: { id: offer.offerId },
      select: { applicationId: true, applicationVersionId: true, createdByUserId: true, status: true },
    });
    expect(persistedOffer).toMatchObject({ applicationId, createdByUserId: admin.userId, status: "ISSUED" });
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { action: "LOAN_OFFER_ISSUED", targetType: "LOAN_OFFER", targetId: offer.offerId },
      select: { actorUserId: true, outcome: true, newValues: true },
    });
    expect(audit).toMatchObject({ actorUserId: admin.userId, outcome: "SUCCESS" });
    expect(audit.newValues).toMatchObject({
      applicationId,
      applicationVersionId: persistedOffer.applicationVersionId,
      principalSatang: "300000",
    });
    const application = await prisma.loanApplication.findUniqueOrThrow({ where: { id: applicationId }, select: { borrowerProfile: { select: { userId: true } } } });
    await expect(prisma.notification.findFirst({ where: { userId: application.borrowerProfile.userId, category: "OFFER", actionPath: "/borrower/offers" } })).resolves.toMatchObject({ status: "UNREAD", title: "A loan offer is ready" });
  });

  it("API-05-04 records an administrator rejection decision", async () => {
    const admin = await createIdentity();
    const applicationId = await createSubmittedApplication();
    const response = await decideApplication(apiRequest(admin, `http://localhost/api/admin/applications/${applicationId}/decision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "REJECTED", reason: "Insufficient repayment capacity" }) }), { params: Promise.resolve({ applicationId }) });
    await expectApiSuccess<{ status: string }>(response, 200);
    expect(await prisma.loanApplication.findUniqueOrThrow({ where: { id: applicationId }, select: { status: true } })).toEqual({ status: "REJECTED" });
    const application = await prisma.loanApplication.findUniqueOrThrow({ where: { id: applicationId }, select: { borrowerProfile: { select: { userId: true } } } });
    await expect(prisma.notification.findFirst({ where: { userId: application.borrowerProfile.userId, category: "APPLICATION_STATUS" } })).resolves.toMatchObject({ status: "UNREAD", title: "Application update" });
  });

  it("API-05-05 rejects an unsupported application decision", async () => {
    const admin = await createIdentity();
    const applicationId = await createSubmittedApplication();
    await expectApiError(await decideApplication(apiRequest(admin, `http://localhost/api/admin/applications/${applicationId}/decision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "PENDING", reason: "Invalid" }) }), { params: Promise.resolve({ applicationId }) }), { status: 400, code: "VALIDATION_ERROR" });
  });

  it("API-05-06 lists persisted loan data", async () => {
    const admin = await createIdentity();
    const loanId = await createFundedLoanContext(admin);
    const rows = await expectApiSuccess<Array<{ id: string; status: string }>>(await listLoans(apiRequest(admin, "http://localhost/api/admin/loans?status=FUNDED")));
    expect(rows.some((row) => row.id === loanId && row.status === "FUNDED")).toBe(true);
    const detail = await expectApiSuccess<{ id: string; borrowerProfile: { legalName: string } }>(await getLoan(apiRequest(admin, `http://localhost/api/admin/loans/${loanId}`), { params: Promise.resolve({ loanId }) }));
    expect(detail).toMatchObject({ id: loanId, borrowerProfile: { legalName: expect.any(String) } });
  });

  it("API-05-07 retrieves funding and escrow details", async () => {
    const admin = await createIdentity();
    const loanId = await createFundedLoanContext(admin);
    const data = await expectApiSuccess<{ loanId: string; fundedSatang: string; escrow: { status: string } }>(await getFunding(apiRequest(admin, `http://localhost/api/admin/loans/${loanId}/funding`), { params: Promise.resolve({ loanId }) }));
    expect(data).toMatchObject({ loanId, fundedSatang: "1000000", escrow: { status: "FULLY_FUNDED" } });
  });

  it("API-05-08 disburses an eligible fully funded loan through existing services", async () => {
    const admin = await createIdentity();
    const loanId = await createFundedLoanContext(admin);
    const response = await disburseLoan(apiRequest(admin, `http://localhost/api/admin/loans/${loanId}/disburse`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": `api05-disburse-${randomUUID()}` }, body: JSON.stringify({ reason: "Approved test disbursement" }) }), { params: Promise.resolve({ loanId }) });
    const result = await expectApiSuccess<{ ledgerTransactionId: string; status: string }>(response, 201);
    expect(result.status).toBe("POSTED");
  });

  it("API-05-09 rejects disbursement of an ineligible loan", async () => {
    const admin = await createIdentity();
    const loanId = await createUnfundedLoanContext(admin);
    await expectApiError(await disburseLoan(apiRequest(admin, `http://localhost/api/admin/loans/${loanId}/disburse`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": `api05-disburse-${randomUUID()}` }, body: JSON.stringify({ reason: "Not funded" }) }), { params: Promise.resolve({ loanId }) }), { status: 409, code: "LOAN_NOT_ELIGIBLE" });
  });

  it("API-05-10 reuses an idempotent disbursement result", async () => {
    const admin = await createIdentity();
    const loanId = await createFundedLoanContext(admin);
    const key = `api05-disburse-${randomUUID()}`;
    const submit = () => disburseLoan(apiRequest(admin, `http://localhost/api/admin/loans/${loanId}/disburse`, { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify({ reason: "Approved test disbursement" }) }), { params: Promise.resolve({ loanId }) });
    const first = await expectApiSuccess<{ ledgerTransactionId: string }>(await submit(), 201);
    const second = await expectApiSuccess<{ ledgerTransactionId: string }>(await submit());
    expect(second.ledgerTransactionId).toBe(first.ledgerTransactionId);
    expect(await prisma.ledgerTransaction.count({ where: { idempotencyKey: key, status: "POSTED" } })).toBe(1);
  });

  it("API-05-11 lists repayment records with their posted ledger references", async () => {
    const admin = await createIdentity();
    const { context } = await createPendingAllocation();
    const rows = await expectApiSuccess<Array<{ id: string; loanId: string; ledgerTransactionId: string; payoutAllocationCount: number }>>(await listRepayments(apiRequest(admin, `http://localhost/api/admin/repayments?loanId=${context.loan.id}`)));
    const repayment = rows.find((row) => row.loanId === context.loan.id);
    expect(repayment?.ledgerTransactionId).toBeTruthy();
    expect(repayment?.payoutAllocationCount).toBe(1);
  });

  it("API-05-23 pages repayment allocations for administrator repayment details", async () => {
    const admin = await createIdentity();
    const { allocationId } = await createPendingAllocation();
    const allocation = await prisma.payoutAllocation.findUniqueOrThrow({ where: { id: allocationId }, select: { repaymentId: true } });
    const response = await listRepaymentAllocations(apiRequest(admin, `http://localhost/api/admin/repayments/${allocation.repaymentId}/allocations?page=1&limit=1`), { params: Promise.resolve({ repaymentId: allocation.repaymentId }) });
    const result = await expectApiSuccess<Array<{ id: string; repaymentId: string }>>(response);
    expect(result).toContainEqual(expect.objectContaining({ id: allocationId, repaymentId: allocation.repaymentId }));
  });

  it("API-05-12 processes an eligible investor payout through WP7", async () => {
    const admin = await createIdentity();
    const { allocationId } = await createPendingAllocation();
    const pendingBefore = await expectApiSuccess<Array<{ id: string }>>(
      await listPendingPayoutAllocations(apiRequest(admin, "http://localhost/api/admin/payout-allocations")),
    );
    expect(pendingBefore.some((row) => row.id === allocationId)).toBe(true);
    const response = await processPayout(apiRequest(admin, "http://localhost/api/admin/payouts", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": `api05-payout-${randomUUID()}` }, body: JSON.stringify({ payoutAllocationId: allocationId }) }));
    const payout = await expectApiSuccess<{ investorPayoutId: string; status: string }>(response, 201);
    expect(payout.status).toBe("COMPLETED");
    const pendingAfter = await expectApiSuccess<Array<{ id: string }>>(
      await listPendingPayoutAllocations(apiRequest(admin, "http://localhost/api/admin/payout-allocations")),
    );
    expect(pendingAfter.some((row) => row.id === allocationId)).toBe(false);
  });

  it("API-05-19 lists unpaid allocations with their persisted source and payout eligibility", async () => {
    const admin = await createIdentity();
    const { context, allocationId } = await createPendingAllocation();
    const rows = await expectApiSuccess<Array<{
      id: string;
      amountSatang: string;
      investor: { investorProfileId: string; status: string };
      repayment: { id: string; loanId: string; status: string; ledgerTransaction: { status: string } };
      eligibility: { canProcess: boolean; code: string | null };
    }>>(await listPendingPayoutAllocations(apiRequest(admin, "http://localhost/api/admin/payout-allocations?page=1&limit=10&sortBy=createdAt&sortOrder=desc")));
    const row = rows.find((item) => item.id === allocationId);
    expect(row).toMatchObject({
      amountSatang: expect.any(String),
      investor: { status: "ACTIVE" },
      repayment: { loanId: context.loan.id, status: "POSTED", ledgerTransaction: { status: "POSTED" } },
      eligibility: { canProcess: true, code: null },
    });
  });

  it("API-05-13 reuses a duplicate payout request", async () => {
    const admin = await createIdentity();
    const { allocationId } = await createPendingAllocation();
    const key = `api05-payout-${randomUUID()}`;
    const submit = () => processPayout(apiRequest(admin, "http://localhost/api/admin/payouts", { method: "POST", headers: { "content-type": "application/json", "idempotency-key": key }, body: JSON.stringify({ payoutAllocationId: allocationId }) }));
    const first = await expectApiSuccess<{ investorPayoutId: string }>(await submit(), 201);
    const second = await expectApiSuccess<{ investorPayoutId: string }>(await submit(), 201);
    expect(second.investorPayoutId).toBe(first.investorPayoutId);
  });

  it("API-05-14 returns read-only financial reconciliation", async () => {
    const admin = await createIdentity();
    const report = await expectApiSuccess<{ valid: boolean; issues: unknown[] }>(await getReconciliation(apiRequest(admin, "http://localhost/api/admin/reconciliation")));
    expect(typeof report.valid).toBe("boolean");
    expect(Array.isArray(report.issues)).toBe(true);
  });

  it("API-05-15 lists persisted audit history", async () => {
    const admin = await createIdentity();
    const rows = await expectApiSuccess<Array<{ id: string; action: string }>>(await listAuditLogs(apiRequest(admin, "http://localhost/api/admin/audit-logs")));
    expect(Array.isArray(rows)).toBe(true);
  });

  it("API-05-16 rejects non-administrator access", async () => {
    const borrower = await createIdentity("BORROWER");
    await expectApiError(await listLoans(apiRequest(borrower, "http://localhost/api/admin/loans")), { status: 403, code: "FORBIDDEN" });
    await expectApiError(await listPendingPayoutAllocations(apiRequest(borrower, "http://localhost/api/admin/payout-allocations")), { status: 403, code: "FORBIDDEN" });
  });

  it("API-05-17 rejects user role escalation through user administration", async () => {
    const borrower = await createIdentity("BORROWER");
    const admin = await createIdentity();
    const before = await prisma.userRole.findMany({ where: { userId: borrower.userId }, select: { roleId: true, revokedAt: true } });
    await expectApiError(await updateUser(apiRequest(admin, `http://localhost/api/admin/users/${borrower.userId}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: "ADMIN" }) }), { params: Promise.resolve({ userId: borrower.userId }) }), { status: 400, code: "VALIDATION_ERROR" });
    expect(await prisma.userRole.findMany({ where: { userId: borrower.userId }, select: { roleId: true, revokedAt: true } })).toEqual(before);
    expect((await expectApiSuccess<Array<{ id: string }>>(await listUsers(apiRequest(admin, "http://localhost/api/admin/users")))).length).toBeGreaterThan(0);
  });
});
