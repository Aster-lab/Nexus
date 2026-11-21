import { Prisma } from "../../../../generated/prisma/client";
import { ApiError, apiErrorResponseFrom } from "../../../../lib/api/errors";
import { requireInvestor } from "../../../../lib/api/investor";
import { apiSuccessResponse } from "../../../../lib/api/responses";
import { parseJsonBody } from "../../../../lib/api/validation";
import { InvestorPreferenceContractSchema } from "../../../../lib/contracts/risk";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await requireInvestor(request);
    const row = await prisma.investorPreference.findUnique({ where: { investorProfileId: identity.investorProfile.id }, select: { preferenceData: true, updatedAt: true } });
    if (!row) return apiSuccessResponse({ preferences: null, updatedAt: null });
    const parsed = InvestorPreferenceContractSchema.safeParse(row.preferenceData);
    if (!parsed.success) throw new ApiError("INVESTOR_PREFERENCES_INVALID", "Saved recommendation preferences are invalid and need to be updated.", 409);
    return apiSuccessResponse({ preferences: parsed.data, updatedAt: row.updatedAt });
  } catch (error) { return apiErrorResponseFrom(error); }
}

export async function PUT(request: Request): Promise<Response> {
  try {
    const identity = await requireInvestor(request);
    const preferences = await parseJsonBody(request, InvestorPreferenceContractSchema);
    const row = await prisma.investorPreference.upsert({
      where: { investorProfileId: identity.investorProfile.id },
      create: { investorProfileId: identity.investorProfile.id, preferenceData: preferences as unknown as Prisma.InputJsonValue },
      update: { preferenceData: preferences as unknown as Prisma.InputJsonValue },
      select: { preferenceData: true, updatedAt: true },
    });
    return apiSuccessResponse({ preferences, updatedAt: row.updatedAt }, { message: "Investor recommendation preferences saved." });
  } catch (error) { return apiErrorResponseFrom(error); }
}
