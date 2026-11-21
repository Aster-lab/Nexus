import { z } from "zod";
import { ApiError, apiErrorResponseFrom } from "../../../../../../lib/api/errors";
import { requireAdministrator } from "../../../../../../lib/api/administrator";
import { apiSuccessResponse } from "../../../../../../lib/api/responses";
import { validateRouteParams, parseJsonBody } from "../../../../../../lib/api/validation";
import { prisma } from "../../../../../../lib/prisma";
import { requestLoanDisbursement, approveLoanDisbursement } from "../../../../../../lib/services/loan-disbursement-approval.service";
import { postLoanDisbursement } from "../../../../../../lib/services/loan-disbursement.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const paramsSchema = z.object({ loanId: z.uuid() }).strict();
const bodySchema = z.object({ reason: z.string().trim().min(1).max(1000) }).strict();

export async function POST(request: Request, context: { params: Promise<{ loanId: string }> }): Promise<Response> {
  try {
    const identity = await requireAdministrator(request);
    const { loanId } = validateRouteParams(await context.params, paramsSchema);
    const body = await parseJsonBody(request, bodySchema);
    const idempotencyKey = request.headers.get("idempotency-key")?.trim();
    if (!idempotencyKey || idempotencyKey.length > 255) throw new ApiError("VALIDATION_ERROR", "A valid Idempotency-Key header is required.", 400);
    const existing = await prisma.ledgerTransaction.findUnique({ where: { idempotencyKey }, select: { id: true, transactionType: true, status: true, referenceId: true, postedAt: true } });
    if (existing) {
      if (existing.transactionType !== "LOAN_DISBURSEMENT" || existing.referenceId !== loanId || existing.status !== "POSTED") {
        throw new ApiError("IDEMPOTENCY_KEY_CONFLICT", "The idempotency key was already used for another request.", 409);
      }
      return apiSuccessResponse({ loanId, ledgerTransactionId: existing.id, status: existing.status, postedAt: existing.postedAt }, { message: "Existing disbursement returned." });
    }
    const disbursementRequest = await requestLoanDisbursement({ loanId, requesterUserId: identity.userId, reason: body.reason });
    const approval = await approveLoanDisbursement({ requestAuditLogId: disbursementRequest.id, approverUserId: identity.userId, reason: body.reason });
    const posted = await postLoanDisbursement({ loanId, approvalAuditLogId: approval.id, idempotencyKey });
    return apiSuccessResponse({ loanId, ledgerTransactionId: posted.id, status: posted.status, postedAt: posted.postedAt }, { status: 201, message: "Loan disbursement posted successfully." });
  } catch (error) { return apiErrorResponseFrom(error); }
}
