import { z } from "zod";
import { ApiError, apiErrorResponseFrom } from "../../../../../lib/api/errors";
import { requireAdministrator } from "../../../../../lib/api/administrator";
import { apiSuccessResponse } from "../../../../../lib/api/responses";
import { parseJsonBody, validateRouteParams } from "../../../../../lib/api/validation";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const paramsSchema = z.object({ userId: z.uuid() }).strict();
const bodySchema = z.object({ accountStatus: z.enum(["ACTIVE", "RESTRICTED", "DEACTIVATION_PENDING", "DEACTIVATED"]) }).strict();

export async function PATCH(request: Request, context: { params: Promise<{ userId: string }> }): Promise<Response> {
  try {
    const identity = await requireAdministrator(request);
    const { userId } = validateRouteParams(await context.params, paramsSchema);
    const input = await parseJsonBody(request, bodySchema);
    if (userId === identity.userId && input.accountStatus !== "ACTIVE") throw new ApiError("SELF_RESTRICTION_REJECTED", "An administrator cannot restrict their own account.", 409);
    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true, email: true, accountStatus: true } });
      if (!user) throw new ApiError("NOT_FOUND", "User not found.", 404);
      const now = new Date();
      const result = await tx.user.update({ where: { id: userId }, data: { accountStatus: input.accountStatus, ...(input.accountStatus === "DEACTIVATED" ? { deactivatedAt: now } : input.accountStatus === "ACTIVE" ? { deactivatedAt: null } : {}) }, select: { id: true, email: true, accountStatus: true, deactivatedAt: true, updatedAt: true } });
      await tx.auditLog.create({ data: { actorUserId: identity.userId, action: "ADMIN_USER_STATUS_UPDATED", targetType: "USER", targetId: userId, reason: "Administrator account status change", oldValues: { accountStatus: user.accountStatus }, newValues: { accountStatus: result.accountStatus }, outcome: "SUCCESS" } });
      return result;
    });
    return apiSuccessResponse(updated, { message: "User account status updated." });
  } catch (error) { return apiErrorResponseFrom(error); }
}
