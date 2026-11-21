import { z } from "zod";
import { ApiError, apiErrorResponseFrom } from "../../../../lib/api/errors";
import { parseJsonBody } from "../../../../lib/api/validation";
import { requireInvestor } from "../../../../lib/api/investor";
import { apiSuccessResponse } from "../../../../lib/api/responses";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const profileUpdate = z.object({ displayName: z.string().trim().min(1).max(100) }).strict();

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireInvestor(request);
    const profile = await prisma.investorProfile.findUniqueOrThrow({ where: { id: identity.investorProfile.id }, select: { id: true, displayName: true, investorStatus: true, createdAt: true, updatedAt: true } });
    return apiSuccessResponse(profile);
  } catch (error) { return apiErrorResponseFrom(error); }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const identity = await requireInvestor(request);
    const body = await parseJsonBody(request, profileUpdate);
    const result = await prisma.investorProfile.updateMany({ where: { id: identity.investorProfile.id, userId: identity.userId, investorStatus: "ACTIVE" }, data: body });
    if (result.count !== 1) throw new ApiError("FORBIDDEN", "An active investor profile is required.", 403);
    const profile = await prisma.investorProfile.findUniqueOrThrow({ where: { id: identity.investorProfile.id }, select: { id: true, displayName: true, investorStatus: true, updatedAt: true } });
    return apiSuccessResponse(profile);
  } catch (error) { return apiErrorResponseFrom(error); }
}
