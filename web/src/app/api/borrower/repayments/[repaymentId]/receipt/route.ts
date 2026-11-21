import { z } from "zod";
import { apiErrorResponseFrom, ApiError } from "../../../../../../lib/api/errors";
import { authenticateApiRequest } from "../../../../../../lib/api/authentication";
import { requireRole } from "../../../../../../lib/api/authorization";
import { apiSuccessResponse } from "../../../../../../lib/api/responses";
import { validateRouteParams } from "../../../../../../lib/api/validation";
import { prisma } from "../../../../../../lib/prisma";
import { generateRepaymentReceipt } from "../../../../../../lib/services/repayment/repayment-receipt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ repaymentId: z.uuid() }).strict();

export async function GET(
  request: Request,
  context: { params: Promise<{ repaymentId: string }> },
): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    requireRole(identity, "BORROWER");
    if (!identity.borrowerProfile) throw new ApiError("FORBIDDEN", "A borrower profile is required.", 403);
    const { repaymentId } = validateRouteParams(await context.params, paramsSchema);
    const repayment = await prisma.repayment.findFirst({
      where: {
        id: repaymentId,
        loan: { borrowerProfileId: identity.borrowerProfile.id },
      },
      select: { ledgerTransactionId: true },
    });
    if (!repayment) throw new ApiError("NOT_FOUND", "The requested repayment was not found.", 404);

    const receipt = await generateRepaymentReceipt(repayment.ledgerTransactionId);
    return apiSuccessResponse({
      ...receipt,
      totalReceivedSatang: receipt.totalReceivedSatang.toString(),
      receiptTimestamp: receipt.receiptTimestamp.toISOString(),
      repayments: receipt.repayments.map((item) => ({
        ...item,
        principalSatang: item.principalSatang.toString(),
        interestSatang: item.interestSatang.toString(),
        totalSatang: item.totalSatang.toString(),
        remainingBalanceSatang: item.remainingBalanceSatang.toString(),
      })),
    });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
