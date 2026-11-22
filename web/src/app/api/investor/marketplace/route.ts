import { apiErrorResponseFrom } from "../../../../lib/api/errors";
import { requireInvestor } from "../../../../lib/api/investor";
import { parsePagination } from "../../../../lib/api/pagination";
import { apiPaginatedResponse } from "../../../../lib/api/responses";
import { toInvestorBorrowerOverview } from "../../../../lib/api/investor-borrower-overview";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireInvestor(request);
    const pagination = parsePagination(new URL(request.url).searchParams, { sortFields: ["createdAt", "fundingDeadline"] });
    const now = new Date();
    const where = { status: "FUNDING" as const, fundingDeadline: { gt: now }, escrowAccount: { is: { status: "OPEN" as const } } };
    const [loans, total] = await Promise.all([
      prisma.loan.findMany({ where, orderBy: pagination.sortBy === "fundingDeadline" ? { fundingDeadline: pagination.sortOrder } : { createdAt: pagination.sortOrder }, skip: pagination.offset, take: pagination.limit, select: { id: true, status: true, principalSatang: true, fundedSatang: true, annualInterestRate: true, termMonths: true, fundingDeadline: true, createdAt: true, application: { select: { currentVersion: { select: { submittedData: true } } } } } }),
      prisma.loan.count({ where }),
    ]);
    const eligible = loans.filter((loan) => loan.fundedSatang < loan.principalSatang);
    return apiPaginatedResponse(eligible.map((loan) => {
      const { application, ...publicLoan } = loan;
      return { ...publicLoan, borrowerOverview: toInvestorBorrowerOverview(application.currentVersion?.submittedData), principalSatang: loan.principalSatang.toString(), fundedSatang: loan.fundedSatang.toString(), remainingFundingSatang: (loan.principalSatang - loan.fundedSatang).toString(), annualInterestRate: loan.annualInterestRate.toString() };
    }), pagination, total);
  } catch (error) { return apiErrorResponseFrom(error); }
}
