import { randomUUID } from "node:crypto";
import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../prisma";
import { requireFinancialAdministrator } from "./financial-authorization.service";
import { withSerializableTransactionRetry } from "./ledger-posting.service";

const CURRENCY = "THB";
const TRANSACTION_TYPE = "COMPENSATING_TRANSACTION";

export interface CompensateLedgerTransactionInput {
  actorUserId: string;
  originalLedgerTransactionId: string;
  idempotencyKey: string;
  reason: string;
}

export interface CompensatingTransactionResult {
  originalLedgerTransactionId: string;
  compensatingLedgerTransactionId: string;
  totalSatang: bigint;
  status: "POSTED";
}

type TransactionClient = Prisma.TransactionClient;

function validateInput(input: CompensateLedgerTransactionInput): void {
  if (!input.originalLedgerTransactionId.trim()) {
    throw new Error("An original ledger transaction ID is required.");
  }
  if (!input.idempotencyKey.trim() || input.idempotencyKey.length > 255) {
    throw new Error("A valid compensation idempotency key is required.");
  }
  if (!input.reason.trim()) {
    throw new Error("A reason is required for a compensating transaction.");
  }
}

async function findExistingCompensation(
  tx: TransactionClient,
  input: CompensateLedgerTransactionInput,
): Promise<CompensatingTransactionResult | null> {
  const existing = await tx.ledgerTransaction.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { entries: true },
  });
  if (!existing) return null;

  if (
    existing.status !== "POSTED" ||
    existing.transactionType !== TRANSACTION_TYPE ||
    existing.reversedTransactionId !== input.originalLedgerTransactionId
  ) {
    throw new Error("The compensation idempotency key is already in use.");
  }

  const totalSatang = existing.entries
    .filter((entry) => entry.entryType === "DEBIT")
    .reduce((total, entry) => total + entry.amountSatang, 0n);

  return {
    originalLedgerTransactionId: input.originalLedgerTransactionId,
    compensatingLedgerTransactionId: existing.id,
    totalSatang,
    status: "POSTED",
  };
}

function walletProjectionDelta(
  entryType: "DEBIT" | "CREDIT",
  ownerUserId: string | null,
  accountType: string | null,
  amountSatang: bigint,
): bigint {
  const debitIncreases =
    ownerUserId === null &&
    (accountType === "ASSET" || accountType === "EXPENSE");
  const increases = debitIncreases
    ? entryType === "DEBIT"
    : entryType === "CREDIT";
  return increases ? amountSatang : -amountSatang;
}

async function compensateInTransaction(
  tx: TransactionClient,
  input: CompensateLedgerTransactionInput,
): Promise<CompensatingTransactionResult> {
  await requireFinancialAdministrator(tx, input.actorUserId);

  const existing = await findExistingCompensation(tx, input);
  if (existing) return existing;

  // Lock and reread the immutable original before checking for another
  // compensation, so concurrent requests cannot both reverse it.
  await tx.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM ledger_transactions
    WHERE id = ${input.originalLedgerTransactionId}::uuid
    FOR UPDATE
  `;

  const original = await tx.ledgerTransaction.findUnique({
    where: { id: input.originalLedgerTransactionId },
    include: {
      entries: true,
      repayments: { select: { id: true } },
      investmentContributions: { select: { id: true } },
      escrowTransactions: { select: { id: true } },
      investorPayouts: { select: { id: true } },
      withdrawalRequests: { select: { id: true } },
      openingBalance: { select: { id: true } },
      investmentRefunds: { select: { id: true } },
    },
  });
  if (!original || original.status !== "POSTED" || !original.postedAt) {
    throw new Error("Only an existing POSTED transaction can be compensated.");
  }
  if (original.reversedTransactionId !== null) {
    throw new Error("A compensating transaction cannot itself be compensated.");
  }
  if (
    original.repayments.length > 0 ||
    original.investmentContributions.length > 0 ||
    original.escrowTransactions.length > 0 ||
    original.investorPayouts.length > 0 ||
    original.withdrawalRequests.length > 0 ||
    original.openingBalance !== null ||
    original.investmentRefunds.length > 0
  ) {
    throw new Error(
      "Business-linked transactions require their domain-specific correction workflow.",
    );
  }
  if (original.entries.length < 2) {
    throw new Error("The original transaction has no complete ledger entry set.");
  }
  if (original.entries.some((entry) => entry.currency !== CURRENCY)) {
    throw new Error("Only THB ledger transactions can be compensated.");
  }

  const debitTotal = original.entries
    .filter((entry) => entry.entryType === "DEBIT")
    .reduce((total, entry) => total + entry.amountSatang, 0n);
  const creditTotal = original.entries
    .filter((entry) => entry.entryType === "CREDIT")
    .reduce((total, entry) => total + entry.amountSatang, 0n);
  if (debitTotal <= 0n || debitTotal !== creditTotal) {
    throw new Error("The original transaction is not balanced and cannot be compensated.");
  }

  const alreadyCompensated = await tx.ledgerTransaction.findFirst({
    where: { reversedTransactionId: original.id },
    select: { id: true },
  });
  if (alreadyCompensated) {
    throw new Error("The original transaction has already been compensated.");
  }

  const walletIds = [...new Set(
    original.entries
      .map((entry) => entry.walletId)
      .filter((walletId): walletId is string => walletId !== null),
  )].sort();

  for (const walletId of walletIds) {
    await tx.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM wallets WHERE id = ${walletId}::uuid FOR UPDATE
    `;
  }

  const wallets = await tx.wallet.findMany({
    where: { id: { in: walletIds } },
    include: { ownerPlatformAccount: { select: { accountType: true } } },
  });
  if (wallets.length !== walletIds.length) {
    throw new Error("A wallet referenced by the original transaction no longer exists.");
  }
  const walletById = new Map(wallets.map((wallet) => [wallet.id, wallet]));

  const reversal = await tx.ledgerTransaction.create({
    data: {
      transactionType: TRANSACTION_TYPE,
      status: "DRAFT",
      idempotencyKey: input.idempotencyKey,
      referenceType: "LEDGER_TRANSACTION",
      referenceId: original.id,
      reversedTransactionId: original.id,
      description: input.reason,
    },
    select: { id: true },
  });

  const reversalEntries = original.entries.map((entry) => ({
    ledgerTransactionId: reversal.id,
    walletId: entry.walletId,
    platformAccountId: entry.platformAccountId,
    entryType: entry.entryType === "DEBIT" ? "CREDIT" as const : "DEBIT" as const,
    amountSatang: entry.amountSatang,
    currency: entry.currency,
  }));
  await tx.ledgerEntry.createMany({ data: reversalEntries });

  const walletDeltas = new Map<string, bigint>();
  for (const entry of reversalEntries) {
    if (!entry.walletId) continue;
    const wallet = walletById.get(entry.walletId)!;
    const delta = walletProjectionDelta(
      entry.entryType,
      wallet.ownerUserId,
      wallet.ownerPlatformAccount?.accountType ?? null,
      entry.amountSatang,
    );
    walletDeltas.set(entry.walletId, (walletDeltas.get(entry.walletId) ?? 0n) + delta);
  }

  for (const [walletId, delta] of walletDeltas) {
    if (delta === 0n) continue;
    const updated = await tx.wallet.updateMany({
      where: {
        id: walletId,
        ...(delta < 0n ? { balanceSatang: { gte: -delta } } : {}),
      },
      data: {
        balanceSatang: delta < 0n
          ? { decrement: -delta }
          : { increment: delta },
      },
    });
    if (updated.count !== 1) {
      throw new Error("A wallet cannot fund the requested compensation.");
    }
  }

  const posted = await tx.ledgerTransaction.updateMany({
    where: { id: reversal.id, status: "DRAFT" },
    data: { status: "POSTED", postedAt: new Date() },
  });
  if (posted.count !== 1) {
    throw new Error("The compensating transaction could not be posted.");
  }

  await tx.auditLog.create({
    data: {
      actorUserId: input.actorUserId,
      action: "COMPENSATING_TRANSACTION_CREATED",
      targetType: "LEDGER_TRANSACTION",
      targetId: original.id,
      reason: input.reason,
      newValues: {
        originalLedgerTransactionId: original.id,
        compensatingLedgerTransactionId: reversal.id,
        totalSatang: debitTotal.toString(),
        idempotencyKey: input.idempotencyKey,
      },
      outcome: "SUCCESS",
      correlationId: randomUUID(),
    },
  });

  return {
    originalLedgerTransactionId: original.id,
    compensatingLedgerTransactionId: reversal.id,
    totalSatang: debitTotal,
    status: "POSTED",
  };
}

export async function compensateLedgerTransaction(
  input: CompensateLedgerTransactionInput,
): Promise<CompensatingTransactionResult> {
  validateInput(input);
  return withSerializableTransactionRetry((tx) =>
    compensateInTransaction(tx, input),
  );
}
