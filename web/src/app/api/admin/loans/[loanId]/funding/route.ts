import { z } from "zod";
import { ApiError, apiErrorResponseFrom } from "../../../../../../lib/api/errors";
import { requireAdministrator } from "../../../../../../lib/api/administrator";
import { apiSuccessResponse } from "../../../../../../lib/api/responses";
import { validateRouteParams } from "../../../../../../lib/api/validation";
import { prisma } from "../../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ loanId: string }> }): Promise<Response> {
  try {
    await requireAdministrator(request);
    const { loanId } = validateRouteParams(await context.params, z.object({ loanId: z.uuid() }).strict());
    const loan = await prisma.loan.findUnique({ where: { id: loanId }, select: { id: true, status: true, principalSatang: true, fundedSatang: true, fundingDeadline: true, fundedAt: true, escrowAccount: { select: { id: true, status: true, heldSatang: true, platformWalletId: true, transactions: { orderBy: { createdAt: "asc" }, select: { id: true, type: true, amountSatang: true, ledgerTransactionId: true, createdAt: true } } } } } });
    if (!loan) throw new ApiError("NOT_FOUND", "Loan not found.", 404);
    const { escrowAccount, ...loanDetails } = loan;
    return apiSuccessResponse({ ...loanDetails, loanId: loan.id, principalSatang: loan.principalSatang.toString(), fundedSatang: loan.fundedSatang.toString(), remainingFundingSatang: (loan.principalSatang - loan.fundedSatang).toString(), escrow: escrowAccount ? { ...escrowAccount, heldSatang: escrowAccount.heldSatang.toString(), transactions: escrowAccount.transactions.map((row) => ({ ...row, amountSatang: row.amountSatang.toString() })) } : null });
  } catch (error) { return apiErrorResponseFrom(error); }
}
