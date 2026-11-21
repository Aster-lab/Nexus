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
    const pagination = parsePagination(new URL(request.url).searchParams, { sortFields: ["createdAt"] });
    const where = { borrowerProfileId: identity.borrowerProfile.id };
    const [loans, total] = await Promise.all([
      prisma.loan.findMany({
        where,
        orderBy: { createdAt: pagination.sortOrder },
        skip: pagination.offset,
        take: pagination.limit,
        select: {
          id: true,
          status: true,
          principalSatang: true,
          fundedSatang: true,
          annualInterestRate: true,
          termMonths: true,
          fundingDeadline: true,
          fundedAt: true,
          disbursedAt: true,
          createdAt: true,
        },
      }),
      prisma.loan.count({ where }),
    ]);
    const data = loans.map((loan) => ({
      ...loan,
      principalSatang: loan.principalSatang.toString(),
      fundedSatang: loan.fundedSatang.toString(),
      annualInterestRate: loan.annualInterestRate.toString(),
    }));
    return apiPaginatedResponse(data, pagination, total);
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
