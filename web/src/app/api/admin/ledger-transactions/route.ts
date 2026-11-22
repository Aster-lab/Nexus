import { ApiError, apiErrorResponseFrom } from "../../../../lib/api/errors";
import { requireAdministrator } from "../../../../lib/api/administrator";
import { parsePagination } from "../../../../lib/api/pagination";
import { apiPaginatedResponse } from "../../../../lib/api/responses";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const statuses = ["DRAFT", "POSTED", "REVERSED"];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdministrator(request);
    const pagination = parsePagination(new URL(request.url).searchParams, { sortFields: ["createdAt", "postedAt"], filterFields: ["status", "transactionType", "referenceType", "referenceId"], defaultLimit: 20, maxLimit: 100 });
    const filters = pagination.filters ?? {};
    if (filters.status && !statuses.includes(filters.status)) throw new ApiError("VALIDATION_ERROR", "Unsupported ledger transaction status filter.", 400);
    if (filters.referenceId && !uuid.test(filters.referenceId)) throw new ApiError("VALIDATION_ERROR", "Invalid referenceId filter.", 400);
    const where = {
      ...(filters.status ? { status: filters.status as never } : {}),
      ...(filters.transactionType ? { transactionType: filters.transactionType } : {}),
      ...(filters.referenceType ? { referenceType: filters.referenceType } : {}),
      ...(filters.referenceId ? { referenceId: filters.referenceId } : {}),
    };
    const orderBy = pagination.sortBy === "postedAt" ? { postedAt: pagination.sortOrder } : { createdAt: pagination.sortOrder };
    const [rows, total] = await Promise.all([
      prisma.ledgerTransaction.findMany({ where, orderBy, skip: pagination.offset, take: pagination.limit, select: { id: true, transactionType: true, status: true, referenceType: true, referenceId: true, description: true, createdAt: true, postedAt: true, reversedTransactionId: true, entries: { orderBy: { createdAt: "asc" }, select: { id: true, walletId: true, platformAccountId: true, entryType: true, amountSatang: true, currency: true, wallet: { select: { ownerUser: { select: { id: true, email: true } }, ownerPlatformAccount: { select: { accountCode: true, accountName: true } } } }, platformAccount: { select: { accountCode: true, accountName: true } }, accountMappings: { select: { entryType: true, amountSatang: true, platformAccount: { select: { accountCode: true, accountName: true } } } } } } } }),
      prisma.ledgerTransaction.count({ where }),
    ]);
    return apiPaginatedResponse(rows.map((row) => ({ ...row, entries: row.entries.map((entry) => ({ ...entry, amountSatang: entry.amountSatang.toString(), accountMappings: entry.accountMappings.map((mapping) => ({ ...mapping, amountSatang: mapping.amountSatang.toString() })) })) })), pagination, total);
  } catch (error) { return apiErrorResponseFrom(error); }
}
