import { requireAdministrator } from "../../../../lib/api/administrator";
import { apiErrorResponseFrom } from "../../../../lib/api/errors";
import { apiSuccessResponse } from "../../../../lib/api/responses";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdministrator(request);
    const policies = await prisma.platformPolicy.findMany({
      orderBy: { policyCode: "asc" },
      select: {
        id: true,
        policyCode: true,
        name: true,
        description: true,
        versions: {
          orderBy: { versionNumber: "desc" },
          select: {
            id: true,
            versionNumber: true,
            policyValues: true,
            status: true,
            approvedByUserId: true,
            effectiveAt: true,
            createdAt: true,
          },
        },
      },
    });
    return apiSuccessResponse(policies);
  } catch (error) { return apiErrorResponseFrom(error); }
}
