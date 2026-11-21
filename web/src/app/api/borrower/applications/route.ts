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

const applicationStatuses = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "INFORMATION_REQUESTED",
  "APPROVED",
  "REJECTED",
  "WITHDRAWN",
  "CLOSED",
] as const;

function borrowerProfileId(identity: Awaited<ReturnType<typeof authenticateApiRequest>>): string {
  requireRole(identity, "BORROWER");
  if (!identity.borrowerProfile) {
    throw new ApiError("FORBIDDEN", "A borrower profile is required.", 403);
  }
  return identity.borrowerProfile.id;
}

function applicationPurpose(snapshot: unknown): string | null {
  if (typeof snapshot !== "object" || snapshot === null || Array.isArray(snapshot)) return null;
  const requestedLoan = (snapshot as { requested_loan?: unknown }).requested_loan;
  if (typeof requestedLoan !== "object" || requestedLoan === null || Array.isArray(requestedLoan)) return null;
  const purpose = (requestedLoan as { purpose?: unknown }).purpose;
  return typeof purpose === "string" && purpose.trim() ? purpose : null;
}

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    const profileId = borrowerProfileId(identity);
    const searchParams = new URL(request.url).searchParams;
    const pagination: PaginationResult = parsePagination(searchParams, {
      sortFields: ["createdAt"],
      filterFields: ["status"],
    });
    const requestedStatus = searchParams.get("status");
    if (requestedStatus !== null && !applicationStatuses.includes(requestedStatus as typeof applicationStatuses[number])) {
      throw new ApiError("VALIDATION_ERROR", "Unsupported application status filter.", 400);
    }
    const where = {
      borrowerProfileId: profileId,
      ...(requestedStatus ? { status: requestedStatus as typeof applicationStatuses[number] } : {}),
    };
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
          updatedAt: true,
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
    const data = items.map((application) => {
      const currentVersion = application.currentVersion;
      return {
        id: application.id,
        status: application.status,
        createdAt: application.createdAt,
        updatedAt: application.updatedAt,
        submittedAt: application.submittedAt,
        currentVersion: currentVersion ? {
          id: currentVersion.id,
          versionNumber: currentVersion.versionNumber,
          requestedPrincipalSatang: currentVersion.requestedPrincipalSatang.toString(),
          requestedTermMonths: currentVersion.requestedTermMonths,
          purpose: applicationPurpose(currentVersion.submittedData),
        } : null,
      };
    });
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
