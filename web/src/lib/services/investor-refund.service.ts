import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../prisma";
import { requireUserWalletControlAccount } from "./ledger-control-accounts.service";

const CURRENCY = "THB";
const ESCROW_ACCOUNT_CODE = "2200";
const MAX_IDEMPOTENCY_KEY_LENGTH = 255;
const MAX_RETRIES = 3;

const APPROVAL_ACTION = "LOAN_REFUND_APPROVED";

type TransactionClient = Prisma.TransactionClient;

export interface PostInvestorRefundInput {
  investmentId: string;
  approvalAuditLogId: string;
  idempotencyKey: string;
}

export class InvestorRefundError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "InvestorRefundError";
  }
}

function reject(message: string, code: string): never {
  throw new InvestorRefundError(message, code);
}

function validateInput(input: PostInvestorRefundInput): void {
  if (!input.investmentId || !input.approvalAuditLogId) {
    reject("Investment and approval IDs are required.", "INVALID_REFERENCE");
  }

  if (
    typeof input.idempotencyKey !== "string" ||
    !input.idempotencyKey.trim() ||
    input.idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH
  ) {
    reject("Invalid idempotency key.", "INVALID_IDEMPOTENCY_KEY");
  }
}

async function lockRefundResources(
  tx: TransactionClient,
  loanId: string,
  escrowAccountId: string,
  walletIds: string[],
): Promise<void> {
  await tx.$queryRaw`
    SELECT id FROM loans
    WHERE id = ${loanId}::uuid
    FOR UPDATE
  `;

  await tx.$queryRaw`
    SELECT id FROM escrow_accounts
    WHERE id = ${escrowAccountId}::uuid
    FOR UPDATE
  `;

  for (const walletId of [...new Set(walletIds)].sort()) {
    await tx.$queryRaw`
      SELECT id FROM wallets
      WHERE id = ${walletId}::uuid
      FOR UPDATE
    `;
  }
}

async function findExistingRefund(
  tx: TransactionClient | typeof prisma,
  idempotencyKey: string,
) {
  return tx.investmentRefund.findUnique({
    where: { idempotencyKey },
    include: { ledgerTransaction: true },
  });
}

function assertSameRequest(
  existing: NonNullable<
    Awaited<ReturnType<typeof findExistingRefund>>
  >,
  input: PostInvestorRefundInput,
): void {
  if (existing.investmentId !== input.investmentId) {
    reject(
      "Idempotency key belongs to another investment.",
      "IDEMPOTENCY_KEY_CONFLICT",
    );
  }

  if (existing.ledgerTransaction.status !== "POSTED") {
    reject(
      "Existing refund has not been posted.",
      "INVALID_EXISTING_REFUND",
    );
  }
}

async function postWithinTransaction(
  tx: TransactionClient,
  input: PostInvestorRefundInput,
) {
  const existing = await findExistingRefund(tx, input.idempotencyKey);

  if (existing) {
    assertSameRequest(existing, input);
    return existing;
  }

  const approval = await tx.auditLog.findUnique({
    where: { id: input.approvalAuditLogId },
  });

  if (
    !approval ||
    approval.action !== APPROVAL_ACTION ||
    approval.targetType !== "LOAN" ||
    approval.outcome !== "SUCCESS" ||
    !approval.targetId
  ) {
    reject("A valid administrator refund approval is required.", "APPROVAL_REQUIRED");
  }

  const approvalData = approval.newValues as
    | { schemaVersion?: string; requestAuditLogId?: string }
    | null;

  if (
    approvalData?.schemaVersion !== "loan_refund_approval.v1" ||
    !approvalData.requestAuditLogId
  ) {
    reject("Invalid refund approval evidence.", "INVALID_APPROVAL_EVIDENCE");
  }

  const request = await tx.auditLog.findUnique({
    where: { id: approvalData.requestAuditLogId },
  });

  if (
    !request ||
    request.action !== "LOAN_REFUND_REQUESTED" ||
    request.targetType !== "LOAN" ||
    request.targetId !== approval.targetId ||
    request.outcome !== "SUCCESS"
  ) {
    reject("The associated refund request is invalid.", "INVALID_REFUND_REQUEST");
  }

  const investment = await tx.investment.findUnique({
    where: { id: input.investmentId },
    include: {
      investorProfile: {
        select: { userId: true },
      },
    },
  });

  if (!investment || investment.loanId !== approval.targetId) {
    reject("Investment does not belong to the approved loan.", "INVALID_INVESTMENT");
  }

  const loan = await tx.loan.findUnique({
    where: { id: investment.loanId },
    select: {
      id: true,
      status: true,
      disbursedAt: true,
    },
  });

  if (!loan || loan.status !== "CANCELLED") {
    reject("Loan must be cancelled before refund.", "LOAN_NOT_CANCELLED");
  }

  if (loan.disbursedAt !== null) {
    reject("Disbursed loans cannot be refunded through this workflow.", "LOAN_DISBURSED");
  }

  const escrow = await tx.escrowAccount.findUnique({
    where: { loanId: loan.id },
  });

  if (!escrow) {
    reject("Loan escrow account not found.", "ESCROW_NOT_FOUND");
  }

  const investorWallet = await tx.wallet.findUnique({
    where: { ownerUserId: investment.investorProfile.userId },
  });

  if (
    !investorWallet ||
    investorWallet.ownerUserId !== investment.investorProfile.userId ||
    investorWallet.ownerPlatformAccountId !== null ||
    investorWallet.currency !== CURRENCY ||
    investorWallet.status !== "ACTIVE"
  ) {
    reject("Investor wallet is unavailable.", "INVESTOR_WALLET_UNAVAILABLE");
  }

  const escrowWallet = await tx.wallet.findUnique({
    where: { id: escrow.platformWalletId },
  });

  const platformAccount = await tx.platformAccount.findUnique({
    where: { accountCode: ESCROW_ACCOUNT_CODE },
  });

  if (
    !platformAccount ||
    platformAccount.accountType !== "LIABILITY" ||
    platformAccount.currency !== CURRENCY ||
    platformAccount.status !== "ACTIVE" ||
    !escrowWallet ||
    escrowWallet.ownerPlatformAccountId !== platformAccount.id ||
    escrowWallet.ownerUserId !== null ||
    escrowWallet.currency !== CURRENCY ||
    escrowWallet.status !== "ACTIVE"
  ) {
    reject("Shared escrow wallet is unavailable.", "ESCROW_WALLET_UNAVAILABLE");
  }

  await lockRefundResources(
    tx,
    loan.id,
    escrow.id,
    [investorWallet.id, escrowWallet.id],
  );

  const lockedLoan = await tx.loan.findUniqueOrThrow({
    where: { id: loan.id },
    select: { status: true, disbursedAt: true },
  });

  if (lockedLoan.status !== "CANCELLED" || lockedLoan.disbursedAt !== null) {
    reject("Loan is no longer eligible for refund.", "LOAN_NOT_REFUNDABLE");
  }

  const contributions = await tx.investmentContribution.findMany({
    where: {
      investmentId: investment.id,
      ledgerTransaction: { status: "POSTED" },
    },
    select: { amountSatang: true },
  });

  const previousRefunds = await tx.investmentRefund.aggregate({
    where: {
      investmentId: investment.id,
      ledgerTransaction: { status: "POSTED" },
    },
    _sum: { amountSatang: true },
  });

  const contributedSatang = contributions.reduce(
    (total, contribution) => total + contribution.amountSatang,
    0n,
  );

  const refundedSatang = previousRefunds._sum.amountSatang ?? 0n;
  const refundableSatang = contributedSatang - refundedSatang;

  if (refundableSatang <= 0n) {
    reject("No refundable contribution remains.", "NOTHING_TO_REFUND");
  }

  const currentEscrow = await tx.escrowAccount.findUniqueOrThrow({
    where: { id: escrow.id },
  });

  const currentEscrowWallet = await tx.wallet.findUniqueOrThrow({
    where: { id: escrowWallet.id },
  });

  const currentInvestorWallet = await tx.wallet.findUniqueOrThrow({
    where: { id: investorWallet.id },
  });

  if (
    currentEscrow.heldSatang < refundableSatang ||
    currentEscrowWallet.balanceSatang < refundableSatang
  ) {
    reject("Insufficient escrow funds for refund.", "INSUFFICIENT_ESCROW");
  }

  const ledger = await tx.ledgerTransaction.create({
    data: {
      transactionType: "INVESTOR_REFUND",
      status: "DRAFT",
      idempotencyKey: input.idempotencyKey,
      referenceType: "INVESTMENT",
      referenceId: investment.id,
      description: "Refund of investor contribution from cancelled loan",
    },
  });

  const walletControlAccount = await requireUserWalletControlAccount(tx);
  await tx.ledgerEntry.createMany({
    data: [
      {
        ledgerTransactionId: ledger.id,
        walletId: escrowWallet.id,
        entryType: "DEBIT",
        amountSatang: refundableSatang,
        currency: CURRENCY,
      },
      {
        ledgerTransactionId: ledger.id,
        walletId: investorWallet.id,
        platformAccountId: walletControlAccount.id,
        entryType: "CREDIT",
        amountSatang: refundableSatang,
        currency: CURRENCY,
      },
    ],
  });

  const escrowDebit = await tx.wallet.updateMany({
    where: {
      id: escrowWallet.id,
      ownerPlatformAccountId: platformAccount.id,
      ownerUserId: null,
      status: "ACTIVE",
      currency: CURRENCY,
      balanceSatang: { gte: refundableSatang },
    },
    data: {
      balanceSatang: { decrement: refundableSatang },
    },
  });

  if (escrowDebit.count !== 1) {
    reject("Escrow debit failed.", "ESCROW_DEBIT_FAILED");
  }

  const investorCredit = await tx.wallet.updateMany({
    where: {
      id: investorWallet.id,
      ownerUserId: investment.investorProfile.userId,
      ownerPlatformAccountId: null,
      status: "ACTIVE",
      currency: CURRENCY,
    },
    data: {
      balanceSatang: { increment: refundableSatang },
    },
  });

  if (investorCredit.count !== 1) {
    reject("Investor wallet credit failed.", "INVESTOR_CREDIT_FAILED");
  }

  await tx.ledgerTransaction.update({
    where: { id: ledger.id },
    data: {
      status: "POSTED",
      postedAt: new Date(),
    },
  });

  const refund = await tx.investmentRefund.create({
    data: {
      investmentId: investment.id,
      amountSatang: refundableSatang,
      ledgerTransactionId: ledger.id,
      idempotencyKey: input.idempotencyKey,
    },
    include: { ledgerTransaction: true },
  });

  await tx.escrowTransaction.create({
    data: {
      escrowAccountId: escrow.id,
      ledgerTransactionId: ledger.id,
      type: "REFUND",
      amountSatang: refundableSatang,
    },
  });

  const escrowUpdate = await tx.escrowAccount.updateMany({
    where: {
      id: escrow.id,
      heldSatang: { gte: refundableSatang },
    },
    data: {
      heldSatang: { decrement: refundableSatang },
    },
  });

  if (escrowUpdate.count !== 1) {
    reject("Loan escrow balance update failed.", "ESCROW_UPDATE_FAILED");
  }

  return refund;
}

export async function postInvestorRefund(
  input: PostInvestorRefundInput,
) {
  validateInput(input);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(
        (tx) => postWithinTransaction(tx, input),
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        },
      );
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
        throw error;
      }

      if (error.code === "P2002") {
        const existing = await findExistingRefund(
          prisma,
          input.idempotencyKey,
        );

        if (existing) {
          assertSameRequest(existing, input);
          return existing;
        }
      }

      if (
        (error.code === "P2034" || error.code === "P2002") &&
        attempt < MAX_RETRIES
      ) {
        continue;
      }

      throw error;
    }
  }

  reject("Refund failed after multiple transaction retries.", "RETRY_LIMIT_REACHED");
}
