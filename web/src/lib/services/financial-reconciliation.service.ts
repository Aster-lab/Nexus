import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../prisma";
import { requireFinancialAdministrator } from "./financial-authorization.service";

export interface ReconcileFinancialStateInput {
  actorUserId: string;
  /** Omit to inspect every loan and loan-referenced ledger transaction. */
  loanIds?: string[];
  /** Omit to reconcile every wallet projection. */
  walletIds?: string[];
}

export interface FinancialReconciliationIssue {
  code: string;
  entityId: string;
  message: string;
}

export interface FinancialReconciliationReport {
  valid: boolean;
  issues: FinancialReconciliationIssue[];
  checked: {
    postedTransactions: number;
    wallets: number;
    repayments: number;
    installments: number;
    allocations: number;
  };
}

function addIssue(
  issues: FinancialReconciliationIssue[],
  code: string,
  entityId: string,
  message: string,
) {
  issues.push({ code, entityId, message });
}

function walletEntrySign(
  entryType: "DEBIT" | "CREDIT",
  ownerUserId: string | null,
  accountType: string | null,
): bigint {
  const debitIncreases =
    ownerUserId === null &&
    (accountType === "ASSET" || accountType === "EXPENSE");
  return (debitIncreases ? entryType === "DEBIT" : entryType === "CREDIT")
    ? 1n
    : -1n;
}

/**
 * Reconciles posted ledger transactions, wallet projections, repayments,
 * installment paid totals, and payout allocations. A report is returned for
 * both healthy and inconsistent state so callers can inspect every issue.
 */
export async function reconcileFinancialState(
  input: ReconcileFinancialStateInput,
): Promise<FinancialReconciliationReport> {
  return prisma.$transaction(async (tx) => {
  await requireFinancialAdministrator(tx, input.actorUserId);
  const [allTransactions, wallets, repayments, installments] = await Promise.all([
    tx.ledgerTransaction.findMany({
      where: { status: "POSTED" },
      include: { entries: true },
      orderBy: { id: "asc" },
    }),
    tx.wallet.findMany({
      where: input.walletIds ? { id: { in: input.walletIds } } : undefined,
      include: {
        ownerPlatformAccount: { select: { accountType: true } },
        ledgerEntries: {
          where: { ledgerTransaction: { status: "POSTED" } },
          select: {
            entryType: true,
            amountSatang: true,
            currency: true,
          },
        },
      },
      orderBy: { id: "asc" },
    }),
    tx.repayment.findMany({
      where: input.loanIds ? { loanId: { in: input.loanIds } } : undefined,
      include: {
        installment: {
          select: {
            id: true,
            installmentNumber: true,
            paidPrincipalSatang: true,
            paidInterestSatang: true,
          },
        },
        payoutAllocations: true,
      },
      orderBy: [{ loanId: "asc" }, { installmentId: "asc" }, { id: "asc" }],
    }),
    tx.installment.findMany({
      where: input.loanIds
        ? { scheduleVersion: { schedule: { loanId: { in: input.loanIds } } } }
        : undefined,
      select: {
        id: true,
        paidPrincipalSatang: true,
        paidInterestSatang: true,
      },
      orderBy: { id: "asc" },
    }),
  ]);

  const scopedLoanIds = input.loanIds
    ? new Set(input.loanIds)
    : undefined;
  const originalIdsInScope = new Set(
    allTransactions
      .filter(
        (transaction) =>
          transaction.referenceType === "LOAN" &&
          (!scopedLoanIds ||
            (transaction.referenceId !== null &&
              scopedLoanIds.has(transaction.referenceId))),
      )
      .map((transaction) => transaction.id),
  );
  const transactions = allTransactions.filter(
    (transaction) =>
      !scopedLoanIds ||
      (transaction.referenceType === "LOAN" &&
        transaction.referenceId !== null &&
        scopedLoanIds.has(transaction.referenceId)) ||
      (transaction.reversedTransactionId !== null &&
        originalIdsInScope.has(transaction.reversedTransactionId)),
  );

  const issues: FinancialReconciliationIssue[] = [];
  const transactionById = new Map(transactions.map((row) => [row.id, row]));
  const transactionTotals = new Map<string, bigint>();

  for (const transaction of transactions) {
    if (transaction.entries.length < 2) {
      addIssue(
        issues,
        "LEDGER_ENTRY_COUNT",
        transaction.id,
        "A posted transaction must contain at least two ledger entries.",
      );
    }

    const totalsByCurrency = new Map<string, { debit: bigint; credit: bigint }>();
    for (const entry of transaction.entries) {
      const totals = totalsByCurrency.get(entry.currency) ?? {
        debit: 0n,
        credit: 0n,
      };
      if (entry.entryType === "DEBIT") totals.debit += entry.amountSatang;
      else totals.credit += entry.amountSatang;
      totalsByCurrency.set(entry.currency, totals);
    }
    if (
      totalsByCurrency.size === 0 ||
      [...totalsByCurrency.values()].some((totals) => totals.debit !== totals.credit)
    ) {
      addIssue(
        issues,
        "LEDGER_UNBALANCED",
        transaction.id,
        "Posted ledger debits and credits do not balance by currency.",
      );
    }
    transactionTotals.set(
      transaction.id,
      transaction.entries
        .filter((entry) => entry.entryType === "DEBIT")
        .reduce((total, entry) => total + entry.amountSatang, 0n),
    );
  }

  for (const wallet of wallets) {
    let expectedBalance = 0n;
    for (const entry of wallet.ledgerEntries) {
      if (entry.currency !== wallet.currency) {
        addIssue(
          issues,
          "WALLET_CURRENCY_MISMATCH",
          wallet.id,
          "A wallet has posted ledger entries in a different currency.",
        );
      }
      expectedBalance +=
        walletEntrySign(
          entry.entryType,
          wallet.ownerUserId,
          wallet.ownerPlatformAccount?.accountType ?? null,
        ) * entry.amountSatang;
    }
    if (wallet.balanceSatang !== expectedBalance) {
      addIssue(
        issues,
        "WALLET_BALANCE_MISMATCH",
        wallet.id,
        `Wallet projection ${wallet.balanceSatang} does not equal ledger-derived balance ${expectedBalance}.`,
      );
    }
  }

  const repaymentsByTransaction = new Map<string, typeof repayments>();
  const repaymentNetByInstallment = new Map<
    string,
    { principal: bigint; interest: bigint }
  >();
  let allocationCount = 0;

  for (const repayment of repayments) {
    const group = repaymentsByTransaction.get(repayment.ledgerTransactionId) ?? [];
    group.push(repayment);
    repaymentsByTransaction.set(repayment.ledgerTransactionId, group);

    const transaction = transactionById.get(repayment.ledgerTransactionId);
    if (
      repayment.status !== "POSTED" ||
      !transaction ||
      transaction.referenceType !== "LOAN" ||
      transaction.referenceId !== repayment.loanId
    ) {
      addIssue(
        issues,
        "REPAYMENT_LEDGER_LINK",
        repayment.id,
        "A posted repayment must reference its loan's posted ledger transaction.",
      );
    }
    if (
      repayment.totalSatang !==
      repayment.principalSatang + repayment.interestSatang + repayment.feeSatang
    ) {
      addIssue(
        issues,
        "REPAYMENT_COMPONENT_TOTAL",
        repayment.id,
        "Repayment total does not equal principal, interest, and fee.",
      );
    }

    const sign = repayment.reversalOfRepaymentId === null ? 1n : -1n;
    const net = repaymentNetByInstallment.get(repayment.installmentId) ?? {
      principal: 0n,
      interest: 0n,
    };
    net.principal += sign * repayment.principalSatang;
    net.interest += sign * repayment.interestSatang;
    repaymentNetByInstallment.set(repayment.installmentId, net);

    allocationCount += repayment.payoutAllocations.length;
    const allocatedPrincipal = repayment.payoutAllocations.reduce(
      (sum, row) => sum + row.principalSatang,
      0n,
    );
    const allocatedInterest = repayment.payoutAllocations.reduce(
      (sum, row) => sum + row.interestSatang,
      0n,
    );
    const allocatedRecovery = repayment.payoutAllocations.reduce(
      (sum, row) => sum + row.recoverySatang,
      0n,
    );
    if (
      allocatedPrincipal !== repayment.principalSatang ||
      allocatedInterest !== repayment.interestSatang ||
      allocatedRecovery !== 0n
    ) {
      addIssue(
        issues,
        "PAYOUT_ALLOCATION_MISMATCH",
        repayment.id,
        "Investor allocations do not reconcile to repayment principal and interest.",
      );
    }
  }

  for (const [transactionId, linkedRepayments] of repaymentsByTransaction) {
    const repaymentTotal = linkedRepayments.reduce(
      (sum, repayment) => sum + repayment.totalSatang,
      0n,
    );
    if (transactionTotals.get(transactionId) !== repaymentTotal) {
      addIssue(
        issues,
        "REPAYMENT_LEDGER_TOTAL",
        transactionId,
        "Repayment rows do not equal the amount posted in the ledger transaction.",
      );
    }
  }

  for (const installment of installments) {
    const expected = repaymentNetByInstallment.get(installment.id) ?? {
      principal: 0n,
      interest: 0n,
    };
    if (
      installment.paidPrincipalSatang !== expected.principal ||
      installment.paidInterestSatang !== expected.interest
    ) {
      addIssue(
        issues,
        "INSTALLMENT_REPAYMENT_MISMATCH",
        installment.id,
        "Installment paid totals do not equal net posted repayment records.",
      );
    }
  }

  return {
    valid: issues.length === 0,
    issues,
    checked: {
      postedTransactions: transactions.length,
      wallets: wallets.length,
      repayments: repayments.length,
      installments: installments.length,
      allocations: allocationCount,
    },
  };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}
