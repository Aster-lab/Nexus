import { z } from "zod";
import { apiErrorResponseFrom, ApiError } from "../../../../lib/api/errors";
import { authenticateApiRequest } from "../../../../lib/api/authentication";
import { apiSuccessResponse } from "../../../../lib/api/responses";
import { parseJsonBody } from "../../../../lib/api/validation";
import { prisma } from "../../../../lib/prisma";
import { BorrowerProfileAddressSchema } from "../../../../lib/contracts/application";
import type { Prisma } from "../../../../generated/prisma/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const profilePatchSchema = z.object({
  legalName: z.string().trim().min(2).max(150).optional(),
  phone: z.string().trim().min(1).max(30).nullable().optional(),
  displayName: z.string().trim().min(1).max(100).optional(),
  address: BorrowerProfileAddressSchema.optional(),
}).strict().refine((value) => Object.values(value).some((item) => item !== undefined));

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    const [borrowerProfile, investorProfile] = await Promise.all([
      prisma.borrowerProfile.findUnique({ where: { userId: identity.userId }, select: { id: true, legalName: true, phone: true, address: true } }),
      prisma.investorProfile.findUnique({ where: { userId: identity.userId }, select: { id: true, displayName: true } }),
    ]);
    return apiSuccessResponse({
      id: identity.userId,
      userId: identity.userId,
      email: identity.email,
      roles: identity.roles,
      borrowerProfile,
      investorProfile,
    });
  } catch (error) {
    if (!(error instanceof ApiError) || error.status >= 500) {
      const code = typeof error === "object" && error !== null && "code" in error && typeof error.code === "string"
        ? error.code
        : undefined;
      console.error("GET /api/users/me failed", {
        name: error instanceof Error ? error.name : "UnknownError",
        ...(code ? { code } : {}),
      });
    }
    return apiErrorResponseFrom(error);
  }
}

export async function PATCH(request: Request): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    const patch = await parseJsonBody(request, profilePatchSchema);

    if ((patch.phone !== undefined || patch.legalName !== undefined || patch.address !== undefined) &&
      (!identity.roles.includes("BORROWER") || !identity.borrowerProfile)) {
      throw new ApiError("FORBIDDEN", "An active borrower workspace is required to update borrower details.", 403);
    }
    if (patch.displayName !== undefined &&
      (!identity.roles.includes("INVESTOR") || !identity.investorProfile)) {
      throw new ApiError("FORBIDDEN", "Investor profile access is required to update a display name.", 403);
    }

    const updated = await prisma.$transaction(async (tx) => {
      let borrower: { legalName: string; phone: string | null; address: unknown } | undefined;
      let displayName: string | undefined;
      if (patch.phone !== undefined || patch.legalName !== undefined || patch.address !== undefined) {
        const profile = await tx.borrowerProfile.update({
          where: { userId: identity.userId },
          data: {
            ...(patch.phone !== undefined ? { phone: patch.phone } : {}),
            ...(patch.legalName !== undefined ? { legalName: patch.legalName } : {}),
            ...(patch.address !== undefined ? { address: patch.address as Prisma.InputJsonValue } : {}),
          },
          select: { legalName: true, phone: true, address: true },
        });
        borrower = profile;
      }
      if (patch.displayName !== undefined) {
        const profile = await tx.investorProfile.update({
          where: { userId: identity.userId },
          data: { displayName: patch.displayName },
          select: { displayName: true },
        });
        displayName = profile.displayName;
      }
      return { borrower, displayName };
    });

    return apiSuccessResponse({
      userId: identity.userId,
      ...(updated.borrower !== undefined ? { borrowerProfile: updated.borrower } : {}),
      ...(updated.displayName !== undefined ? { displayName: updated.displayName } : {}),
    }, { message: "Profile updated successfully." });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
