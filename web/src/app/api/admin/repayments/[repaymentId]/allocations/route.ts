import { z } from "zod";
import { requireAdministrator } from "../../../../../../lib/api/administrator";
import { apiErrorResponseFrom } from "../../../../../../lib/api/errors";
import { parsePagination } from "../../../../../../lib/api/pagination";
import { apiPaginatedResponse } from "../../../../../../lib/api/responses";
import { validateRouteParams } from "../../../../../../lib/api/validation";
import { prisma } from "../../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ repaymentId: string }> }): Promise<Response> {
  try {
    await requireAdministrator(request);
    const { repaymentId } = validateRouteParams(await context.params, z.object({ repaymentId: z.string().uuid() }).strict());
    const pagination = parsePagination(new URL(request.url).searchParams, { sortFields: ["createdAt"] });
    const [rows, total] = await Promise.all([
      prisma.payoutAllocation.findMany({
        where: { repaymentId },
        orderBy: { createdAt: pagination.sortOrder },
        skip: pagination.offset,
        take: pagination.limit,
        select: {
          id: true,
          repaymentId: true,
          investmentId: true,
          principalSatang: true,
          interestSatang: true,
          recoverySatang: true,
          allocationMethod: true,
          createdAt: true,
        },
      }),
      prisma.payoutAllocation.count({ where: { repaymentId } }),
    ]);
    return apiPaginatedResponse(rows.map((row) => ({
      ...row,
      principalSatang: row.principalSatang.toString(),
      interestSatang: row.interestSatang.toString(),
      recoverySatang: row.recoverySatang.toString(),
    })), pagination, total);
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
