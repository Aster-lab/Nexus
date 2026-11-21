import { ApplicationSnapshotSchema } from "../../../../../lib/contracts/application";
import { apiErrorResponseFrom, ApiError } from "../../../../../lib/api/errors";
import { authenticateApiRequest } from "../../../../../lib/api/authentication";
import { requireRole } from "../../../../../lib/api/authorization";
import { apiSuccessResponse } from "../../../../../lib/api/responses";
import { parseJsonBody, validateRouteParams } from "../../../../../lib/api/validation";
import { prisma } from "../../../../../lib/prisma";
import { updateBorrowerDraftApplication } from "../../../../../lib/services/borrower-application.service";
import { z } from "zod";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const paramsSchema = z.object({ applicationId: z.uuid() }).strict();

function serialize(application: {
  id: string;
  borrowerProfileId: string;
  status: string;
  submittedAt: Date | null;
  currentVersion: {
    id: string;
    versionNumber: number;
    requestedPrincipalSatang: bigint;
    requestedTermMonths: number;
    submittedData: unknown;
  } | null;
}) {
  return {
    ...application,
    currentVersion: application.currentVersion ? {
      ...application.currentVersion,
      requestedPrincipalSatang: application.currentVersion.requestedPrincipalSatang.toString(),
    } : null,
  };
}

export async function GET(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    requireRole(identity, "BORROWER");
    if (!identity.borrowerProfile) throw new ApiError("FORBIDDEN", "A borrower profile is required.", 403);
    const { applicationId } = validateRouteParams(await context.params, paramsSchema);
    const application = await prisma.loanApplication.findFirst({
      where: { id: applicationId, borrowerProfileId: identity.borrowerProfile.id },
      select: {
        id: true,
        borrowerProfileId: true,
        status: true,
        submittedAt: true,
        currentVersion: {
          select: {
            id: true,
            versionNumber: true,
            requestedPrincipalSatang: true,
            requestedTermMonths: true,
            submittedData: true,
          },
        },
      },
    });
    if (!application) throw new ApiError("NOT_FOUND", "The requested application was not found.", 404);
    return apiSuccessResponse(serialize(application));
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    requireRole(identity, "BORROWER");
    if (!identity.borrowerProfile) throw new ApiError("FORBIDDEN", "A borrower profile is required.", 403);
    const { applicationId } = validateRouteParams(await context.params, paramsSchema);
    const snapshot = await parseJsonBody(request, ApplicationSnapshotSchema);
    const application = await updateBorrowerDraftApplication({
      actorUserId: identity.userId,
      borrowerProfileId: identity.borrowerProfile.id,
      applicationId,
      snapshot,
    });
    return apiSuccessResponse(application, { message: "Application draft updated." });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
