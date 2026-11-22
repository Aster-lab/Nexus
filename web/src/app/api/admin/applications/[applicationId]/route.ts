import { z } from "zod";
import { ApiError, apiErrorResponseFrom } from "../../../../../lib/api/errors";
import { requireAdministrator } from "../../../../../lib/api/administrator";
import { apiSuccessResponse } from "../../../../../lib/api/responses";
import { validateRouteParams } from "../../../../../lib/api/validation";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ applicationId: string }> }): Promise<Response> {
  try {
    await requireAdministrator(request);
    const { applicationId } = validateRouteParams(await context.params, z.object({ applicationId: z.uuid() }).strict());
    const row = await prisma.loanApplication.findUnique({ where: { id: applicationId }, select: { id: true, status: true, borrowerProfileId: true, createdAt: true, updatedAt: true, submittedAt: true, closedAt: true, borrowerProfile: { select: { id: true, legalName: true, phone: true, user: { select: { id: true, email: true, accountStatus: true } } } }, currentVersion: { select: { id: true, versionNumber: true, submittedData: true, requestedPrincipalSatang: true, requestedTermMonths: true, submittedAt: true } }, financialReviews: { orderBy: { createdAt: "desc" }, select: { id: true, decision: true, reason: true, notes: true, reviewerUserId: true, createdAt: true } }, informationRequests: { orderBy: { createdAt: "desc" }, select: { id: true, status: true, requestDetails: true, dueAt: true, createdAt: true } }, loanOffers: { orderBy: { createdAt: "desc" }, select: { id: true, status: true, principalSatang: true, annualInterestRate: true, termMonths: true, expiresAt: true, createdAt: true, loan: { select: { id: true, status: true } } } } } });
    if (!row) throw new ApiError("NOT_FOUND", "Application not found.", 404);
    return apiSuccessResponse({ ...row, currentVersion: row.currentVersion ? { ...row.currentVersion, requestedPrincipalSatang: row.currentVersion.requestedPrincipalSatang.toString() } : null, loanOffers: row.loanOffers.map((offer) => ({ ...offer, principalSatang: offer.principalSatang.toString(), annualInterestRate: offer.annualInterestRate.toString() })) });
  } catch (error) { return apiErrorResponseFrom(error); }
}
