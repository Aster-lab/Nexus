import { requireAdministrator } from "../../../../../lib/api/administrator";
import { apiErrorResponseFrom } from "../../../../../lib/api/errors";
import { apiSuccessResponse } from "../../../../../lib/api/responses";
import { prisma } from "../../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function section<T>(load: () => Promise<T>) {
  try { return { status: "success" as const, data: await load() }; }
  catch { return { status: "error" as const, message: "We could not load this section. Check its dedicated page and retry." }; }
}

export async function GET(request: Request): Promise<Response> {
  const startedAt = performance.now();
  let authDuration = 0;
  const withTimings = (response: Response) => {
    const total = performance.now() - startedAt;
    response.headers.set("Server-Timing", `auth;dur=${authDuration.toFixed(1)}, data;dur=${Math.max(0, total - authDuration).toFixed(1)}, app;dur=${total.toFixed(1)}`);
    return response;
  };
  try {
    await requireAdministrator(request);
    authDuration = performance.now() - startedAt;
    const [users, applications, loans, payouts, repayments, audit] = await Promise.all([
      section(async () => {
        const [total, borrowers, investors] = await Promise.all([
          prisma.user.count(),
          prisma.user.count({ where: { roles: { some: { revokedAt: null, role: { code: "BORROWER" } } } } }),
          prisma.user.count({ where: { roles: { some: { revokedAt: null, role: { code: "INVESTOR" } } } } }),
        ]);
        return { total, borrowers, investors };
      }),
      section(async () => {
        const counts = await prisma.loanApplication.groupBy({
          by: ["status"],
          where: { status: { in: ["SUBMITTED", "UNDER_REVIEW", "INFORMATION_REQUESTED"] } },
          _count: { _all: true },
        });
        return { total: counts.reduce((sum, row) => sum + row._count._all, 0) };
      }),
      section(async () => ({ active: await prisma.loan.count({ where: { status: "ACTIVE" } }) })),
      section(async () => ({ pending: await prisma.payoutAllocation.count({ where: { investorPayout: null } }) })),
      section(async () => (await prisma.repayment.findMany({
        orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
        take: 5,
        select: { id: true, loanId: true, installmentId: true, totalSatang: true, principalSatang: true, interestSatang: true, status: true, receivedAt: true, installment: { select: { installmentNumber: true, dueDate: true, status: true } }, ledgerTransaction: { select: { status: true, postedAt: true } } },
      })).map((row) => ({ ...row, totalSatang: row.totalSatang.toString(), principalSatang: row.principalSatang.toString(), interestSatang: row.interestSatang.toString() }))),
      section(async () => prisma.auditLog.findMany({
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 5,
        select: { id: true, actorUserId: true, action: true, targetType: true, targetId: true, outcome: true, createdAt: true },
      })),
    ]);
    return withTimings(apiSuccessResponse({ users, applications, loans, payouts, repayments, audit }, { message: "Administrator dashboard loaded." }));
  } catch (error) {
    if (authDuration === 0) authDuration = performance.now() - startedAt;
    return withTimings(apiErrorResponseFrom(error));
  }
}
