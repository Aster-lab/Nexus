import { Prisma } from "../../../../../../generated/prisma/client";
import { ApiError, apiErrorResponseFrom } from "../../../../../../lib/api/errors";
import { authenticateApiRequest } from "../../../../../../lib/api/authentication";
import { requireRole } from "../../../../../../lib/api/authorization";
import { apiSuccessResponse } from "../../../../../../lib/api/responses";
import { parseJsonBody } from "../../../../../../lib/api/validation";
import { BorrowerFinancialInformationSchema } from "../../../../../../lib/contracts/borrower-financial";
import { prisma } from "../../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  context: { params: Promise<{ applicationId: string }> },
): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    requireRole(identity, "BORROWER");
    if (!identity.borrowerProfile) throw new ApiError("FORBIDDEN", "A borrower profile is required.", 403);
    const { applicationId } = await context.params;
    const financialInformation = await parseJsonBody(request, BorrowerFinancialInformationSchema);

    const record = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM loan_applications WHERE id = ${applicationId}::uuid FOR UPDATE
      `;
      const application = await tx.loanApplication.findUnique({
        where: { id: applicationId },
        select: { borrowerProfileId: true, status: true, currentVersionId: true },
      });
      if (!application || application.borrowerProfileId !== identity.borrowerProfile!.id) {
        throw new ApiError("NOT_FOUND", "Application not found.", 404);
      }
      if (application.status !== "DRAFT" || !application.currentVersionId) {
        throw new ApiError("APPLICATION_NOT_EDITABLE", "Financial information can only be added to a draft application.", 409);
      }

      return tx.borrowerFinancialInformation.create({
        data: {
          applicationVersionId: application.currentVersionId,
          incomeData: financialInformation.income_data as unknown as Prisma.InputJsonValue,
          expenseData: financialInformation.expense_data as unknown as Prisma.InputJsonValue,
          debtData: financialInformation.debt_data as unknown as Prisma.InputJsonValue,
          creditData: financialInformation.credit_data as unknown as Prisma.InputJsonValue,
          sourceMetadata: financialInformation.source_metadata as unknown as Prisma.InputJsonValue,
        },
        select: { id: true, applicationVersionId: true, createdAt: true },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return apiSuccessResponse({
      id: record.id,
      applicationVersionId: record.applicationVersionId,
      createdAt: record.createdAt,
    }, { status: 201, message: "Borrower financial information saved." });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
