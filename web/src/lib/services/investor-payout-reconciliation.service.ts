import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../prisma";
import { requireFinancialAdministrator } from "./financial-authorization.service";

const CLEARING_ACCOUNT_CODE = "2300";
const CURRENCY = "THB";

export interface InvestorPayoutReconciliationIssue {
  code: string;
  entityId: string;
  message: string;
}

export interface InvestorPayoutReconciliationReport {
  valid: boolean;
  issues: InvestorPayoutReconciliationIssue[];
  unpaidAllocationIds: string[];
  clearing: {
    walletBalanceSatang: bigint;
    ledgerBalanceSatang: bigint;
    collectionsSatang: bigint;
    completedPayoutsSatang: bigint;
    otherPostedMovementSatang: bigint;
  } | null;
  checked: {
    postedTransactions: number;
    wallets: number;
    allocations: number;
    completedPayouts: number;
    unpaidAllocations: number;
  };
}

export interface ReconcileInvestorPayoutsInput {
  actorUserId: string;
}

function addIssue(
  issues: InvestorPayoutReconciliationIssue[],
  code: string,
  entityId: string,
  message: string,
) {
  issues.push({ code, entityId, message });
}

function walletEntryDelta(
  entryType: "DEBIT" | "CREDIT",
  ownerUserId: string | null,
  accountType: string | null,
  amountSatang: bigint,
): bigint {
  const debitIncreases = ownerUserId === null &&
    (accountType === "ASSET" || accountType === "EXPENSE");
  const increase = debitIncreases ? entryType === "DEBIT" : entryType === "CREDIT";
  return increase ? amountSatang : -amountSatang;
}

export async function reconcileInvestorPayouts(
  input: ReconcileInvestorPayoutsInput,
): Promise<InvestorPayoutReconciliationReport> {
  return prisma.$transaction(async (tx) => {
    await requireFinancialAdministrator(tx, input.actorUserId);
    const [transactions, wallets, allocations, clearingAccount] = await Promise.all([
      tx.ledgerTransaction.findMany({
        where: { status: "POSTED" },
        include: { entries: true },
        orderBy: { id: "asc" },
      }),
      tx.wallet.findMany({
        include: {
          ownerPlatformAccount: { select: { accountType: true } },
          ledgerEntries: {
            where: { ledgerTransaction: { status: "POSTED" } },
            select: { entryType: true, amountSatang: true, currency: true },
          },
        },
        orderBy: { id: "asc" },
      }),
      tx.payoutAllocation.findMany({
        include: {
          repayment: {
            select: {
              id: true,
              status: true,
              ledgerTransaction: { select: { id: true, status: true } },
            },
          },
          investment: {
            select: { investorProfile: { select: { userId: true } } },
          },
          investorPayout: {
            include: {
              wallet: { select: { id: true, ownerUserId: true, ownerPlatformAccountId: true } },
              ledgerTransaction: { include: { entries: true } },
            },
          },
        },
        orderBy: { id: "asc" },
      }),
      tx.platformAccount.findUnique({
        where: { accountCode: CLEARING_ACCOUNT_CODE },
        include: {
          wallets: { select: { id: true, balanceSatang: true, currency: true } },
        },
      }),
    ]);

    const issues: InvestorPayoutReconciliationIssue[] = [];
    const unpaidAllocationIds: string[] = [];

    for (const transaction of transactions) {
      const currencies = new Set(transaction.entries.map((entry) => entry.currency));
      for (const currency of currencies) {
        const debits = transaction.entries
          .filter((entry) => entry.currency === currency && entry.entryType === "DEBIT")
          .reduce((sum, entry) => sum + entry.amountSatang, 0n);
        const credits = transaction.entries
          .filter((entry) => entry.currency === currency && entry.entryType === "CREDIT")
          .reduce((sum, entry) => sum + entry.amountSatang, 0n);
        if (debits !== credits || transaction.entries.length < 2) {
          addIssue(issues, "UNBALANCED_LEDGER_TRANSACTION", transaction.id,
            "Posted ledger entries do not balance by currency.");
        }
      }
    }

    for (const wallet of wallets) {
      const expected = wallet.ledgerEntries.reduce((sum, entry) =>
        sum + walletEntryDelta(
          entry.entryType,
          wallet.ownerUserId,
          wallet.ownerPlatformAccount?.accountType ?? null,
          entry.amountSatang,
        ), 0n);
      if (wallet.balanceSatang !== expected) {
        addIssue(issues, "WALLET_LEDGER_MISMATCH", wallet.id,
          "Wallet projection does not match its posted ledger entries.");
      }
      if (wallet.ledgerEntries.some((entry) => entry.currency !== wallet.currency)) {
        addIssue(issues, "WALLET_CURRENCY_MISMATCH", wallet.id,
          "Wallet currency differs from one or more posted ledger entries.");
      }
    }

    let completedPayouts = 0;
    for (const allocation of allocations) {
      const payout = allocation.investorPayout;
      if (!payout || payout.status !== "COMPLETED") {
        unpaidAllocationIds.push(allocation.id);
        if (payout?.ledgerTransactionId) {
          addIssue(issues, "INCOMPLETE_PAYOUT_LINK", payout.id,
            "An unpaid payout unexpectedly references a ledger transaction.");
        }
        continue;
      }

      completedPayouts += 1;
      if (
        payout.principalSatang !== allocation.principalSatang ||
        payout.interestSatang !== allocation.interestSatang ||
        payout.principalSatang + payout.interestSatang !==
          allocation.principalSatang + allocation.interestSatang
      ) {
        addIssue(issues, "PAYOUT_ALLOCATION_MISMATCH", payout.id,
          "Completed payout components do not match the source allocation.");
      }
      if (
        allocation.repayment.status !== "POSTED" ||
        allocation.repayment.ledgerTransaction.status !== "POSTED"
      ) {
        addIssue(issues, "PAYOUT_SOURCE_NOT_POSTED", payout.id,
          "Completed payout does not reference a POSTED repayment and ledger transaction.");
      }
      if (
        payout.wallet.ownerUserId !== allocation.investment.investorProfile.userId ||
        payout.wallet.ownerPlatformAccountId !== null
      ) {
        addIssue(issues, "PAYOUT_WALLET_OWNER_MISMATCH", payout.id,
          "Completed payout wallet does not belong to the allocation investor.");
      }

      const ledger = payout.ledgerTransaction;
      if (!ledger || ledger.status !== "POSTED" || payout.completedAt === null) {
        addIssue(issues, "COMPLETED_PAYOUT_WITHOUT_POSTED_LEDGER", payout.id,
          "Completed payout must link to a POSTED ledger transaction and timestamp.");
        continue;
      }
      if (
        ledger.referenceType !== "PAYOUT_ALLOCATION" ||
        ledger.referenceId !== allocation.id
      ) {
        addIssue(issues, "PAYOUT_LEDGER_REFERENCE_MISMATCH", payout.id,
          "Payout ledger transaction does not reference its allocation.");
      }

      const amount = allocation.principalSatang + allocation.interestSatang;
      const clearingWalletId = clearingAccount?.wallets.length === 1
        ? clearingAccount.wallets[0].id
        : null;
      const debit = ledger.entries.filter((entry) =>
        entry.walletId === clearingWalletId && entry.entryType === "DEBIT" &&
        entry.amountSatang === amount && entry.currency === CURRENCY);
      const credit = ledger.entries.filter((entry) =>
        entry.walletId === payout.walletId && entry.entryType === "CREDIT" &&
        entry.amountSatang === amount && entry.currency === CURRENCY);
      if (ledger.entries.length !== 2 || debit.length !== 1 || credit.length !== 1) {
        addIssue(issues, "PAYOUT_LEDGER_ENTRIES_MISMATCH", payout.id,
          "Payout must debit clearing and credit the investor wallet for the allocated amount.");
      }
    }

    let clearing: InvestorPayoutReconciliationReport["clearing"] = null;
    if (!clearingAccount || clearingAccount.wallets.length !== 1) {
      addIssue(issues, "CLEARING_WALLET_CONFIGURATION", CLEARING_ACCOUNT_CODE,
        "Repayment Clearing must have exactly one configured wallet.");
    } else {
      const clearingWallet = clearingAccount.wallets[0];
      const collections = transactions
        .filter((transaction) => transaction.transactionType === "BORROWER_REPAYMENT")
        .flatMap((transaction) => transaction.entries)
        .filter((entry) => entry.walletId === clearingWallet.id && entry.entryType === "CREDIT")
        .reduce((sum, entry) => sum + entry.amountSatang, 0n);
      const payouts = transactions
        .filter((transaction) => transaction.transactionType === "INVESTOR_PAYOUT")
        .flatMap((transaction) => transaction.entries)
        .filter((entry) => entry.walletId === clearingWallet.id && entry.entryType === "DEBIT")
        .reduce((sum, entry) => sum + entry.amountSatang, 0n);
      const clearingEntries = transactions
        .flatMap((transaction) => transaction.entries)
        .filter((entry) => entry.walletId === clearingWallet.id);
      const ledgerBalance = clearingEntries.reduce((sum, entry) =>
        sum + walletEntryDelta(entry.entryType, null, "LIABILITY", entry.amountSatang), 0n);
      const otherPostedMovement = ledgerBalance - collections + payouts;
      clearing = {
        walletBalanceSatang: clearingWallet.balanceSatang,
        ledgerBalanceSatang: ledgerBalance,
        collectionsSatang: collections,
        completedPayoutsSatang: payouts,
        otherPostedMovementSatang: otherPostedMovement,
      };
      if (ledgerBalance !== clearingWallet.balanceSatang) {
        addIssue(issues, "CLEARING_BALANCE_MISMATCH", clearingWallet.id,
          "Repayment Clearing balance does not match all posted ledger movements.");
      }
      if (clearingWallet.currency !== CURRENCY) {
        addIssue(issues, "CLEARING_CURRENCY_MISMATCH", clearingWallet.id,
          "Repayment Clearing wallet must use THB.");
      }
    }

    return {
      valid: issues.length === 0,
      issues,
      unpaidAllocationIds,
      clearing,
      checked: {
        postedTransactions: transactions.length,
        wallets: wallets.length,
        allocations: allocations.length,
        completedPayouts,
        unpaidAllocations: unpaidAllocationIds.length,
      },
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
