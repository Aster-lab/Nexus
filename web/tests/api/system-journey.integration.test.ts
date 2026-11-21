import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
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
import { createAuthenticatedApiRequest, expectApiSuccess, type ApiTestRole } from "../helpers/api";

type JourneyContext = Awaited<ReturnType<typeof createRepaymentAllocationLifecycleContext>>;
type Identity = { userId: string; role: ApiTestRole; token: string };

let journeyContext: JourneyContext | undefined;
const sessionUserIds = new Set<string>();

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
});

describe("WP10 cross-role financial system journey", () => {
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
