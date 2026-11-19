import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../prisma";

const REQUEST_ACTION = "LOAN_REFUND_REQUESTED";
const APPROVAL_ACTION = "LOAN_REFUND_APPROVED";
const TARGET_TYPE = "LOAN";

const MAX_REASON_LENGTH = 1000;
const MAX_RETRIES = 3;

type TransactionClient = Prisma.TransactionClient;

export class LoanRefundApprovalError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "LoanRefundApprovalError";
  }
}

function isRetryableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    code?: unknown;
    cause?: unknown;
  };

  // Prisma transaction conflict
  if (candidate.code === "P2034") {
    return true;
  }

  // Prisma 7 PostgreSQL driver-adapter transaction conflict
  if (candidate.cause && typeof candidate.cause === "object") {
    const cause = candidate.cause as {
      kind?: unknown;
      originalCode?: unknown;
    };

    return (
      cause.kind === "TransactionWriteConflict" ||
      cause.originalCode === "40001"
    );
  }

  return false;
}


function reject(message: string, code: string): never {
  throw new LoanRefundApprovalError(message, code);
}

function validateReason(reason: string): void {
  if (
    typeof reason !== "string" ||
    !reason.trim() ||
    reason.trim().length > MAX_REASON_LENGTH
  ) {
    reject("A valid reason is required.", "INVALID_REASON");
  }
}

async function assertAdministrator(
  tx: TransactionClient,
  userId: string,
): Promise<void> {
  const assignment = await tx.userRole.findFirst({
    where: {
      userId,
      role: { code: "ADMIN" },
    },
    select: { id: true },
  });

  if (!assignment) {
    reject(
      "Administrator privileges are required.",
      "ADMIN_REQUIRED",
    );
  }

  const user = await tx.user.findUnique({
    where: { id: userId },
    select: { accountStatus: true },
  });

  if (!user || user.accountStatus !== "ACTIVE") {
    reject("Administrator account is inactive.", "INVALID_ADMIN");
  }
}

async function assertRefundableLoan(
  tx: TransactionClient,
  loanId: string,
): Promise<void> {
  const loan = await tx.loan.findUnique({
    where: { id: loanId },
    select: {
      id: true,
      status: true,
      disbursedAt: true,
    },
  });

  if (!loan || loan.status !== "CANCELLED") {
    reject(
      "Only cancelled loans can be refunded.",
      "LOAN_NOT_CANCELLED",
    );
  }

  if (loan.disbursedAt !== null) {
    reject(
      "A disbursed loan cannot use the cancellation refund workflow.",
      "LOAN_ALREADY_DISBURSED",
    );
  }
}

export async function requestLoanRefund(input: {
  requestedByUserId: string;
  loanId: string;
  reason: string;
}) {
  if (!input.requestedByUserId || !input.loanId) {
    reject("User ID and loan ID are required.", "INVALID_REFERENCE");
  }

  validateReason(input.reason);

  return prisma.$transaction(
    async (tx) => {
      await assertRefundableLoan(tx, input.loanId);

      const request = await tx.auditLog.create({
        data: {
          actorUserId: input.requestedByUserId,
          action: REQUEST_ACTION,
          targetType: TARGET_TYPE,
          targetId: input.loanId,
          reason: input.reason.trim(),
          outcome: "SUCCESS",
          newValues: {
            schemaVersion: "loan_refund_request.v1",
            status: "PENDING",
          },
        },
      });

      return request;
    },
    {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 10_000,
      timeout: 15_000,
    },
  );
}

export async function approveLoanRefund(input: {
  approvedByUserId: string;
  requestAuditLogId: string;
  reason: string;
}) {
  if (!input.approvedByUserId || !input.requestAuditLogId) {
    reject("Administrator and request IDs are required.", "INVALID_REFERENCE");
  }

  validateReason(input.reason);

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await prisma.$transaction(
        async (tx) => {
          await assertAdministrator(tx, input.approvedByUserId);

          const request = await tx.auditLog.findUnique({
            where: { id: input.requestAuditLogId },
          });

          if (
            !request ||
            request.action !== REQUEST_ACTION ||
            request.targetType !== TARGET_TYPE ||
            request.outcome !== "SUCCESS" ||
            !request.targetId
          ) {
            reject("Valid refund request not found.", "INVALID_REFUND_REQUEST");
          }

          const requestData = request.newValues as
            | { schemaVersion?: string; status?: string }
            | null;

          if (
            requestData?.schemaVersion !== "loan_refund_request.v1" ||
            requestData.status !== "PENDING"
          ) {
            reject("Refund request is not pending.", "REQUEST_NOT_PENDING");
          }

          await assertRefundableLoan(tx, request.targetId);

          const existingApproval = await tx.auditLog.findFirst({
            where: {
              action: APPROVAL_ACTION,
              targetType: TARGET_TYPE,
              targetId: request.targetId,
              outcome: "SUCCESS",
              newValues: {
                path: ["requestAuditLogId"],
                equals: request.id,
              },
            },
          });

          if (existingApproval) {
              reject(
                "This refund request has already been approved.",
                "REFUND_ALREADY_APPROVED",
              );
          }

          return tx.auditLog.create({
            data: {
              actorUserId: input.approvedByUserId,
              action: APPROVAL_ACTION,
              targetType: TARGET_TYPE,
              targetId: request.targetId,
              reason: input.reason.trim(),
              outcome: "SUCCESS",
              newValues: {
                schemaVersion: "loan_refund_approval.v1",
                requestAuditLogId: request.id,
                approvedByUserId: input.approvedByUserId,
              },
            },
          });
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 15_000,
        },
      );
    } catch (error) {
      if (
        !isRetryableTransactionError(error) ||
        attempt === MAX_RETRIES
      ) {
        throw error;
      }
    }
  }

  reject("Refund approval retry limit reached.", "RETRY_LIMIT_REACHED");
}