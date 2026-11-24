
import { prisma } from "../prisma";
import {
  assertAdministrator,
  FINANCIAL_TRANSACTION_OPTIONS,
  isRetryableTransactionError,
  isUniqueConstraintError,
  lockEscrowAccount,
  lockLoan,
  lockWallets,
  MAX_FINANCIAL_RETRIES,
  reject,
  validateIdempotencyKey,
} from "./financial-service.utils";
import {
  getAssetAccountBalance,
  requireLoanPrincipalAccounts,
  requireUserWalletControlAccount,
} from "./ledger-control-accounts.service";

const APPROVAL_ACTION = "LOAN_DISBURSEMENT_APPROVED";
const REQUEST_ACTION = "LOAN_DISBURSEMENT_REQUESTED";
const TARGET_TYPE = "LOAN";

const REQUEST_SCHEMA = "loan_disbursement_request.v1";
const APPROVAL_SCHEMA = "loan_disbursement_approval.v1";

const ESCROW_ACCOUNT_CODE = "2200";
const CURRENCY = "THB";
const TRANSACTION_TYPE = "LOAN_DISBURSEMENT";
const REFERENCE_TYPE = "LOAN";

export class LoanDisbursementError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "LoanDisbursementError";
  }
}

function fail(message: string, code: string): never {
  throw new LoanDisbursementError(message, code);
}

type ApprovalContext = {
  loanId: string;
  requesterUserId: string;
  approverUserId: string;
};

async function assertApproval(
  tx: Parameters<typeof assertAdministrator>[0],
  approvalAuditLogId: string,
  loanId: string,
): Promise<ApprovalContext> {
  const approval = await tx.auditLog.findUnique({
    where: { id: approvalAuditLogId },
  });

  if (
    !approval ||
    approval.action !== APPROVAL_ACTION ||
    approval.targetType !== TARGET_TYPE ||
    approval.targetId !== loanId ||
    approval.outcome !== "SUCCESS"
  ) {
    fail("Valid disbursement approval was not found.", "INVALID_APPROVAL");
  }

  const approvalValues = approval.newValues as
    | {
        schemaVersion?: string;
        requestAuditLogId?: string;
        approvedByUserId?: string;
      }
    | null;

  if (
    approvalValues?.schemaVersion !== APPROVAL_SCHEMA ||
    !approvalValues.requestAuditLogId ||
    approvalValues.approvedByUserId !== approval.actorUserId
  ) {
    fail("Disbursement approval evidence is invalid.", "INVALID_APPROVAL");
  }

  const request = await tx.auditLog.findUnique({
    where: { id: approvalValues.requestAuditLogId },
  });

  if (
    !request ||
    request.action !== REQUEST_ACTION ||
    request.targetType !== TARGET_TYPE ||
    request.targetId !== loanId ||
    request.outcome !== "SUCCESS"
  ) {
    fail("Linked disbursement request is invalid.", "INVALID_REQUEST");
  }

  const requestValues = request.newValues as
    | { schemaVersion?: string; status?: string }
    | null;

  if (
    requestValues?.schemaVersion !== REQUEST_SCHEMA ||
    requestValues.status !== "PENDING"
  ) {
    fail("Linked request evidence is invalid.", "INVALID_REQUEST");
  }

  const loan = await tx.loan.findUnique({
    where: { id: loanId },
    select: {
      principalSatang: true,
      borrowerProfile: { select: { userId: true } },
    },
  });
  const borrowerConsent = loan ? await tx.auditLog.findFirst({
    where: {
      actorUserId: loan.borrowerProfile.userId,
      action: "LOAN_DISBURSEMENT_CONSENTED",
      targetType: TARGET_TYPE,
      targetId: loanId,
      outcome: "SUCCESS",
      newValues: { path: ["schemaVersion"], equals: "loan_disbursement_consent.v1" },
    },
    select: { id: true, newValues: true },
  }) : null;
  const consentValues = borrowerConsent?.newValues as
    | { confirmedPrincipalSatang?: unknown; currency?: unknown }
    | null;
  if (
    !borrowerConsent || !consentValues || !loan ||
    consentValues.confirmedPrincipalSatang !== loan.principalSatang.toString() ||
    consentValues.currency !== "THB"
  ) {
    fail("Borrower confirmation is required before disbursement.", "BORROWER_CONSENT_REQUIRED");
  }

    if (!request.actorUserId) {
    fail(
        "Disbursement request has no requesting administrator.",
        "INVALID_REQUEST",
    );
    }

  await assertAdministrator(tx, approval.actorUserId);
  await assertAdministrator(tx, request.actorUserId);

  return {
    loanId,
    requesterUserId: request.actorUserId,
    approverUserId: approval.actorUserId,
  };
}

async function findExistingDisbursement(
  tx: Parameters<typeof assertAdministrator>[0],
  input: {
    idempotencyKey: string;
    loanId: string;
    amountSatang: bigint;
    escrowWalletId: string;
    borrowerWalletId: string;
    escrowAccountId: string;
    userWalletControlAccountId: string;
    loanReceivableAccountId: string;
    fundingAssetAccountId: string;
  },
) {
  const existing = await tx.ledgerTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });

  if (!existing) return null;

  if (
    existing.transactionType !== TRANSACTION_TYPE ||
    existing.referenceType !== REFERENCE_TYPE ||
    existing.referenceId !== input.loanId ||
    existing.status !== "POSTED" ||
    existing.postedAt === null
  ) {
    fail(
      "Idempotency key is already used by another transaction.",
      "IDEMPOTENCY_CONFLICT",
    );
  }

  const [entries, escrowMovements] = await Promise.all([
    tx.ledgerEntry.findMany({
      where: { ledgerTransactionId: existing.id },
      select: {
        walletId: true,
        platformAccountId: true,
        entryType: true,
        amountSatang: true,
        currency: true,
      },
    }),
    tx.escrowTransaction.findMany({
      where: { ledgerTransactionId: existing.id },
      select: {
        escrowAccountId: true,
        type: true,
        amountSatang: true,
      },
    }),
  ]);

  const hasDebit = entries.some(
    (entry) =>
      entry.walletId === input.escrowWalletId &&
      entry.entryType === "DEBIT" &&
      entry.amountSatang === input.amountSatang &&
      entry.currency === CURRENCY,
  );

  const hasCredit = entries.some(
    (entry) =>
      entry.walletId === input.borrowerWalletId &&
      (entry.platformAccountId === input.userWalletControlAccountId || entry.platformAccountId === null) &&
      entry.entryType === "CREDIT" &&
      entry.amountSatang === input.amountSatang &&
      entry.currency === CURRENCY,
  );

  const hasReceivableDebit = entries.some((entry) =>
    entry.walletId === null && entry.platformAccountId === input.loanReceivableAccountId &&
    entry.entryType === "DEBIT" && entry.amountSatang === input.amountSatang && entry.currency === CURRENCY,
  );
  const hasFundingCredit = entries.some((entry) =>
    entry.walletId === null && entry.platformAccountId === input.fundingAssetAccountId &&
    entry.entryType === "CREDIT" && entry.amountSatang === input.amountSatang && entry.currency === CURRENCY,
  );
  const validMovement =
    (entries.length === 2 || (entries.length === 4 && hasReceivableDebit && hasFundingCredit)) &&
    hasDebit &&
    hasCredit &&
    escrowMovements.length === 1 &&
    escrowMovements[0].escrowAccountId === input.escrowAccountId &&
    escrowMovements[0].type === "DISBURSEMENT" &&
    escrowMovements[0].amountSatang === input.amountSatang;

  if (!validMovement) {
    fail(
      "Existing transaction does not match the expected disbursement.",
      "IDEMPOTENCY_CONFLICT",
    );
  }

  return existing;
}

async function postDisbursement(
  tx: Parameters<typeof assertAdministrator>[0],
  input: {
    loanId: string;
    approvalAuditLogId: string;
    idempotencyKey: string;
  },
) {
  const approval = await assertApproval(
    tx,
    input.approvalAuditLogId,
    input.loanId,
  );

  await lockLoan(tx, input.loanId);

  const loan = await tx.loan.findUnique({
    where: { id: input.loanId },
    include: {
      borrowerProfile: true,
      escrowAccount: {
        include: {
          platformWallet: {
            include: {
              ownerPlatformAccount: true,
            },
          },
        },
      },
    },
  });

  if (!loan) {
    fail("Loan was not found.", "LOAN_NOT_FOUND");
  }

  const escrowAccount = loan.escrowAccount;
  const escrowWallet = escrowAccount?.platformWallet;

  if (!escrowAccount || !escrowWallet) {
    fail("Loan escrow account was not found.", "ESCROW_NOT_FOUND");
  }

  const borrowerUserId = loan.borrowerProfile.userId;

  const borrowerWallet = await tx.wallet.findFirst({
    where: {
      ownerUserId: borrowerUserId,
      ownerPlatformAccountId: null,
      currency: CURRENCY,
      status: "ACTIVE",
    },
    select: {
      id: true,
    },
  });

  if (!borrowerWallet) {
    fail("Active THB borrower wallet was not found.", "BORROWER_WALLET_NOT_FOUND");
  }

  let walletControlAccount: { id: string };
  let principalAccounts: Awaited<ReturnType<typeof requireLoanPrincipalAccounts>>;
  try {
    [walletControlAccount, principalAccounts] = await Promise.all([
      requireUserWalletControlAccount(tx),
      requireLoanPrincipalAccounts(tx),
    ]);
  } catch (error) {
    fail(error instanceof Error ? error.message : "Loan accounting accounts are unavailable.", "ACCOUNTING_CONFIGURATION_INVALID");
  }


  if (
    escrowAccount.status !== "FULLY_FUNDED" ||
    escrowWallet.ownerUserId !== null ||
    escrowWallet.ownerPlatformAccountId === null ||
    escrowWallet.currency !== CURRENCY ||
    escrowWallet.status !== "ACTIVE" ||
    escrowWallet.ownerPlatformAccount?.accountCode !== ESCROW_ACCOUNT_CODE ||
    escrowWallet.ownerPlatformAccount.accountType !== "LIABILITY" ||
    escrowWallet.ownerPlatformAccount.status !== "ACTIVE"
  ) {
    fail("Loan escrow wallet configuration is invalid.", "INVALID_ESCROW_WALLET");
  }

  const amountSatang = loan.principalSatang;

  if (
    loan.status === "ACTIVE" &&
    loan.disbursedAt !== null
  ) {
    const existing = await findExistingDisbursement(tx, {
      idempotencyKey: input.idempotencyKey,
      loanId: loan.id,
      amountSatang,
      escrowWalletId: escrowWallet.id,
      borrowerWalletId: borrowerWallet.id,
      escrowAccountId: escrowAccount.id,
      userWalletControlAccountId: walletControlAccount.id,
      loanReceivableAccountId: principalAccounts.loanReceivable.id,
      fundingAssetAccountId: principalAccounts.fundingAsset.id,
    });

    if (existing) return existing;

    fail("Loan has already been disbursed.", "ALREADY_DISBURSED");
  }

  if (
    loan.status !== "FUNDED" ||
    loan.disbursedAt !== null ||
    amountSatang <= 0n ||
    loan.fundedSatang !== amountSatang
  ) {
    fail("Loan is not eligible for disbursement.", "LOAN_NOT_ELIGIBLE");
  }

  if (escrowAccount.heldSatang < amountSatang) {
    fail("Insufficient loan escrow balance.", "INSUFFICIENT_ESCROW");
  }

  await lockEscrowAccount(tx, escrowAccount.id);
  await lockWallets(tx, [escrowWallet.id, borrowerWallet.id]);

  const [lockedLoan, lockedEscrow, lockedEscrowWallet, lockedBorrowerWallet] =
    await Promise.all([
      tx.loan.findUnique({
        where: { id: loan.id },
        select: {
          status: true,
          principalSatang: true,
          fundedSatang: true,
          disbursedAt: true,
        },
      }),
      tx.escrowAccount.findUnique({
        where: { id: escrowAccount.id },
        select: {
          status: true,
          heldSatang: true,
          platformWalletId: true,
        },
      }),
      tx.wallet.findUnique({
        where: { id: escrowWallet.id },
        select: {
          balanceSatang: true,
          status: true,
          currency: true,
          ownerUserId: true,
          ownerPlatformAccountId: true,
        },
      }),
      tx.wallet.findUnique({
        where: { id: borrowerWallet.id },
        select: {
          balanceSatang: true,
          status: true,
          currency: true,
          ownerUserId: true,
          ownerPlatformAccountId: true,
        },
      }),
    ]);

  if (
    !lockedLoan ||
    lockedLoan.status !== "FUNDED" ||
    lockedLoan.disbursedAt !== null ||
    lockedLoan.principalSatang !== amountSatang ||
    lockedLoan.fundedSatang !== amountSatang
  ) {
    fail("Loan eligibility changed.", "LOAN_NOT_ELIGIBLE");
  }

  if (
    !lockedEscrow ||
    lockedEscrow.status !== "FULLY_FUNDED" ||
    lockedEscrow.platformWalletId !== escrowWallet.id ||
    lockedEscrow.heldSatang < amountSatang
  ) {
    fail("Loan escrow balance is insufficient or invalid.", "INSUFFICIENT_ESCROW");
  }

  if (
    !lockedEscrowWallet ||
    lockedEscrowWallet.status !== "ACTIVE" ||
    lockedEscrowWallet.currency !== CURRENCY ||
    lockedEscrowWallet.ownerUserId !== null ||
    lockedEscrowWallet.ownerPlatformAccountId === null ||
    lockedEscrowWallet.balanceSatang < amountSatang
  ) {
    fail("Shared escrow wallet has insufficient funds or is invalid.", "INVALID_ESCROW_BALANCE");
  }

  if (
    !lockedBorrowerWallet ||
    lockedBorrowerWallet.status !== "ACTIVE" ||
    lockedBorrowerWallet.currency !== CURRENCY ||
    lockedBorrowerWallet.ownerUserId !== borrowerUserId ||
    lockedBorrowerWallet.ownerPlatformAccountId !== null
  ) {
    fail("Borrower wallet changed or is invalid.", "INVALID_BORROWER_WALLET");
  }

  const existing = await findExistingDisbursement(tx, {
    idempotencyKey: input.idempotencyKey,
    loanId: loan.id,
    amountSatang,
    escrowWalletId: escrowWallet.id,
    borrowerWalletId: borrowerWallet.id,
    escrowAccountId: escrowAccount.id,
    userWalletControlAccountId: walletControlAccount.id,
    loanReceivableAccountId: principalAccounts.loanReceivable.id,
    fundingAssetAccountId: principalAccounts.fundingAsset.id,
  });

  if (existing) return existing;

  if (await getAssetAccountBalance(tx, principalAccounts.fundingAsset.id) < amountSatang) {
    fail("Simulated funding asset account 1300 has insufficient balance for this loan disbursement.", "SIMULATED_FUNDING_ASSET_INSUFFICIENT");
  }

  const ledger = await tx.ledgerTransaction.create({
    data: {
      transactionType: TRANSACTION_TYPE,
      status: "DRAFT",
      idempotencyKey: input.idempotencyKey,
      referenceType: REFERENCE_TYPE,
      referenceId: loan.id,
      description: `Loan disbursement for loan ${loan.id}`,
    },
  });

  await tx.ledgerEntry.createMany({
    data: [
      {
        ledgerTransactionId: ledger.id,
        walletId: escrowWallet.id,
        entryType: "DEBIT",
        amountSatang,
        currency: CURRENCY,
      },
      {
        ledgerTransactionId: ledger.id,
        walletId: borrowerWallet.id,
        platformAccountId: walletControlAccount.id,
        entryType: "CREDIT",
        amountSatang,
        currency: CURRENCY,
      },
      {
        ledgerTransactionId: ledger.id,
        platformAccountId: principalAccounts.loanReceivable.id,
        entryType: "DEBIT",
        amountSatang,
        currency: CURRENCY,
      },
      {
        ledgerTransactionId: ledger.id,
        platformAccountId: principalAccounts.fundingAsset.id,
        entryType: "CREDIT",
        amountSatang,
        currency: CURRENCY,
      },
    ],
  });

  const postedLedger = await tx.ledgerTransaction.update({
    where: {
        id: ledger.id,
        status: "DRAFT",
    },
    data: {
        status: "POSTED",
        postedAt: new Date(),
    },
    });
  const escrowWalletUpdate = await tx.wallet.updateMany({
    where: {
      id: escrowWallet.id,
      status: "ACTIVE",
      balanceSatang: { gte: amountSatang },
    },
    data: {
      balanceSatang: { decrement: amountSatang },
    },
  });

  if (escrowWalletUpdate.count !== 1) {
    fail("Unable to debit shared escrow wallet.", "ESCROW_DEBIT_FAILED");
  }

  const borrowerWalletUpdate = await tx.wallet.updateMany({
    where: {
      id: borrowerWallet.id,
      status: "ACTIVE",
      ownerUserId: borrowerUserId,
      balanceSatang: { gte: 0n },
    },
    data: {
      balanceSatang: { increment: amountSatang },
    },
  });

  if (borrowerWalletUpdate.count !== 1) {
    fail("Unable to credit borrower wallet.", "BORROWER_CREDIT_FAILED");
  }

  const escrowUpdate = await tx.escrowAccount.updateMany({
    where: {
      id: escrowAccount.id,
      status: "FULLY_FUNDED",
      heldSatang: { gte: amountSatang },
    },
    data: {
      heldSatang: { decrement: amountSatang },
    },
  });

  if (escrowUpdate.count !== 1) {
    fail("Unable to decrease loan escrow balance.", "ESCROW_UPDATE_FAILED");
  }

  await tx.escrowTransaction.create({
    data: {
      escrowAccountId: escrowAccount.id,
      ledgerTransactionId: ledger.id,
      type: "DISBURSEMENT",
      amountSatang,
    },
  });

  const loanUpdate = await tx.loan.updateMany({
    where: {
      id: loan.id,
      status: "FUNDED",
      disbursedAt: null,
      fundedSatang: amountSatang,
    },
    data: {
      status: "ACTIVE",
      disbursedAt: new Date(),
    },
  });

  if (loanUpdate.count !== 1) {
    fail("Loan status changed during disbursement.", "LOAN_UPDATE_FAILED");
  }

  await tx.loanStatusHistory.create({
    data: {
      loanId: loan.id,
      previousStatus: "FUNDED",
      newStatus: "ACTIVE",
      reason: `Approved disbursement. Approval audit: ${input.approvalAuditLogId}`,
      changedByUserId: approval.approverUserId,
    },
  });

  return postedLedger;
}

export async function postLoanDisbursement(input: {
  loanId: string;
  approvalAuditLogId: string;
  idempotencyKey: string;
}) {
  if (!input.loanId || !input.approvalAuditLogId) {
    fail("Loan and approval IDs are required.", "INVALID_REFERENCE");
  }

  const idempotencyKey = validateIdempotencyKey(input.idempotencyKey);

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await prisma.$transaction(
        (tx) =>
          postDisbursement(tx, {
            ...input,
            idempotencyKey,
          }),
        FINANCIAL_TRANSACTION_OPTIONS,
      );
    } catch (error) {
      if (
        attempt < MAX_FINANCIAL_RETRIES &&
        isRetryableTransactionError(error)
      ) {
        continue;
      }

      if (isUniqueConstraintError(error)) {
        return prisma.$transaction(
          (tx) =>
            postDisbursement(tx, {
              ...input,
              idempotencyKey,
            }),
          FINANCIAL_TRANSACTION_OPTIONS,
        );
      }

      throw error;
    }
  }
}
