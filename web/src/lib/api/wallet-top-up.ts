import { z } from "zod";
import { authenticateApiRequest } from "./authentication";
import { requireRole } from "./authorization";
import { ApiError, apiErrorResponseFrom } from "./errors";
import { requireInvestor } from "./investor";
import { apiSuccessResponse } from "./responses";
import { parseJsonBody } from "./validation";
import { postSimulatedWalletTopUp } from "../services/wallet-top-up.service";

const walletTopUpRequestSchema = z.object({ amountSatang: z.string().regex(/^\d{1,19}$/, "Amount must be a positive satang integer.") }).strict();

export async function handleWalletTopUp(request: Request, role: "BORROWER" | "INVESTOR"): Promise<Response> {
  try {
    const identity = role === "INVESTOR" ? await requireInvestor(request) : await authenticateApiRequest(request);
    if (role === "BORROWER") {
      requireRole(identity, "BORROWER");
      if (!identity.borrowerProfile) throw new ApiError("FORBIDDEN", "A borrower profile is required.", 403);
    }
    const body = await parseJsonBody(request, walletTopUpRequestSchema);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > 255) throw new ApiError("VALIDATION_ERROR", "A valid Idempotency-Key header is required.", 400);
    const result = await postSimulatedWalletTopUp({ userId: identity.userId, role, amountSatang: BigInt(body.amountSatang), idempotencyKey });
    return apiSuccessResponse(result, { status: result.reused ? 200 : 201, message: result.reused ? "The prior simulated wallet top-up result was reused." : "Simulated wallet top-up posted." });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
