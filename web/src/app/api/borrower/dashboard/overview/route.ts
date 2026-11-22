import { ApiError, apiErrorResponseFrom } from "../../../../../lib/api/errors";
import { authenticateApiRequest } from "../../../../../lib/api/authentication";
import { requireRole } from "../../../../../lib/api/authorization";
import { apiSuccessResponse } from "../../../../../lib/api/responses";
import { prisma } from "../../../../../lib/prisma";
import { getBorrowerDashboardSummary } from "../../../../../lib/services/borrower-dashboard.service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Section<T> = { status: "success"; data: T } | { status: "error"; message: string };
type ListSection<T> = Section<T[]>;

async function section<T>(load: () => Promise<T>): Promise<Section<T>> {
  try {
    return { status: "success", data: await load() };
  } catch {
    return { status: "error", message: "We could not load this section. Check your connection and retry." };
  }
}

export async function GET(request: Request): Promise<Response> {
  const startedAt = performance.now();
  const authStartedAt = startedAt;
  let authDuration = 0;
  const withTimings = (response: Response) => {
    const total = performance.now() - startedAt;
    response.headers.set("Server-Timing", `auth;dur=${authDuration.toFixed(1)}, data;dur=${Math.max(0, total - authDuration).toFixed(1)}, app;dur=${total.toFixed(1)}`);
    return response;
  };
  try {
    const identity = await authenticateApiRequest(request);
    requireRole(identity, "BORROWER");
    if (!identity.borrowerProfile) throw new ApiError("FORBIDDEN", "A borrower profile is required.", 403);
    authDuration = performance.now() - authStartedAt;

    const profileId = identity.borrowerProfile.id;
    const userId = identity.userId;
    const [summary, applications, loans, repayments, wallet] = await Promise.all([
      section(() => getBorrowerDashboardSummary(profileId)),
      section(async () => (await prisma.loanApplication.findMany({
        where: { borrowerProfileId: profileId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          submittedAt: true,
          currentVersion: { select: { versionNumber: true, requestedPrincipalSatang: true, requestedTermMonths: true } },
        },
      })).map((application) => ({
        ...application,
        currentVersion: application.currentVersion ? {
          ...application.currentVersion,
          requestedPrincipalSatang: application.currentVersion.requestedPrincipalSatang.toString(),
        } : null,
      }))),
      section(async () => (await prisma.loan.findMany({
        where: { borrowerProfileId: profileId },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, status: true, principalSatang: true, fundedSatang: true, annualInterestRate: true, termMonths: true, createdAt: true },
      })).map((loan) => ({
        ...loan,
        principalSatang: loan.principalSatang.toString(),
        fundedSatang: loan.fundedSatang.toString(),
        annualInterestRate: loan.annualInterestRate.toString(),
      }))),
      section(async () => (await prisma.repayment.findMany({
        where: { loan: { borrowerProfileId: profileId } },
        orderBy: [{ receivedAt: "desc" }, { id: "desc" }],
        take: 5,
        select: {
          id: true,
          loanId: true,
          installmentId: true,
          ledgerTransactionId: true,
          principalSatang: true,
          interestSatang: true,
          feeSatang: true,
          totalSatang: true,
          status: true,
          receivedAt: true,
          installment: { select: { installmentNumber: true, dueDate: true } },
          ledgerTransaction: { select: { status: true, postedAt: true } },
        },
      })).map((repayment) => ({
        ...repayment,
        principalSatang: repayment.principalSatang.toString(),
        interestSatang: repayment.interestSatang.toString(),
        feeSatang: repayment.feeSatang.toString(),
        totalSatang: repayment.totalSatang.toString(),
      }))),
      section(async () => {
        const [record, entries] = await Promise.all([
          prisma.wallet.findUnique({
            where: { ownerUserId: userId },
            select: { id: true, balanceSatang: true, currency: true, status: true, createdAt: true, updatedAt: true },
          }),
          prisma.ledgerEntry.findMany({
            where: { wallet: { ownerUserId: userId }, ledgerTransaction: { status: "POSTED", postedAt: { not: null } } },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 5,
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
        ]);
        return {
          wallet: record ? { ...record, balanceSatang: record.balanceSatang.toString() } : null,
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
        };
      }),
    ]);

    return withTimings(apiSuccessResponse({
      summary,
      applications: applications as ListSection<unknown>,
      loans: loans as ListSection<unknown>,
      repayments: repayments as ListSection<unknown>,
      wallet,
    }, { message: "Borrower dashboard loaded." }));
  } catch (error) {
    if (authDuration === 0) authDuration = performance.now() - authStartedAt;
    return withTimings(apiErrorResponseFrom(error));
  }
}
