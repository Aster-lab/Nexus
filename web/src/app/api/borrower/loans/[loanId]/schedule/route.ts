import { z } from "zod";
import { apiErrorResponseFrom, ApiError } from "../../../../../../lib/api/errors";
import { authenticateApiRequest } from "../../../../../../lib/api/authentication";
import { requireRole } from "../../../../../../lib/api/authorization";
import { apiSuccessResponse } from "../../../../../../lib/api/responses";
import { validateRouteParams } from "../../../../../../lib/api/validation";
import { prisma } from "../../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ loanId: z.uuid() }).strict();

export async function GET(request: Request, context: { params: Promise<{ loanId: string }> }): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    requireRole(identity, "BORROWER");
    if (!identity.borrowerProfile) throw new ApiError("FORBIDDEN", "A borrower profile is required.", 403);
    const { loanId } = validateRouteParams(await context.params, paramsSchema);
    const schedule = await prisma.repaymentSchedule.findFirst({
      where: {
        loanId,
        loan: { borrowerProfileId: identity.borrowerProfile.id },
      },
      include: {
        currentVersion: {
          include: {
            installments: {
              orderBy: { installmentNumber: "asc" },
              include: { repayments: { where: { status: "POSTED" }, orderBy: { receivedAt: "desc" }, take: 1, select: { receivedAt: true } } },
            },
          },
        },
      },
    });
    if (!schedule?.currentVersion) throw new ApiError("NOT_FOUND", "The repayment schedule was not found.", 404);
    return apiSuccessResponse({
      scheduleId: schedule.id,
      versionId: schedule.currentVersion.id,
      installmentCount: schedule.currentVersion.installments.length,
      maturityDate: schedule.currentVersion.installments.at(-1)?.dueDate ?? null,
      installments: schedule.currentVersion.installments.map((installment) => ({
        id: installment.id,
        installmentNumber: installment.installmentNumber,
        dueDate: installment.dueDate,
        scheduledPaymentDate: installment.dueDate,
        openingPrincipalSatang: installment.openingPrincipalSatang.toString(),
        principalDueSatang: installment.principalDueSatang.toString(),
        interestDueSatang: installment.interestDueSatang.toString(),
        paidPrincipalSatang: installment.paidPrincipalSatang.toString(),
        paidInterestSatang: installment.paidInterestSatang.toString(),
        totalDueSatang: (installment.principalDueSatang + installment.interestDueSatang).toString(),
        paidAmountSatang: (installment.paidPrincipalSatang + installment.paidInterestSatang).toString(),
        remainingAmountSatang: (installment.principalDueSatang - installment.paidPrincipalSatang + installment.interestDueSatang - installment.paidInterestSatang).toString(),
        lastPaidAt: installment.repayments[0]?.receivedAt ?? null,
        status: installment.status,
      })),
    });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
