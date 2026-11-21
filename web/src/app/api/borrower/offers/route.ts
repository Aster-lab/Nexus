import { apiErrorResponseFrom, ApiError } from "../../../../lib/api/errors";
import { authenticateApiRequest } from "../../../../lib/api/authentication";
import { requireRole } from "../../../../lib/api/authorization";
import { apiPaginatedResponse } from "../../../../lib/api/responses";
import { parsePagination } from "../../../../lib/api/pagination";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    requireRole(identity, "BORROWER");
    if (!identity.borrowerProfile) throw new ApiError("FORBIDDEN", "A borrower profile is required.", 403);
    const pagination = parsePagination(new URL(request.url).searchParams, { sortFields: ["createdAt", "expiresAt"] });
    const where = {
      status: "ISSUED" as const,
      expiresAt: { gt: new Date() },
      application: {
        borrowerProfileId: identity.borrowerProfile.id,
        status: "APPROVED" as const,
      },
    };
    const orderBy = pagination.sortBy === "expiresAt"
      ? { expiresAt: pagination.sortOrder }
      : { createdAt: pagination.sortOrder };
    const [offers, total] = await Promise.all([
      prisma.loanOffer.findMany({
        where,
        orderBy,
        skip: pagination.offset,
        take: pagination.limit,
        select: {
          id: true,
          principalSatang: true,
          annualInterestRate: true,
          termMonths: true,
          repaymentFrequency: true,
          expiresAt: true,
          status: true,
        },
      }),
      prisma.loanOffer.count({ where }),
    ]);
    const data = offers.map((offer) => ({
      ...offer,
      principalSatang: offer.principalSatang.toString(),
      annualInterestRate: offer.annualInterestRate.toString(),
    }));
    return apiPaginatedResponse(data, pagination, total);
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
