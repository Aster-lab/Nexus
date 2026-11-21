import { z } from "zod";
import { ApiError, apiErrorResponseFrom } from "../../../../lib/api/errors";
import { requireAdministrator } from "../../../../lib/api/administrator";
import { parsePagination } from "../../../../lib/api/pagination";
import { apiPaginatedResponse, apiSuccessResponse } from "../../../../lib/api/responses";
import { parseJsonBody } from "../../../../lib/api/validation";
import { postInvestorPayout } from "../../../../lib/services/investor-payout.service";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const payoutStatuses = ["PENDING", "PROCESSING", "COMPLETED", "FAILED"];
const payoutRequest = z.object({ payoutAllocationId: z.uuid() }).strict();

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdministrator(request);
    const pagination = parsePagination(new URL(request.url).searchParams, { sortFields: ["createdAt", "completedAt"], filterFields: ["status", "investorProfileId"] });
    const status = pagination.filters?.status;
    const investorProfileId = pagination.filters?.investorProfileId;
    if (status && !payoutStatuses.includes(status)) throw new ApiError("VALIDATION_ERROR", "Unsupported payout status filter.", 400);
    if (investorProfileId && !z.uuid().safeParse(investorProfileId).success) throw new ApiError("VALIDATION_ERROR", "Invalid investorProfileId filter.", 400);
    const where = { ...(status ? { status: status as never } : {}), ...(investorProfileId ? { investorProfileId } : {}) };
    const [rows, total] = await Promise.all([
      prisma.investorPayout.findMany({ where, orderBy: pagination.sortBy === "completedAt" ? { completedAt: pagination.sortOrder } : { createdAt: pagination.sortOrder }, skip: pagination.offset, take: pagination.limit, select: { id: true, investorProfileId: true, walletId: true, payoutAllocationId: true, principalSatang: true, interestSatang: true, status: true, ledgerTransactionId: true, completedAt: true, createdAt: true } }),
      prisma.investorPayout.count({ where }),
    ]);
    return apiPaginatedResponse(rows.map((row) => ({ ...row, principalSatang: row.principalSatang.toString(), interestSatang: row.interestSatang.toString() })), pagination, total);
  } catch (error) { return apiErrorResponseFrom(error); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await requireAdministrator(request);
    const input = await parseJsonBody(request, payoutRequest);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > 255) throw new ApiError("VALIDATION_ERROR", "A valid Idempotency-Key header is required.", 400);
    const result = await postInvestorPayout({ actorUserId: identity.userId, payoutAllocationId: input.payoutAllocationId, idempotencyKey });
    return apiSuccessResponse({ ...result, amountSatang: result.amountSatang.toString() }, { status: 201, message: "Investor payout completed." });
  } catch (error) { return apiErrorResponseFrom(error); }
}
