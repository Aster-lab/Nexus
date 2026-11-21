import { z } from "zod";
import { apiErrorResponseFrom, ApiError } from "../../../../lib/api/errors";
import { authenticateApiRequest } from "../../../../lib/api/authentication";
import { apiSuccessResponse } from "../../../../lib/api/responses";
import { parseJsonBody } from "../../../../lib/api/validation";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const profilePatchSchema = z.object({
  phone: z.string().trim().min(1).max(30).nullable().optional(),
  displayName: z.string().trim().min(1).max(100).optional(),
}).strict().refine((value) => value.phone !== undefined || value.displayName !== undefined);

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    return apiSuccessResponse({
      userId: identity.userId,
      email: identity.email,
      roles: identity.roles,
      borrowerProfile: identity.borrowerProfile,
      investorProfile: identity.investorProfile,
    });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    const patch = await parseJsonBody(request, profilePatchSchema);

    if (patch.phone !== undefined &&
      (!identity.roles.includes("BORROWER") || !identity.borrowerProfile)) {
      throw new ApiError("FORBIDDEN", "Borrower profile access is required to update a phone number.", 403);
    }
    if (patch.displayName !== undefined &&
      (!identity.roles.includes("INVESTOR") || !identity.investorProfile)) {
      throw new ApiError("FORBIDDEN", "Investor profile access is required to update a display name.", 403);
    }

    const updated = await prisma.$transaction(async (tx) => {
      let phone: string | null | undefined;
      let displayName: string | undefined;
      if (patch.phone !== undefined) {
        const profile = await tx.borrowerProfile.update({
          where: { userId: identity.userId },
          data: { phone: patch.phone },
          select: { phone: true },
        });
        phone = profile.phone;
      }
      if (patch.displayName !== undefined) {
        const profile = await tx.investorProfile.update({
          where: { userId: identity.userId },
          data: { displayName: patch.displayName },
          select: { displayName: true },
        });
        displayName = profile.displayName;
      }
      return { phone, displayName };
    });

    return apiSuccessResponse({
      userId: identity.userId,
      ...(updated.phone !== undefined ? { phone: updated.phone } : {}),
      ...(updated.displayName !== undefined ? { displayName: updated.displayName } : {}),
    }, { message: "Profile updated successfully." });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
