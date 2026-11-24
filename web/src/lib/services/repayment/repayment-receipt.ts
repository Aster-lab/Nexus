import { prisma } from "../../prisma";

const CURRENCY = "THB";
const TRANSACTION_TYPE = "BORROWER_REPAYMENT";
const REFERENCE_TYPE = "LOAN";

export interface RepaymentReceiptItem {
  repaymentId: string;
  installmentId: string;
  installmentNumber: number;
  ledgerTransactionId: string;
  principalSatang: bigint;
  interestSatang: bigint;
  totalSatang: bigint;
  remainingBalanceSatang: bigint;
}

export interface RepaymentReceipt {
  receiptId: string;
  borrower: { legalName: string };
  loanId: string;
  ledgerTransactionId: string;
  status: "POSTED";
  repaymentDate: Date;
  receiptTimestamp: Date;
  totalReceivedSatang: bigint;
  principalSatang: bigint;
  interestSatang: bigint;
  repaymentIds: string[];
  repayments: RepaymentReceiptItem[];
}

export async function generateRepaymentReceipt(
  ledgerTransactionId: string,
): Promise<RepaymentReceipt> {
  if (!ledgerTransactionId || !ledgerTransactionId.trim()) {
    throw new Error("A ledger transaction ID is required to generate a receipt.");
  }

  const transaction = await prisma.ledgerTransaction.findUnique({
    where: { id: ledgerTransactionId },
    select: {
      id: true,
      transactionType: true,
      status: true,
      referenceType: true,
      referenceId: true,
      postedAt: true,
      entries: {
        select: {
          walletId: true,
          platformAccountId: true,
          entryType: true,
          amountSatang: true,
          currency: true,
          platformAccount: { select: { accountCode: true } },
        },
      },
      repayments: {
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
          installment: {
            select: {
              installmentNumber: true,
              principalDueSatang: true,
              interestDueSatang: true,
              paidPrincipalSatang: true,
              paidInterestSatang: true,
            },
          },
          loan: { select: { borrowerProfile: { select: { legalName: true } } } },
        },
      },
    },
  });

  if (
    !transaction ||
    transaction.status !== "POSTED" ||
    transaction.postedAt === null ||
    transaction.transactionType !== TRANSACTION_TYPE ||
    transaction.referenceType !== REFERENCE_TYPE ||
    transaction.referenceId === null
  ) {
    throw new Error("A posted borrower repayment transaction is required.");
  }

  if (transaction.repayments.length === 0) {
    throw new Error("The posted repayment has no persisted repayment rows.");
  }

  const repayments = [...transaction.repayments].sort(
    (a, b) =>
      a.installment.installmentNumber - b.installment.installmentNumber ||
      a.id.localeCompare(b.id),
  );

  for (const repayment of repayments) {
    const remainingPrincipal =
      repayment.installment.principalDueSatang -
      repayment.installment.paidPrincipalSatang;
    const remainingInterest =
      repayment.installment.interestDueSatang -
      repayment.installment.paidInterestSatang;

    if (
      repayment.status !== "POSTED" ||
      repayment.loanId !== transaction.referenceId ||
      repayment.ledgerTransactionId !== transaction.id ||
      repayment.totalSatang !==
        repayment.principalSatang + repayment.interestSatang + repayment.feeSatang ||
      remainingPrincipal < 0n ||
      remainingInterest < 0n
    ) {
      throw new Error("Persisted repayment details are inconsistent.");
    }
  }

  const totalReceivedSatang = repayments.reduce(
    (total, repayment) => total + repayment.totalSatang,
    0n,
  );
  const principalSatang = repayments.reduce((total, repayment) => total + repayment.principalSatang, 0n);
  const interestSatang = repayments.reduce((total, repayment) => total + repayment.interestSatang, 0n);
  const debitEntries = transaction.entries.filter((entry) => entry.entryType === "DEBIT");
  const creditEntries = transaction.entries.filter((entry) => entry.entryType === "CREDIT");
  const walletDebits = debitEntries.filter((entry) => entry.walletId !== null);
  const walletCredits = creditEntries.filter((entry) => entry.walletId !== null);
  const principalDebits = debitEntries.filter((entry) => entry.walletId === null);
  const principalCredits = creditEntries.filter((entry) => entry.walletId === null);
  const walletDebitTotal = walletDebits.reduce((total, entry) => total + entry.amountSatang, 0n);
  const walletCreditTotal = walletCredits.reduce((total, entry) => total + entry.amountSatang, 0n);
  const debitTotal = debitEntries.reduce(
    (total, entry) => total + entry.amountSatang,
    0n,
  );
  const creditTotal = creditEntries.reduce(
    (total, entry) => total + entry.amountSatang,
    0n,
  );

  if (
    walletDebits.length !== 1 ||
    walletCredits.length !== 1 ||
    (principalSatang > 0n
      ? principalDebits.length !== 1 || principalCredits.length !== 1 ||
        principalDebits[0].platformAccount?.accountCode !== "1300" ||
        principalCredits[0].platformAccount?.accountCode !== "1200" ||
        principalDebits[0].amountSatang !== principalSatang ||
        principalCredits[0].amountSatang !== principalSatang
      : principalDebits.length !== 0 || principalCredits.length !== 0) ||
    transaction.entries.length !== (principalSatang > 0n ? 4 : 2) ||
    transaction.entries.some((entry) => entry.currency !== CURRENCY) ||
    walletDebitTotal !== totalReceivedSatang ||
    walletCreditTotal !== totalReceivedSatang ||
    debitTotal !== creditTotal
  ) {
    throw new Error("Repayment receipt does not reconcile to its posted ledger entries.");
  }

  const receiptItems = repayments.map((repayment) => ({
    repaymentId: repayment.id,
    installmentId: repayment.installmentId,
    installmentNumber: repayment.installment.installmentNumber,
    ledgerTransactionId: repayment.ledgerTransactionId,
    principalSatang: repayment.principalSatang,
    interestSatang: repayment.interestSatang,
    totalSatang: repayment.totalSatang,
    remainingBalanceSatang:
      repayment.installment.principalDueSatang -
      repayment.installment.paidPrincipalSatang +
      repayment.installment.interestDueSatang -
      repayment.installment.paidInterestSatang,
  }));

  return {
    receiptId: transaction.id,
    borrower: { legalName: repayments[0].loan.borrowerProfile.legalName },
    loanId: transaction.referenceId,
    ledgerTransactionId: transaction.id,
    status: "POSTED",
    repaymentDate: transaction.postedAt,
    receiptTimestamp: transaction.postedAt,
    totalReceivedSatang,
    principalSatang,
    interestSatang,
    repaymentIds: receiptItems.map((item) => item.repaymentId),
    repayments: receiptItems,
  };
}
