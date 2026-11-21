import { z } from "zod";
import type { Prisma } from "../../../../generated/prisma/client";
import { apiErrorResponseFrom, ApiError } from "../../../../lib/api/errors";
import { authenticateApiRequest } from "../../../../lib/api/authentication";
import { requireRole } from "../../../../lib/api/authorization";
import { apiPaginatedResponse, apiSuccessResponse } from "../../../../lib/api/responses";
import { parsePagination } from "../../../../lib/api/pagination";
import { prisma } from "../../../../lib/prisma";
import { parseJsonBody } from "../../../../lib/api/validation";
import { submitRepayment } from "../../../../lib/services/repayment/repayment-submitrepayment";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const repaymentRequestSchema = z.object({
  loanId: z.uuid(),
  amountSatang: z.string().regex(/^[1-9][0-9]{0,17}$/),
}).strict();

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    requireRole(identity, "BORROWER");
    if (!identity.borrowerProfile) throw new ApiError("FORBIDDEN", "A borrower profile is required.", 403);

    const pagination = parsePagination(new URL(request.url).searchParams, {
      sortFields: ["receivedAt", "createdAt"],
      defaultLimit: 20,
      maxLimit: 100,
    });
    const where = { loan: { borrowerProfileId: identity.borrowerProfile.id } };
    const orderBy: Prisma.RepaymentOrderByWithRelationInput[] = pagination.sortBy === "createdAt"
      ? [{ createdAt: pagination.sortOrder }, { id: pagination.sortOrder }]
      : [{ receivedAt: pagination.sortOrder }, { id: pagination.sortOrder }];
    const [items, total] = await Promise.all([
      prisma.repayment.findMany({
        where,
        orderBy,
        skip: pagination.offset,
        take: pagination.limit,
        select: {
          id: true,
          loanId: true,
          installmentId: true,
          ledgerTransactionId: true,
          principalSatang: true,
          interestSatang: true,
          feeSatang: true,
          totalSatang: true,
          status: true,
          receivedAt: true,
          createdAt: true,
          installment: { select: { installmentNumber: true, dueDate: true } },
          ledgerTransaction: { select: { status: true, postedAt: true } },
        },
      }),
      prisma.repayment.count({ where }),
    ]);
    const data = items.map((repayment) => ({
      ...repayment,
      principalSatang: repayment.principalSatang.toString(),
      interestSatang: repayment.interestSatang.toString(),
      feeSatang: repayment.feeSatang.toString(),
      totalSatang: repayment.totalSatang.toString(),
    }));
    return apiPaginatedResponse(data, pagination, total, { message: "Repayment history loaded." });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}

function serializeResult(result: Awaited<ReturnType<typeof submitRepayment>>) {
  const receipt = result.receipt;
  return {
    loanId: result.loanId,
    ledgerTransactionId: result.ledgerTransactionId,
    totalSatang: result.totalSatang.toString(),
    repayments: result.repayments.map((repayment) => ({
      installmentId: repayment.installmentId,
      principalSatang: repayment.principalSatang.toString(),
      interestSatang: repayment.interestSatang.toString(),
      feeSatang: repayment.feeSatang.toString(),
      totalSatang: repayment.totalSatang.toString(),
    })),
    receipt: {
      receiptId: receipt.receiptId,
      loanId: receipt.loanId,
      ledgerTransactionId: receipt.ledgerTransactionId,
      status: receipt.status,
      receiptTimestamp: receipt.receiptTimestamp.toISOString(),
      totalReceivedSatang: receipt.totalReceivedSatang.toString(),
      repaymentIds: receipt.repaymentIds,
      repayments: receipt.repayments.map((item) => ({
        ...item,
        principalSatang: item.principalSatang.toString(),
        interestSatang: item.interestSatang.toString(),
        totalSatang: item.totalSatang.toString(),
        remainingBalanceSatang: item.remainingBalanceSatang.toString(),
      })),
    },
  };
}

export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    requireRole(identity, "BORROWER");
    if (!identity.borrowerProfile) throw new ApiError("FORBIDDEN", "A borrower profile is required.", 403);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > 255) {
      throw new ApiError("VALIDATION_ERROR", "A valid Idempotency-Key header is required.", 400);
    }
    const body = await parseJsonBody(request, repaymentRequestSchema);
    const result = await submitRepayment({
      loanId: body.loanId,
      borrowerUserId: identity.userId,
      amountSatang: BigInt(body.amountSatang),
      idempotencyKey,
    });
    return apiSuccessResponse(serializeResult(result), { status: 201, message: "Repayment posted successfully." });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
