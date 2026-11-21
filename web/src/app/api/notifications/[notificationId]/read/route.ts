import { z } from "zod";
import { ApiError, apiErrorResponseFrom } from "../../../../../lib/api/errors";
import { authenticateApiRequest } from "../../../../../lib/api/authentication";
import { apiSuccessResponse } from "../../../../../lib/api/responses";
import { validateRouteParams } from "../../../../../lib/api/validation";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ notificationId: z.uuid() }).strict();

export async function PATCH(request: Request, context: { params: Promise<{ notificationId: string }> }): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    const { notificationId } = validateRouteParams(await context.params, paramsSchema);
    const changed = await prisma.notification.updateMany({
      where: { id: notificationId, userId: identity.userId, status: "UNREAD" },
      data: { status: "READ" },
    });
    const notification = await prisma.notification.findFirst({
      where: { id: notificationId, userId: identity.userId },
      select: { id: true, status: true, createdAt: true },
    });
    if (!notification) throw new ApiError("NOT_FOUND", "Notification not found.", 404);
    return apiSuccessResponse(notification, { message: changed.count ? "Notification marked as read." : "Notification is already read." });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
