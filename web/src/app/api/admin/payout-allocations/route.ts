import { requireAdministrator } from "../../../../lib/api/administrator";
import { apiErrorResponseFrom } from "../../../../lib/api/errors";
import { parsePagination } from "../../../../lib/api/pagination";
import { apiPaginatedResponse } from "../../../../lib/api/responses";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CLEARING_ACCOUNT_CODE = "2300";
const CURRENCY = "THB";

export async function GET(request: Request): Promise<Response> {
  try {
    await requireAdministrator(request);
    const pagination = parsePagination(new URL(request.url).searchParams, { sortFields: ["createdAt"] });
    const where = { investorPayout: null };
    const [allocations, total, clearingAccount] = await Promise.all([
      prisma.payoutAllocation.findMany({
        where,
        orderBy: { createdAt: pagination.sortOrder },
        skip: pagination.offset,
        take: pagination.limit,
        select: {
          id: true,
          principalSatang: true,
          interestSatang: true,
          recoverySatang: true,
          allocationMethod: true,
          createdAt: true,
          repayment: {
            select: {
              id: true,
              loanId: true,
              status: true,
              receivedAt: true,
              ledgerTransaction: { select: { id: true, status: true, postedAt: true } },
              installment: { select: { id: true, installmentNumber: true, dueDate: true } },
            },
          },
          investment: {
            select: {
              id: true,
              loanId: true,
              investorProfile: { select: { id: true, userId: true, displayName: true, investorStatus: true } },
            },
          },
        },
      }),
      prisma.payoutAllocation.count({ where }),
      prisma.platformAccount.findUnique({
        where: { accountCode: CLEARING_ACCOUNT_CODE },
        select: { status: true, wallets: { select: { id: true, status: true, currency: true, balanceSatang: true } } },
      }),
    ]);

    const investorUserIds = [...new Set(allocations.map((row) => row.investment.investorProfile.userId))];
    const investorWallets = investorUserIds.length === 0
      ? []
      : await prisma.wallet.findMany({
        where: { ownerUserId: { in: investorUserIds }, ownerPlatformAccountId: null },
        select: { id: true, ownerUserId: true, currency: true, status: true },
      });
    const walletByUser = new Map(investorWallets.map((wallet) => [wallet.ownerUserId, wallet]));
    const clearingWallet = clearingAccount?.wallets.length === 1 ? clearingAccount.wallets[0] : null;

    const rows = allocations.map((allocation) => {
      const investor = allocation.investment.investorProfile;
      const wallet = walletByUser.get(investor.userId);
      const amountSatang = allocation.principalSatang + allocation.interestSatang;
      let code: string | null = null;
      let message: string | null = null;

      if (allocation.repayment.status !== "POSTED") {
        code = "REPAYMENT_NOT_POSTED";
        message = "The source repayment is not posted.";
      } else if (allocation.repayment.ledgerTransaction.status !== "POSTED") {
        code = "SOURCE_LEDGER_NOT_POSTED";
        message = "The source ledger transaction is not posted.";
      } else if (amountSatang <= 0n) {
        code = "ZERO_VALUE_ALLOCATION";
        message = "Zero-value allocations do not create a financial transfer.";
      } else if (allocation.recoverySatang !== 0n) {
        code = "RECOVERY_WORKFLOW_REQUIRED";
        message = "Recovery allocations require a separate payout workflow.";
      } else if (investor.investorStatus !== "ACTIVE") {
        code = "INVESTOR_INACTIVE";
        message = "The investor profile is not active.";
      } else if (!wallet || wallet.status !== "ACTIVE" || wallet.currency !== CURRENCY) {
        code = "INVESTOR_WALLET_UNAVAILABLE";
        message = "The investor does not have an active THB wallet.";
      } else if (!clearingAccount || !clearingWallet || clearingAccount.status !== "ACTIVE" || clearingWallet.status !== "ACTIVE" || clearingWallet.currency !== CURRENCY) {
        code = "CLEARING_WALLET_UNAVAILABLE";
        message = "The Repayment Clearing wallet is not available for payout.";
      } else if (clearingWallet.balanceSatang < amountSatang) {
        code = "INSUFFICIENT_CLEARING_BALANCE";
        message = "The Repayment Clearing wallet does not currently cover this allocation.";
      }

      return {
        id: allocation.id,
        principalSatang: allocation.principalSatang.toString(),
        interestSatang: allocation.interestSatang.toString(),
        recoverySatang: allocation.recoverySatang.toString(),
        amountSatang: amountSatang.toString(),
        allocationMethod: allocation.allocationMethod,
        createdAt: allocation.createdAt,
        investor: {
          investorProfileId: investor.id,
          userId: investor.userId,
          displayName: investor.displayName,
          status: investor.investorStatus,
          walletStatus: wallet?.status ?? null,
          walletCurrency: wallet?.currency ?? null,
        },
        investment: { id: allocation.investment.id, loanId: allocation.investment.loanId },
        repayment: {
          id: allocation.repayment.id,
          loanId: allocation.repayment.loanId,
          status: allocation.repayment.status,
          receivedAt: allocation.repayment.receivedAt,
          ledgerTransaction: allocation.repayment.ledgerTransaction,
          installment: allocation.repayment.installment,
        },
        eligibility: { canProcess: code === null, code, message },
      };
    });

    return apiPaginatedResponse(rows, pagination, total, { message: "Unpaid payout allocations loaded." });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
