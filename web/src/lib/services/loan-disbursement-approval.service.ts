
import { prisma } from "../prisma";
import {
  assertAdministrator,
  FINANCIAL_TRANSACTION_OPTIONS,
  isRetryableTransactionError,
  lockLoan,
  MAX_FINANCIAL_RETRIES,
  reject,
  validateReason,
} from "./financial-service.utils";

const REQUEST_ACTION = "LOAN_DISBURSEMENT_REQUESTED";
const APPROVAL_ACTION = "LOAN_DISBURSEMENT_APPROVED";
const TARGET_TYPE = "LOAN";

const REQUEST_SCHEMA = "loan_disbursement_request.v1";
const APPROVAL_SCHEMA = "loan_disbursement_approval.v1";
const CONSENT_ACTION = "LOAN_DISBURSEMENT_CONSENTED";
const CONSENT_SCHEMA = "loan_disbursement_consent.v1";

export class LoanDisbursementApprovalError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "LoanDisbursementApprovalError";
  }
}

function fail(message: string, code: string): never {
  throw new LoanDisbursementApprovalError(message, code);
}

async function withSerializableRetry<T>(
  operation: () => Promise<T>,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (
        attempt >= MAX_FINANCIAL_RETRIES ||
        !isRetryableTransactionError(error)
      ) {
        throw error;
      }
    }
  }
}

async function assertEligibleLoan(
  tx: Parameters<typeof assertAdministrator>[0],
  loanId: string,
): Promise<void> {
  const loan = await tx.loan.findUnique({
    where: { id: loanId },
    select: {
      status: true,
      principalSatang: true,
      fundedSatang: true,
      disbursedAt: true,
    },
  });

  if (!loan) {
    fail("Loan was not found.", "LOAN_NOT_FOUND");
  }

  if (loan.status !== "FUNDED") {
    fail("Loan must be FUNDED before disbursement.", "INVALID_LOAN_STATUS");
  }

  if (
    loan.principalSatang <= 0n ||
    loan.fundedSatang !== loan.principalSatang
  ) {
    fail("Loan must be fully funded.", "LOAN_NOT_FULLY_FUNDED");
  }

  if (loan.disbursedAt !== null) {
    fail("Loan has already been disbursed.", "ALREADY_DISBURSED");
  }
}

async function assertBorrowerConsent(
  tx: Parameters<typeof assertAdministrator>[0],
  loanId: string,
): Promise<void> {
  const loan = await tx.loan.findUnique({
    where: { id: loanId },
    select: {
      principalSatang: true,
      borrowerProfile: { select: { userId: true } },
    },
  });
  if (!loan) fail("Loan was not found.", "LOAN_NOT_FOUND");

  const consent = await tx.auditLog.findFirst({
    where: {
      actorUserId: loan.borrowerProfile.userId,
      action: CONSENT_ACTION,
      targetType: TARGET_TYPE,
      targetId: loanId,
      outcome: "SUCCESS",
      newValues: { path: ["schemaVersion"], equals: CONSENT_SCHEMA },
    },
    select: { id: true, newValues: true },
  });
  const consentValues = consent?.newValues as
    | { confirmedPrincipalSatang?: unknown; currency?: unknown }
    | null;
  if (
    !consent || !consentValues ||
    consentValues.confirmedPrincipalSatang !== loan.principalSatang.toString() ||
    consentValues.currency !== "THB"
  ) {
    fail("Borrower confirmation is required before disbursement.", "BORROWER_CONSENT_REQUIRED");
  }
}

export async function recordBorrowerDisbursementConsent(input: {
  loanId: string;
  borrowerUserId: string;
}) {
  if (!input.loanId || !input.borrowerUserId) {
    fail("Loan and borrower IDs are required.", "INVALID_REFERENCE");
  }

  return withSerializableRetry(() => prisma.$transaction(async (tx) => {
    await lockLoan(tx, input.loanId);
    const loan = await tx.loan.findUnique({
      where: { id: input.loanId },
      select: {
        id: true,
        status: true,
        principalSatang: true,
        fundedSatang: true,
        disbursedAt: true,
        borrowerProfile: { select: { userId: true } },
      },
    });
    if (!loan || loan.borrowerProfile.userId !== input.borrowerUserId) {
      fail("Loan was not found.", "LOAN_NOT_FOUND");
    }
    if (loan.status !== "FUNDED" || loan.fundedSatang !== loan.principalSatang) {
      fail("Loan must be fully funded before confirming disbursement.", "INVALID_LOAN_STATUS");
    }
    if (loan.disbursedAt) fail("Loan has already been disbursed.", "ALREADY_DISBURSED");

    const existing = await tx.auditLog.findFirst({
      where: {
        actorUserId: input.borrowerUserId,
        action: CONSENT_ACTION,
        targetType: TARGET_TYPE,
        targetId: input.loanId,
        outcome: "SUCCESS",
        newValues: { path: ["schemaVersion"], equals: CONSENT_SCHEMA },
      },
      select: { id: true, createdAt: true },
    });
    if (existing) {
      return { id: existing.id, loanId: input.loanId, confirmedAt: existing.createdAt, alreadyConfirmed: true };
    }

    const consent = await tx.auditLog.create({
      data: {
        actorUserId: input.borrowerUserId,
        action: CONSENT_ACTION,
        targetType: TARGET_TYPE,
        targetId: input.loanId,
        oldValues: { status: "FUNDED", disbursedAt: null },
        newValues: {
          schemaVersion: CONSENT_SCHEMA,
          confirmedPrincipalSatang: loan.principalSatang.toString(),
          currency: "THB",
        },
        outcome: "SUCCESS",
      },
      select: { id: true, createdAt: true },
    });
    return { id: consent.id, loanId: input.loanId, confirmedAt: consent.createdAt, alreadyConfirmed: false };
  }, FINANCIAL_TRANSACTION_OPTIONS));
}

export async function requestLoanDisbursement(input: {
  loanId: string;
  requesterUserId: string;
  reason: string;
}) {
  const reason = validateReason(input.reason);

  if (!input.loanId || !input.requesterUserId) {
    fail("Loan and requester IDs are required.", "INVALID_REFERENCE");
  }

  return prisma.$transaction(
    async (tx) => {
      await assertAdministrator(tx, input.requesterUserId);
      await lockLoan(tx, input.loanId);
      await assertEligibleLoan(tx, input.loanId);
      await assertBorrowerConsent(tx, input.loanId);

      return tx.auditLog.create({
        data: {
          actorUserId: input.requesterUserId,
          action: REQUEST_ACTION,
          targetType: TARGET_TYPE,
          targetId: input.loanId,
          reason,
          oldValues: {
            status: "FUNDED",
          },
          newValues: {
            schemaVersion: REQUEST_SCHEMA,
            status: "PENDING",
          },
          outcome: "SUCCESS",
        },
      });
    },
    FINANCIAL_TRANSACTION_OPTIONS,
  );
}

export async function approveLoanDisbursement(input: {
  requestAuditLogId: string;
  approverUserId: string;
  reason: string;
}) {
  const reason = validateReason(input.reason);

  if (!input.requestAuditLogId || !input.approverUserId) {
    fail("Request and approver IDs are required.", "INVALID_REFERENCE");
  }

  return withSerializableRetry(() =>
    prisma.$transaction(
      async (tx) => {
        await assertAdministrator(tx, input.approverUserId);

        const request = await tx.auditLog.findUnique({
          where: { id: input.requestAuditLogId },
        });

        if (
          !request ||
          request.action !== REQUEST_ACTION ||
          request.targetType !== TARGET_TYPE ||
          request.outcome !== "SUCCESS"
        ) {
          fail(
            "Valid disbursement request was not found.",
            "INVALID_DISBURSEMENT_REQUEST",
          );
        }

        const requestValues = request.newValues as
          | { schemaVersion?: string; status?: string }
          | null;

        if (
          requestValues?.schemaVersion !== REQUEST_SCHEMA ||
          requestValues.status !== "PENDING"
        ) {
          fail(
            "Disbursement request is not pending.",
            "REQUEST_NOT_PENDING",
          );
        }

        if (!request.targetId) {
          fail(
            "Disbursement request is missing target loan ID.",
            "INVALID_DISBURSEMENT_REQUEST",
          );
        }
        const loanId = request.targetId;

        await lockLoan(tx, loanId);
        await assertEligibleLoan(tx, loanId);
        await assertBorrowerConsent(tx, loanId);

        // The requester must still be an active administrator.
        if (!request.actorUserId) {
            fail(
                "Disbursement request has no requesting administrator.",
                "INVALID_DISBURSEMENT_REQUEST",
            );
            }

        await assertAdministrator(tx, request.actorUserId);

        const existingApproval = await tx.auditLog.findFirst({
          where: {
            action: APPROVAL_ACTION,
            targetType: TARGET_TYPE,
            targetId: loanId,
            outcome: "SUCCESS",
            newValues: {
              path: ["requestAuditLogId"],
              equals: input.requestAuditLogId,
            },
          },
          select: { id: true },
        });

        if (existingApproval) {
          fail(
            "This disbursement request has already been approved.",
            "REQUEST_ALREADY_APPROVED",
          );
        }

        return tx.auditLog.create({
          data: {
            actorUserId: input.approverUserId,
            action: APPROVAL_ACTION,
            targetType: TARGET_TYPE,
            targetId: loanId,
            reason,
            oldValues: {
              requestStatus: "PENDING",
            },
            newValues: {
              schemaVersion: APPROVAL_SCHEMA,
              requestAuditLogId: input.requestAuditLogId,
              approvedByUserId: input.approverUserId,
            },
            outcome: "SUCCESS",
          },
        });
      },
      FINANCIAL_TRANSACTION_OPTIONS,
    ),
  );
}
