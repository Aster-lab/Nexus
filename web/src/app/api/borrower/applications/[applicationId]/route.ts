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
  createdAt: Date;
  updatedAt: Date;
  submittedAt: Date | null;
  closedAt: Date | null;
  financialReviews: Array<{ id: string; decision: string; reason: string; createdAt: Date }>;
  informationRequests: Array<{ id: string; requestDetails: unknown; status: string; createdAt: Date }>;
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
    permissions: { canEdit: application.status === "DRAFT", canSubmit: application.status === "DRAFT" && application.currentVersion !== null },
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
        createdAt: true,
        updatedAt: true,
        submittedAt: true,
        closedAt: true,
        financialReviews: { select: { id: true, decision: true, reason: true, createdAt: true }, orderBy: { createdAt: "desc" } },
        informationRequests: { select: { id: true, requestDetails: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" } },
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
