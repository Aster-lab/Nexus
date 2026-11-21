import { z } from "zod";
import { ApiError, apiErrorResponseFrom } from "../../../../../lib/api/errors";
import { requireAdministrator } from "../../../../../lib/api/administrator";
import { apiSuccessResponse } from "../../../../../lib/api/responses";
import { validateRouteParams } from "../../../../../lib/api/validation";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ loanId: string }> }): Promise<Response> {
  try {
    await requireAdministrator(request);
    const { loanId } = validateRouteParams(await context.params, z.object({ loanId: z.uuid() }).strict());
    const row = await prisma.loan.findUnique({ where: { id: loanId }, select: { id: true, status: true, principalSatang: true, fundedSatang: true, annualInterestRate: true, termMonths: true, fundingDeadline: true, fundedAt: true, disbursedAt: true, createdAt: true, borrowerProfile: { select: { id: true, legalName: true, phone: true, user: { select: { id: true, email: true, accountStatus: true } } } }, escrowAccount: { select: { id: true, status: true, heldSatang: true, platformWalletId: true } }, statusHistory: { orderBy: { createdAt: "desc" }, select: { previousStatus: true, newStatus: true, reason: true, changedByUserId: true, createdAt: true } } } });
    if (!row) throw new ApiError("NOT_FOUND", "Loan not found.", 404);
    return apiSuccessResponse({ ...row, principalSatang: row.principalSatang.toString(), fundedSatang: row.fundedSatang.toString(), annualInterestRate: row.annualInterestRate.toString(), escrowAccount: row.escrowAccount ? { ...row.escrowAccount, heldSatang: row.escrowAccount.heldSatang.toString() } : null });
  } catch (error) { return apiErrorResponseFrom(error); }
}
