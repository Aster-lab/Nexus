import { authenticateApiRequest } from "../../../../lib/api/authentication";
import { requireRole } from "../../../../lib/api/authorization";
import { ApiError, apiErrorResponseFrom } from "../../../../lib/api/errors";
import { parsePagination } from "../../../../lib/api/pagination";
import { apiSuccessResponse } from "../../../../lib/api/responses";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const identity = await authenticateApiRequest(request);
    requireRole(identity, "BORROWER");
    if (!identity.borrowerProfile) {
      throw new ApiError("FORBIDDEN", "A borrower profile is required.", 403);
    }
    const pagination = parsePagination(new URL(request.url).searchParams, {
      sortFields: ["createdAt"],
      defaultLimit: 20,
      maxLimit: 100,
    });
    const wallet = await prisma.wallet.findUnique({
      where: { ownerUserId: identity.userId },
      select: {
        id: true,
        ownerUserId: true,
        currency: true,
        balanceSatang: true,
        status: true,
      },
    });
    if (!wallet) return apiSuccessResponse({
      wallet: null,
      transactions: [],
      pagination: { page: pagination.page, limit: pagination.limit, total: 0, totalPages: 0, hasPreviousPage: false, hasNextPage: false },
    });

    const where = {
      walletId: wallet.id,
      ledgerTransaction: { status: "POSTED" as const, postedAt: { not: null } },
    };
    const [entries, total] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where,
        orderBy: [{ createdAt: pagination.sortOrder }, { id: pagination.sortOrder }],
        skip: pagination.offset,
        take: pagination.limit,
        select: {
          id: true,
          entryType: true,
          amountSatang: true,
          currency: true,
          ledgerTransaction: {
            select: {
              id: true,
              transactionType: true,
              referenceType: true,
              referenceId: true,
              description: true,
              status: true,
              postedAt: true,
              repayments: { select: { id: true, loanId: true, status: true } },
            },
          },
        },
      }),
      prisma.ledgerEntry.count({ where }),
    ]);
    return apiSuccessResponse({
      wallet: { ...wallet, balanceSatang: wallet.balanceSatang.toString() },
      transactions: entries.map((entry) => ({
        ledgerEntryId: entry.id,
        ledgerTransactionId: entry.ledgerTransaction.id,
        transactionType: entry.ledgerTransaction.transactionType,
        referenceType: entry.ledgerTransaction.referenceType,
        referenceId: entry.ledgerTransaction.referenceId,
        description: entry.ledgerTransaction.description,
        repayments: entry.ledgerTransaction.repayments,
        direction: entry.entryType,
        amountSatang: entry.amountSatang.toString(),
        currency: entry.currency,
        status: entry.ledgerTransaction.status,
        postedAt: entry.ledgerTransaction.postedAt?.toISOString() ?? null,
      })),
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total,
        totalPages: total === 0 ? 0 : Math.ceil(total / pagination.limit),
        hasPreviousPage: pagination.page > 1,
        hasNextPage: pagination.page * pagination.limit < total,
      },
    });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
