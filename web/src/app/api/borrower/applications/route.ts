import { ApplicationSnapshotSchema } from "../../../../lib/contracts/application";
import { apiErrorResponseFrom, ApiError } from "../../../../lib/api/errors";
import { authenticateApiRequest } from "../../../../lib/api/authentication";
import { requireRole } from "../../../../lib/api/authorization";
import { apiPaginatedResponse, apiSuccessResponse } from "../../../../lib/api/responses";
import { parsePagination, type PaginationResult } from "../../../../lib/api/pagination";
import { parseJsonBody } from "../../../../lib/api/validation";
import { prisma } from "../../../../lib/prisma";
import { createBorrowerApplication } from "../../../../lib/services/borrower-application.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function borrowerProfileId(identity: Awaited<ReturnType<typeof authenticateApiRequest>>): string {
  requireRole(identity, "BORROWER");
  if (!identity.borrowerProfile) {
    throw new ApiError("FORBIDDEN", "A borrower profile is required.", 403);
  }
  return identity.borrowerProfile.id;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    const profileId = borrowerProfileId(identity);
    const pagination: PaginationResult = parsePagination(
      new URL(request.url).searchParams,
      { sortFields: ["createdAt"] },
    );
    const where = { borrowerProfileId: profileId };
    const [items, total] = await Promise.all([
      prisma.loanApplication.findMany({
        where,
        orderBy: { createdAt: pagination.sortOrder },
        skip: pagination.offset,
        take: pagination.limit,
        select: {
          id: true,
          status: true,
          createdAt: true,
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
      }),
      prisma.loanApplication.count({ where }),
    ]);
    const data = items.map((application) => ({
      ...application,
      currentVersion: application.currentVersion ? {
        ...application.currentVersion,
        requestedPrincipalSatang: application.currentVersion.requestedPrincipalSatang.toString(),
      } : null,
    }));
    return apiPaginatedResponse(data, pagination, total);
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    const profileId = borrowerProfileId(identity);
    const snapshot = await parseJsonBody(request, ApplicationSnapshotSchema);
    const application = await createBorrowerApplication({
      actorUserId: identity.userId,
      borrowerProfileId: profileId,
      snapshot,
    });
    return apiSuccessResponse(application, { status: 201, message: "Application draft created." });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
