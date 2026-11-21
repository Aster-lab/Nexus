import { ApiError } from "./errors";
import { authenticateApiRequest, type ApiIdentity } from "./authentication";
import { requireRole } from "./authorization";
import { prisma } from "../prisma";

export async function requireInvestor(request: Request): Promise<ApiIdentity & { investorProfile: NonNullable<ApiIdentity["investorProfile"]> }> {
  const identity = await authenticateApiRequest(request);
  requireRole(identity, "INVESTOR");
  if (!identity.investorProfile) throw new ApiError("FORBIDDEN", "An investor profile is required.", 403);
  const profile = await prisma.investorProfile.findUnique({ where: { id: identity.investorProfile.id }, select: { investorStatus: true } });
  if (!profile || profile.investorStatus !== "ACTIVE") throw new ApiError("FORBIDDEN", "An active investor profile is required.", 403);
  return identity as ApiIdentity & { investorProfile: NonNullable<ApiIdentity["investorProfile"]> };
}
