
import { randomUUID } from "node:crypto";
import { Prisma } from "../../../generated/prisma/client";
import { prisma } from "../../prisma";
import {
  postWalletTransfer,
  withSerializableTransactionRetry,
} from "../ledger-posting.service";
import {
  persistRepaymentAllocations,
  REPAYMENT_ALLOCATION_METHOD,
} from "./repayment-allocation-persistence";
import {
  generateRepaymentReceipt,
  type RepaymentReceipt,
} from "./repayment-receipt";

const CURRENCY = "THB";
const REPAYMENT_CLEARING_ACCOUNT_CODE = "2300";
const TRANSACTION_TYPE = "BORROWER_REPAYMENT";
const REFERENCE_TYPE = "LOAN";

const PAYABLE_INSTALLMENT_STATUSES = [
  "PENDING",
  "PARTIALLY_PAID",
  "OVERDUE",
] as const;

type TransactionClient = Prisma.TransactionClient;

export interface SubmitRepaymentInput {
  loanId: string;
  borrowerUserId: string;
  amountSatang: bigint;
  idempotencyKey: string;
}

export interface SubmittedRepayment {
  installmentId: string;
  principalSatang: bigint;
  interestSatang: bigint;
  feeSatang: bigint;
  totalSatang: bigint;
}

export interface SubmitRepaymentPostingResult {
  loanId: string;
  ledgerTransactionId: string;
  totalSatang: bigint;
  repayments: SubmittedRepayment[];
}

export interface SubmitRepaymentResult extends SubmitRepaymentPostingResult {
  receipt: RepaymentReceipt;
}

/**
 * Optional transaction-scoped persistence override used by integration tests
 * to prove a database failure rolls the complete posting back. API handlers
 * should call submitRepayment with only the business input.
 */
export interface SubmitRepaymentTestOptions {
  allocationMethod?: string;
  persistAllocations?: boolean;
  /** Transaction-scoped fault injection for atomicity integration coverage. */
  postTransfer?: typeof postWalletTransfer;
  afterRepaymentCreated?: (
    tx: TransactionClient,
    repaymentId: string,
  ) => Promise<void>;
}

interface PayableInstallment {
  id: string;
  installmentNumber: number;
  dueDate: Date;
  principalDueSatang: bigint;
  interestDueSatang: bigint;
  paidPrincipalSatang: bigint;
  paidInterestSatang: bigint;
  status: string;
}

interface RepaymentAllocation {
  installment: PayableInstallment;
  principalSatang: bigint;
  interestSatang: bigint;
  totalSatang: bigint;
}

function assertValidInput(input: SubmitRepaymentInput): void {
  if (!input.loanId || !input.borrowerUserId) {
    throw new Error("Loan and borrower identifiers are required.");
  }

  if (input.amountSatang <= 0n) {
    throw new Error("Repayment amount must be greater than zero.");
  }

  if (
    !input.idempotencyKey ||
    input.idempotencyKey.trim().length === 0 ||
    input.idempotencyKey.length > 255
  ) {
    throw new Error("A valid idempotency key is required.");
  }
}

function getRemainingPrincipal(installment: PayableInstallment): bigint {
  return installment.principalDueSatang - installment.paidPrincipalSatang;
}

function getRemainingInterest(installment: PayableInstallment): bigint {
  return installment.interestDueSatang - installment.paidInterestSatang;
}

function getRemainingAmount(installment: PayableInstallment): bigint {
  const principal = getRemainingPrincipal(installment);
  const interest = getRemainingInterest(installment);

  if (principal < 0n || interest < 0n) {
    throw new Error("Installment paid amounts exceed scheduled amounts.");
  }

  return principal + interest;
}

function sumOutstanding(installments: PayableInstallment[]): bigint {
  return installments.reduce(
    (total, installment) => total + getRemainingAmount(installment),
    0n,
  );
}

/**
 * Allocates the submitted amount:
 * 1. Oldest payable installment first.
 * 2. Interest before principal within each installment.
 * 3. No advance credit or overpayment.
 */
function allocateRepayment(
  installments: PayableInstallment[],
  amountSatang: bigint,
): RepaymentAllocation[] {
  let remainingAmount = amountSatang;
  const allocations: RepaymentAllocation[] = [];

  for (const installment of installments) {
    if (remainingAmount === 0n) break;

    const remainingInterest = getRemainingInterest(installment);
    const remainingPrincipal = getRemainingPrincipal(installment);

    if (remainingInterest < 0n || remainingPrincipal < 0n) {
      throw new Error("Installment has an invalid outstanding balance.");
    }

    const interestSatang =
      remainingAmount < remainingInterest
        ? remainingAmount
        : remainingInterest;

    remainingAmount -= interestSatang;

    const principalSatang =
      remainingAmount < remainingPrincipal
        ? remainingAmount
        : remainingPrincipal;

    remainingAmount -= principalSatang;

    const totalSatang = interestSatang + principalSatang;

    if (totalSatang > 0n) {
      allocations.push({
        installment,
        principalSatang,
        interestSatang,
        totalSatang,
      });
    }
  }

  if (remainingAmount !== 0n) {
    throw new Error("Repayment exceeds the payable outstanding amount.");
  }

  return allocations;
}

function getStartOfTodayUtc(): Date {
  const now = new Date();

  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

function getUpdatedInstallmentStatus(
  remainingPrincipal: bigint,
  remainingInterest: bigint,
  dueDate: Date,
): "PAID" | "OVERDUE" | "PARTIALLY_PAID" {
  if (remainingPrincipal === 0n && remainingInterest === 0n) {
    return "PAID";
  }

  if (dueDate < getStartOfTodayUtc()) {
    return "OVERDUE";
  }

  return "PARTIALLY_PAID";
}


/**
 * Validates and returns an already-posted repayment for an idempotent retry.
 * A matching key alone is not sufficient: the original transaction and
 * repayment records must match the requested operation.
 */
async function findExistingRepayment(
  tx: TransactionClient,
  input: SubmitRepaymentInput,
  borrowerWalletId: string,
  clearingWalletId: string,
): Promise<SubmitRepaymentPostingResult | null> {
  const transaction = await tx.ledgerTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: {
      entries: true,
      repayments: {
        include: {
          installment: {
            select: {
              id: true,
              installmentNumber: true,
            },
          },
        },
      },
    },
  });

  if (!transaction) return null;

  if (
    transaction.status !== "POSTED" ||
    !transaction.postedAt ||
    transaction.transactionType !== TRANSACTION_TYPE ||
    transaction.referenceType !== REFERENCE_TYPE ||
    transaction.referenceId !== input.loanId
  ) {
    throw new Error(
      "Idempotency key is already associated with a different transaction.",
    );
  }

  if (transaction.entries.length !== 2) {
    throw new Error("Existing repayment ledger transaction is invalid.");
  }

  const debitEntry = transaction.entries.find(
    (entry) =>
      entry.entryType === "DEBIT" &&
      entry.walletId === borrowerWalletId &&
      entry.platformAccountId === null,
  );

  const creditEntry = transaction.entries.find(
    (entry) =>
      entry.entryType === "CREDIT" &&
      entry.walletId === clearingWalletId &&
      entry.platformAccountId === null,
  );

  if (
    !debitEntry ||
    !creditEntry ||
    debitEntry.currency !== CURRENCY ||
    creditEntry.currency !== CURRENCY ||
    debitEntry.amountSatang !== input.amountSatang ||
    creditEntry.amountSatang !== input.amountSatang
  ) {
    throw new Error(
      "Existing repayment ledger entries do not match the requested repayment.",
    );
  }

  if (transaction.repayments.length === 0) {
    throw new Error(
      "Posted repayment transaction has no persisted repayment records.",
    );
  }

  const persistedTotal = transaction.repayments.reduce(
    (total, repayment) => total + repayment.totalSatang,
    0n,
  );

  const componentMismatch = transaction.repayments.some(
    (repayment) =>
      repayment.feeSatang !== 0n ||
      repayment.totalSatang !==
        repayment.principalSatang + repayment.interestSatang,
  );

  if (
    persistedTotal !== input.amountSatang ||
    componentMismatch
  ) {
    throw new Error(
      "Existing repayment records do not reconcile to the requested amount.",
    );
  }

  const repayments = [...transaction.repayments]
    .sort(
      (a, b) =>
        a.installment.installmentNumber -
        b.installment.installmentNumber,
    )
    .map((repayment) => ({
      installmentId: repayment.installmentId,
      principalSatang: repayment.principalSatang,
      interestSatang: repayment.interestSatang,
      feeSatang: repayment.feeSatang,
      totalSatang: repayment.totalSatang,
    }));

  return {
    loanId: input.loanId,
    ledgerTransactionId: transaction.id,
    totalSatang: persistedTotal,
    repayments,
  };
}

/**
 * Locks resources in a deterministic order:
 * loan -> wallets (ascending ID) -> payable installments.
 *
 * Schedule versions are immutable calculation snapshots. The loan row lock
 * serializes submission against other operations that follow this lock order.
 */
async function lockRepaymentResources(
  tx: TransactionClient,
  loanId: string,
  walletIds: string[],
  scheduleVersionId: string,
): Promise<void> {
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM loans
    WHERE id = ${loanId}::uuid
    FOR UPDATE
  `;

  for (const walletId of [...walletIds].sort()) {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM wallets
      WHERE id = ${walletId}::uuid
      FOR UPDATE
    `;
  }

  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM installments
    WHERE schedule_version_id = ${scheduleVersionId}::uuid
      AND due_date <= CURRENT_DATE
      AND status IN ('PENDING', 'PARTIALLY_PAID', 'OVERDUE')
    ORDER BY due_date ASC, installment_number ASC
    FOR UPDATE
  `;
}

async function getPayableInstallments(
  tx: TransactionClient,
  scheduleVersionId: string,
): Promise<PayableInstallment[]> {
  const installments = await tx.installment.findMany({
    where: {
      scheduleVersionId,
      dueDate: { lte: getStartOfTodayUtc() },
      status: { in: [...PAYABLE_INSTALLMENT_STATUSES] },
    },
    orderBy: [
      { dueDate: "asc" },
      { installmentNumber: "asc" },
    ],
    select: {
      id: true,
      installmentNumber: true,
      dueDate: true,
      principalDueSatang: true,
      interestDueSatang: true,
      paidPrincipalSatang: true,
      paidInterestSatang: true,
      status: true,
    },
  });

  return installments;
}

/** Read-only payable breakdown using the same UTC due-date and status rules as submission. */
export async function getBorrowerPayableSummary(input: {
  loanId: string;
  borrowerUserId: string;
}) {
  const loan = await prisma.loan.findFirst({
    where: {
      id: input.loanId,
      borrowerProfile: { userId: input.borrowerUserId },
      status: { in: ["ACTIVE", "DELINQUENT"] },
      disbursedAt: { not: null },
    },
    select: {
      id: true,
      repaymentSchedule: { select: { currentVersionId: true } },
    },
  });
  if (!loan) return null;

  const scheduleVersionId = loan.repaymentSchedule?.currentVersionId;
  if (!scheduleVersionId) return null;
  const installments = await prisma.installment.findMany({
    where: {
      scheduleVersionId,
      dueDate: { lte: getStartOfTodayUtc() },
      status: { in: [...PAYABLE_INSTALLMENT_STATUSES] },
    },
    orderBy: [{ dueDate: "asc" }, { installmentNumber: "asc" }],
    select: {
      id: true,
      installmentNumber: true,
      dueDate: true,
      principalDueSatang: true,
      interestDueSatang: true,
      paidPrincipalSatang: true,
      paidInterestSatang: true,
      status: true,
    },
  });
  const payableInstallments = installments.map((installment) => {
    const remainingPrincipalSatang = getRemainingPrincipal(installment);
    const remainingInterestSatang = getRemainingInterest(installment);
    const remainingBalanceSatang = getRemainingAmount(installment);
    return {
      installmentId: installment.id,
      installmentNumber: installment.installmentNumber,
      dueDate: installment.dueDate,
      status: installment.status,
      remainingPrincipalSatang,
      remainingInterestSatang,
      remainingBalanceSatang,
    };
  });

  return {
    loanId: loan.id,
    scheduleVersionId,
    payableAmountSatang: payableInstallments.reduce(
      (total, installment) => total + installment.remainingBalanceSatang,
      0n,
    ),
    installments: payableInstallments,
  };
}

async function resolveRepaymentWallets(
  tx: TransactionClient,
  borrowerUserId: string,
): Promise<{
  borrowerWallet: {
    id: string;
    currency: string;
    balanceSatang: bigint;
    status: string;
    ownerUserId: string | null;
    ownerPlatformAccountId: string | null;
  };
  clearingWallet: {
    id: string;
    currency: string;
    balanceSatang: bigint;
    status: string;
    ownerUserId: string | null;
    ownerPlatformAccountId: string | null;
  };
}> {
  const borrowerWallet = await tx.wallet.findUnique({
    where: { ownerUserId: borrowerUserId },
    select: {
      id: true,
      currency: true,
      balanceSatang: true,
      status: true,
      ownerUserId: true,
      ownerPlatformAccountId: true,
    },
  });

  if (
    !borrowerWallet ||
    borrowerWallet.ownerUserId !== borrowerUserId ||
    borrowerWallet.ownerPlatformAccountId !== null ||
    borrowerWallet.status !== "ACTIVE" ||
    borrowerWallet.currency !== CURRENCY
  ) {
    throw new Error("Borrower's active THB wallet was not found.");
  }

  const clearingAccount = await tx.platformAccount.findUnique({
    where: { accountCode: REPAYMENT_CLEARING_ACCOUNT_CODE },
    include: {
      wallets: {
        select: {
          id: true,
          currency: true,
          balanceSatang: true,
          status: true,
          ownerUserId: true,
          ownerPlatformAccountId: true,
        },
      },
    },
  });

  if (
    !clearingAccount ||
    clearingAccount.status !== "ACTIVE" ||
    clearingAccount.accountType !== "LIABILITY" ||
    clearingAccount.currency !== CURRENCY ||
    clearingAccount.wallets.length !== 1
  ) {
    throw new Error(
      "Repayment Clearing account 2300 is not correctly configured.",
    );
  }

  const clearingWallet = clearingAccount.wallets[0];

  if (
    clearingWallet.ownerPlatformAccountId !== clearingAccount.id ||
    clearingWallet.ownerUserId !== null ||
    clearingWallet.status !== "ACTIVE" ||
    clearingWallet.currency !== CURRENCY
  ) {
    throw new Error(
      "Repayment Clearing platform wallet is not active or valid.",
    );
  }

  return { borrowerWallet, clearingWallet };
}

async function submitRepaymentInTransaction(
  tx: TransactionClient,
  input: SubmitRepaymentInput,
  options: SubmitRepaymentTestOptions,
): Promise<SubmitRepaymentPostingResult> {
  const loan = await tx.loan.findUnique({
    where: { id: input.loanId },
    select: {
      id: true,
      status: true,
      disbursedAt: true,
      borrowerProfile: {
        select: { userId: true },
      },
      repaymentSchedule: {
        select: {
          currentVersionId: true,
        },
      },
    },
  });

  if (!loan) throw new Error("Loan not found.");

  if (loan.borrowerProfile.userId !== input.borrowerUserId) {
    throw new Error("Only the loan borrower can submit a repayment.");
  }

  const { borrowerWallet, clearingWallet } =
    await resolveRepaymentWallets(tx, input.borrowerUserId);

  // Check for a completed retry before current eligibility checks.
  const existingBeforeLock = await findExistingRepayment(
    tx,
    input,
    borrowerWallet.id,
    clearingWallet.id,
  );

  if (existingBeforeLock) return existingBeforeLock;

  if (loan.status !== "ACTIVE" && loan.status !== "DELINQUENT") {
    throw new Error("Loan is not eligible for repayment.");
  }

  if (!loan.disbursedAt) {
    throw new Error("Loan has not been disbursed.");
  }

  const scheduleVersionId = loan.repaymentSchedule?.currentVersionId;

  if (!scheduleVersionId) {
    throw new Error("Loan has no active repayment schedule.");
  }

  await lockRepaymentResources(
    tx,
    loan.id,
    [borrowerWallet.id, clearingWallet.id],
    scheduleVersionId,
  );

  // Re-check idempotency after locks to handle a concurrent completed request.
  const existingAfterLock = await findExistingRepayment(
    tx,
    input,
    borrowerWallet.id,
    clearingWallet.id,
  );

  if (existingAfterLock) return existingAfterLock;

  // Re-read mutable records after acquiring locks.
  const lockedLoan = await tx.loan.findUnique({
    where: { id: input.loanId },
    select: {
      id: true,
      status: true,
      disbursedAt: true,
      borrowerProfile: {
        select: { userId: true },
      },
      repaymentSchedule: {
        select: { currentVersionId: true },
      },
    },
  });

  if (
    !lockedLoan ||
    lockedLoan.borrowerProfile.userId !== input.borrowerUserId ||
    (lockedLoan.status !== "ACTIVE" &&
      lockedLoan.status !== "DELINQUENT") ||
    !lockedLoan.disbursedAt ||
    lockedLoan.repaymentSchedule?.currentVersionId !== scheduleVersionId
  ) {
    throw new Error("Loan repayment eligibility changed during submission.");
  }

  const lockedWallets = await tx.wallet.findMany({
    where: {
      id: { in: [borrowerWallet.id, clearingWallet.id] },
    },
    select: {
      id: true,
      balanceSatang: true,
      currency: true,
      status: true,
    },
  });

  const lockedBorrowerWallet = lockedWallets.find(
    (wallet) => wallet.id === borrowerWallet.id,
  );

  const lockedClearingWallet = lockedWallets.find(
    (wallet) => wallet.id === clearingWallet.id,
  );

  if (
    !lockedBorrowerWallet ||
    !lockedClearingWallet ||
    lockedBorrowerWallet.status !== "ACTIVE" ||
    lockedClearingWallet.status !== "ACTIVE" ||
    lockedBorrowerWallet.currency !== CURRENCY ||
    lockedClearingWallet.currency !== CURRENCY
  ) {
    throw new Error("Repayment wallets are no longer valid.");
  }

  const installments = await getPayableInstallments(
    tx,
    scheduleVersionId,
  );

  if (installments.length === 0) {
    throw new Error("There are no currently payable installments.");
  }

  const payableOutstandingSatang = sumOutstanding(installments);

  if (payableOutstandingSatang <= 0n) {
    throw new Error("There is no outstanding amount to repay.");
  }

  if (input.amountSatang > payableOutstandingSatang) {
    throw new Error(
      "Repayment amount exceeds the currently payable outstanding amount.",
    );
  }

  if (lockedBorrowerWallet.balanceSatang < input.amountSatang) {
    throw new Error("Insufficient borrower wallet balance.");
  }

  const allocations = allocateRepayment(
    installments,
    input.amountSatang,
  );

  const transfer = await (options.postTransfer ?? postWalletTransfer)(tx, {
    transactionType: TRANSACTION_TYPE,
    referenceType: REFERENCE_TYPE,
    referenceId: input.loanId,
    description: "Borrower loan repayment",
    idempotencyKey: input.idempotencyKey,
    debitWalletId: borrowerWallet.id,
    creditWalletId: clearingWallet.id,
    amountSatang: input.amountSatang,
  });

  // If the shared posting helper found an existing posting, validate and
  // return its business records rather than creating duplicate Repayment rows.
  if (transfer.reused) {
    const existing = await findExistingRepayment(
      tx,
      input,
      borrowerWallet.id,
      clearingWallet.id,
    );

    if (!existing) {
      throw new Error(
        "Existing ledger posting has no matching repayment records.",
      );
    }

    return existing;
  }

  const receivedAt = new Date();
  const submittedRepayments: SubmittedRepayment[] = [];
  const persistedRepaymentIds: string[] = [];

  for (const allocation of allocations) {
    const repayment = await tx.repayment.create({
      data: {
        loanId: input.loanId,
        installmentId: allocation.installment.id,
        ledgerTransactionId: transfer.ledgerTransactionId,
        principalSatang: allocation.principalSatang,
        interestSatang: allocation.interestSatang,
        feeSatang: 0n,
        totalSatang: allocation.totalSatang,
        status: "POSTED",
        receivedAt,
      },
      select: {
        id: true,
        installmentId: true,
        principalSatang: true,
        interestSatang: true,
        feeSatang: true,
        totalSatang: true,
      },
    });

    await options.afterRepaymentCreated?.(tx, repayment.id);
    persistedRepaymentIds.push(repayment.id);

    const newPaidPrincipal =
      allocation.installment.paidPrincipalSatang +
      allocation.principalSatang;

    const newPaidInterest =
      allocation.installment.paidInterestSatang +
      allocation.interestSatang;

    const remainingPrincipal =
      allocation.installment.principalDueSatang -
      newPaidPrincipal;

    const remainingInterest =
      allocation.installment.interestDueSatang -
      newPaidInterest;

    if (remainingPrincipal < 0n || remainingInterest < 0n) {
      throw new Error(
        "Repayment allocation exceeds the installment obligation.",
      );
    }

    const status = getUpdatedInstallmentStatus(
      remainingPrincipal,
      remainingInterest,
      allocation.installment.dueDate,
    );

    await tx.installment.update({
      where: { id: allocation.installment.id },
      data: {
        paidPrincipalSatang: newPaidPrincipal,
        paidInterestSatang: newPaidInterest,
        status,
      },
    });

    submittedRepayments.push({
      installmentId: repayment.installmentId,
      principalSatang: repayment.principalSatang,
      interestSatang: repayment.interestSatang,
      feeSatang: repayment.feeSatang,
      totalSatang: repayment.totalSatang,
    });

    if (options.persistAllocations !== false) {
      await persistRepaymentAllocations(tx, {
        repaymentId: repayment.id,
        loanId: input.loanId,
        principalSatang: repayment.principalSatang,
        interestSatang: repayment.interestSatang,
        allocationMethod:
          options.allocationMethod ?? REPAYMENT_ALLOCATION_METHOD,
      });
    }
  }

  // Completing the schedule is part of the same posting transaction. Keep
  // the loan's lifecycle projection and audit history in sync with the final
  // installment payment; any failure rolls back the ledger and wallet writes.
  const remainingInstallments = await tx.installment.count({
    where: {
      scheduleVersionId,
      status: { not: "PAID" },
    },
  });

  if (remainingInstallments === 0) {
    const completed = await tx.loan.updateMany({
      where: {
        id: input.loanId,
        status: { in: ["ACTIVE", "DELINQUENT"] },
      },
      data: { status: "REPAID" },
    });

    if (completed.count !== 1) {
      throw new Error("Loan repayment completion status could not be updated.");
    }

    await tx.loanStatusHistory.create({
      data: {
        loanId: input.loanId,
        previousStatus: lockedLoan.status,
        newStatus: "REPAID",
        reason: "All scheduled repayment obligations have been paid.",
      },
    });
  }

  const persistedTotal = submittedRepayments.reduce(
    (total, repayment) => total + repayment.totalSatang,
    0n,
  );

  if (persistedTotal !== input.amountSatang) {
    throw new Error("Persisted repayment allocations do not reconcile.");
  }

  await tx.auditLog.create({
    data: {
      actorUserId: input.borrowerUserId,
      action: "REPAYMENT_SUBMITTED",
      targetType: "LOAN",
      targetId: input.loanId,
      reason: "Borrower submitted a repayment.",
      newValues: {
        loanId: input.loanId,
        ledgerTransactionId: transfer.ledgerTransactionId,
        repaymentIds: persistedRepaymentIds,
        totalSatang: persistedTotal.toString(),
        idempotencyKey: input.idempotencyKey,
      },
      outcome: "SUCCESS",
      correlationId: randomUUID(),
    },
  });

  return {
    loanId: input.loanId,
    ledgerTransactionId: transfer.ledgerTransactionId,
    totalSatang: persistedTotal,
    repayments: submittedRepayments,
  };
}

/**
 * Public repayment submission operation.
 *
 * The retry helper must retry the complete transaction for serialization
 * conflicts and the specific idempotency-key unique-conflict race.
 */
export async function submitRepayment(
  input: SubmitRepaymentInput,
  options: SubmitRepaymentTestOptions = {},
): Promise<SubmitRepaymentResult> {
  assertValidInput(input);

  const posting = await withSerializableTransactionRetry((tx) =>
    submitRepaymentInTransaction(tx, input, options),
  );
  const receipt = await generateRepaymentReceipt(
    posting.ledgerTransactionId,
  );

  return { ...posting, receipt };
}
