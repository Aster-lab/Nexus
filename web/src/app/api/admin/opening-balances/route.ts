import { z } from "zod";
import { ApiError, apiErrorResponseFrom } from "../../../../lib/api/errors";
import { requireAdministrator } from "../../../../lib/api/administrator";
import { apiSuccessResponse } from "../../../../lib/api/responses";
import { parseJsonBody } from "../../../../lib/api/validation";
import { createOpeningBalance } from "../../../../lib/services/opening-balance.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BIGINT = 9_223_372_036_854_775_807n;
const amountSatangSchema = z.string().refine((value) => {
  if (!/^\d{1,19}$/.test(value)) return false;
  try {
    const amount = BigInt(value);
    return amount > 0n && amount <= MAX_BIGINT;
  } catch {
    return false;
  }
}, "Amount must be a positive satang integer within the supported database range.");

const openingBalanceRequest = z.object({
  walletId: z.uuid(),
  amountSatang: amountSatangSchema,
  reason: z.string().trim().min(1).max(500),
}).strict();

export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await requireAdministrator(request);
    const input = await parseJsonBody(request, openingBalanceRequest);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > 255) {
      throw new ApiError("VALIDATION_ERROR", "A valid Idempotency-Key header is required.", 400);
    }

    const result = await createOpeningBalance({
      administratorUserId: identity.userId,
      walletId: input.walletId,
      amountSatang: BigInt(input.amountSatang),
      idempotencyKey,
      reason: input.reason,
    });

    return apiSuccessResponse({
      id: result.id,
      walletId: result.walletId,
      administratorUserId: result.administratorUserId,
      amountSatang: result.amountSatang.toString(),
      currency: result.currency,
      reason: result.reason,
      ledgerTransactionId: result.ledgerTransactionId,
      status: result.ledgerTransaction.status,
      postedAt: result.postedAt.toISOString(),
    }, { status: 201, message: "Opening balance posted." });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
