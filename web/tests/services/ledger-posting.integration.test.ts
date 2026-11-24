
import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

import { Prisma } from "../../src/generated/prisma/client";
import { prisma } from "../../src/lib/prisma";
import { postWalletTransfer,withSerializableTransactionRetry } from "../../src/lib/services/ledger-posting.service";
import { createRepaymentTestContext } from "../fixtures/repayment.fixture";

type TestContext = Awaited<ReturnType<typeof createRepaymentTestContext>>;

const CLEARING_ACCOUNT_CODE = "2300";
const CURRENCY = "THB";


async function getTransferWallets(context: TestContext) {
  const [debitWallet, clearingAccount] = await Promise.all([
    prisma.wallet.findUnique({
      where: { id: context.borrowerWalletId },
      select: {
        id: true,
        balanceSatang: true,
        status: true,
        currency: true,
      },
    }),
    prisma.platformAccount.findUnique({
      where: { accountCode: CLEARING_ACCOUNT_CODE },
      select: {
        id: true,
        accountType: true,
        status: true,
        currency: true,
      },
    }),
  ]);

  if (!debitWallet) {
    throw new Error("Expected the funded borrower wallet to exist.");
  }

  if (!clearingAccount) {
    throw new Error("Expected Repayment Clearing account 2300 to exist.");
  }

  const creditWallet = await prisma.wallet.findUnique({
    where: { ownerPlatformAccountId: clearingAccount.id },
    select: {
      id: true,
      balanceSatang: true,
      status: true,
      currency: true,
    },
  });

  if (!creditWallet) {
    throw new Error("Expected the Repayment Clearing wallet to exist.");
  }

  return { debitWallet, creditWallet, clearingAccount };
}


function makeInput(
  context: TestContext,
  debitWalletId: string,
  creditWalletId: string,
  overrides: Partial<{
    transactionType: string;
    referenceType: string;
    referenceId: string;
    description: string;
    idempotencyKey: string;
    amountSatang: bigint;
  }> = {},
) {
  return {
    transactionType: "TEST_WALLET_TRANSFER",
    referenceType: "LOAN",
    referenceId: context.loan.id,
    description: "Integration test wallet transfer",
    idempotencyKey: randomUUID(),
    debitWalletId,
    creditWalletId,
    amountSatang: 1n,
    ...overrides,
  };
}

async function post(input: ReturnType<typeof makeInput>) {
  return withSerializableTransactionRetry(
    (tx) => postWalletTransfer(tx, input),
  );
}

async function expectNoTransaction(idempotencyKey: string) {
  const transaction = await prisma.ledgerTransaction.findUnique({
    where: { idempotencyKey },
  });

  expect(transaction).toBeNull();
}

describe("postWalletTransfer integration", () => {
  beforeAll(async () => {
    await prisma.$queryRaw`SELECT 1`;
  });

  async function withContext(
    run: (context: TestContext) => Promise<void>,
  ) {
    const context = await createRepaymentTestContext();

    try {
      await run(context);
    } finally {
      await context.cleanup();
    }
  }

  it("LED-01 posts a valid wallet transfer", async () => {
    await withContext(async (context) => {
      const { debitWallet, creditWallet } =
        await getTransferWallets(context);

      expect(debitWallet.balanceSatang).toBeGreaterThan(0n);

      const amountSatang = 1n;
      const input = makeInput(
        context,
        debitWallet.id,
        creditWallet.id,
        { amountSatang },
      );

      const result = await post(input);

      expect(result).toMatchObject({
        amountSatang,
        reused: false,
      });
      expect(result.ledgerTransactionId).toBeTruthy();

      const transaction = await prisma.ledgerTransaction.findUnique({
        where: { id: result.ledgerTransactionId },
      });

      expect(transaction).toMatchObject({
        transactionType: input.transactionType,
        status: "POSTED",
        idempotencyKey: input.idempotencyKey,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
      });
      expect(transaction?.postedAt).toBeInstanceOf(Date);
    });
  });

  it("LED-02 creates exactly one debit and one credit entry for the transfer", async () => {
    await withContext(async (context) => {
      const { debitWallet, creditWallet } =
        await getTransferWallets(context);

      const input = makeInput(
        context,
        debitWallet.id,
        creditWallet.id,
        { amountSatang: 1n },
      );

      const result = await post(input);

      const transaction = await prisma.ledgerTransaction.findUnique({
        where: { id: result.ledgerTransactionId },
        include: { entries: true },
      });

      expect(transaction?.entries).toHaveLength(2);

      const debitEntries = transaction!.entries.filter(
        (entry) => entry.entryType === "DEBIT",
      );
      const creditEntries = transaction!.entries.filter(
        (entry) => entry.entryType === "CREDIT",
      );

      expect(debitEntries).toHaveLength(1);
      expect(creditEntries).toHaveLength(1);

      expect(debitEntries[0]).toMatchObject({
        walletId: debitWallet.id,
        amountSatang: 1n,
        currency: CURRENCY,
      });

      expect(creditEntries[0]).toMatchObject({
        walletId: creditWallet.id,
        amountSatang: 1n,
        currency: CURRENCY,
      });

      expect(
        debitEntries.reduce((sum, entry) => sum + entry.amountSatang, 0n),
      ).toBe(
        creditEntries.reduce((sum, entry) => sum + entry.amountSatang, 0n),
      );
    });
  });

  it("LED-03 updates both wallet balance projections exactly once", async () => {
    await withContext(async (context) => {
      const { debitWallet, creditWallet } =
        await getTransferWallets(context);

      const amountSatang = 1n;
      const input = makeInput(
        context,
        debitWallet.id,
        creditWallet.id,
        { amountSatang },
      );

      await post(input);

      const [debitAfter, creditAfter] = await Promise.all([
        prisma.wallet.findUniqueOrThrow({
          where: { id: debitWallet.id },
          select: { balanceSatang: true },
        }),
        prisma.wallet.findUniqueOrThrow({
          where: { id: creditWallet.id },
          select: { balanceSatang: true },
        }),
      ]);

      expect(debitAfter.balanceSatang).toBe(
        debitWallet.balanceSatang - amountSatang,
      );
      expect(creditAfter.balanceSatang).toBe(
        creditWallet.balanceSatang + amountSatang,
      );
    });
  });

  it.each([0n, -1n])(
    "LED-04 rejects a non-positive transfer amount (%s)",
    async (amountSatang) => {
      await withContext(async (context) => {
        const { debitWallet, creditWallet } =
          await getTransferWallets(context);

        const input = makeInput(
          context,
          debitWallet.id,
          creditWallet.id,
          { amountSatang },
        );

        await expect(post(input)).rejects.toThrow();
        await expectNoTransaction(input.idempotencyKey);
      });
    },
  );

  it("LED-05 rejects a transfer from a wallet to itself", async () => {
    await withContext(async (context) => {
      const { debitWallet } = await getTransferWallets(context);

      const input = makeInput(
        context,
        debitWallet.id,
        debitWallet.id,
      );

      await expect(post(input)).rejects.toThrow();
      await expectNoTransaction(input.idempotencyKey);
    });
  });

  it("LED-06 rejects a transfer when either wallet does not exist", async () => {
    await withContext(async (context) => {
      const { creditWallet } = await getTransferWallets(context);

      const input = makeInput(
        context,
        randomUUID(),
        creditWallet.id,
      );

      await expect(post(input)).rejects.toThrow();
      await expectNoTransaction(input.idempotencyKey);
    });
  });

  it("LED-07 rejects a transfer involving an inactive wallet", async () => {
    await withContext(async (context) => {
      const { debitWallet, creditWallet } =
        await getTransferWallets(context);

      const originalStatus = debitWallet.status;

      try {
        await prisma.wallet.update({
          where: { id: debitWallet.id },
          data: { status: "CLOSED" },
        });

        const input = makeInput(
          context,
          debitWallet.id,
          creditWallet.id,
        );

        await expect(post(input)).rejects.toThrow();
        await expectNoTransaction(input.idempotencyKey);
      } finally {
        await prisma.wallet.update({
          where: { id: debitWallet.id },
          data: { status: originalStatus },
        });
      }
    });
  });

  it("LED-08 rejects a transfer exceeding the debit wallet balance", async () => {
    await withContext(async (context) => {
      const { debitWallet, creditWallet } =
        await getTransferWallets(context);

      const input = makeInput(
        context,
        debitWallet.id,
        creditWallet.id,
        {
          amountSatang: debitWallet.balanceSatang + 1n,
        },
      );

      await expect(post(input)).rejects.toThrow();
      await expectNoTransaction(input.idempotencyKey);

      const debitAfter = await prisma.wallet.findUniqueOrThrow({
        where: { id: debitWallet.id },
        select: { balanceSatang: true },
      });

      expect(debitAfter.balanceSatang).toBe(debitWallet.balanceSatang);
    });
  });

  it("LED-09 returns the original posting for an identical idempotent retry", async () => {
    await withContext(async (context) => {
      const { debitWallet, creditWallet } =
        await getTransferWallets(context);

      const input = makeInput(
        context,
        debitWallet.id,
        creditWallet.id,
        { amountSatang: 1n },
      );

      const firstResult = await post(input);
      const balancesAfterFirstPost = await Promise.all([
        prisma.wallet.findUniqueOrThrow({
          where: { id: debitWallet.id },
          select: { balanceSatang: true },
        }),
        prisma.wallet.findUniqueOrThrow({
          where: { id: creditWallet.id },
          select: { balanceSatang: true },
        }),
      ]);

      const retryResult = await post(input);

      expect(retryResult).toEqual({
        ledgerTransactionId: firstResult.ledgerTransactionId,
        amountSatang: firstResult.amountSatang,
        reused: true,
      });

      const balancesAfterRetry = await Promise.all([
        prisma.wallet.findUniqueOrThrow({
          where: { id: debitWallet.id },
          select: { balanceSatang: true },
        }),
        prisma.wallet.findUniqueOrThrow({
          where: { id: creditWallet.id },
          select: { balanceSatang: true },
        }),
      ]);

      expect(balancesAfterRetry).toEqual(balancesAfterFirstPost);

      const matchingTransactions =
        await prisma.ledgerTransaction.count({
          where: { idempotencyKey: input.idempotencyKey },
        });

      expect(matchingTransactions).toBe(1);
    });
  });

  it("LED-10 rejects reuse of an idempotency key for a different operation", async () => {
    await withContext(async (context) => {
      const { debitWallet, creditWallet } =
        await getTransferWallets(context);

      const input = makeInput(
        context,
        debitWallet.id,
        creditWallet.id,
        { amountSatang: 1n },
      );

      const firstResult = await post(input);

      const conflictingInput = {
        ...input,
        transactionType: "DIFFERENT_OPERATION",
      };

      await expect(post(conflictingInput)).rejects.toThrow();

      const transactionCount = await prisma.ledgerTransaction.count({
        where: { idempotencyKey: input.idempotencyKey },
      });

      expect(transactionCount).toBe(1);

      const transaction = await prisma.ledgerTransaction.findUniqueOrThrow({
        where: { id: firstResult.ledgerTransactionId },
      });

      expect(transaction.transactionType).toBe(input.transactionType);
    });
  });

  it("LED-11 rolls back the posting when the caller's transaction fails", async () => {
    await withContext(async (context) => {
      const { debitWallet, creditWallet } =
        await getTransferWallets(context);

      const input = makeInput(
        context,
        debitWallet.id,
        creditWallet.id,
        { amountSatang: 1n },
      );

      await expect(
        prisma.$transaction(
          async (tx) => {
            await postWalletTransfer(tx, input);

            throw new Error("Simulated business-record failure");
          },
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
          },
        ),
      ).rejects.toThrow("Simulated business-record failure");

      await expectNoTransaction(input.idempotencyKey);

      const [debitAfter, creditAfter] = await Promise.all([
        prisma.wallet.findUniqueOrThrow({
          where: { id: debitWallet.id },
          select: { balanceSatang: true },
        }),
        prisma.wallet.findUniqueOrThrow({
          where: { id: creditWallet.id },
          select: { balanceSatang: true },
        }),
      ]);

      expect(debitAfter.balanceSatang).toBe(debitWallet.balanceSatang);
      expect(creditAfter.balanceSatang).toBe(creditWallet.balanceSatang);
    });
  });


  it("LED-12 rejects reuse of an idempotency key with a different reference ID", async () => {
    await withContext(async (context) => {
      const { debitWallet, creditWallet } =
        await getTransferWallets(context);

      const input = makeInput(context, debitWallet.id, creditWallet.id);
      await post(input);

      const conflictingInput = {
        ...input,
        referenceId: randomUUID(),
      };

      await expect(post(conflictingInput)).rejects.toThrow();

      const original = await prisma.ledgerTransaction.findUniqueOrThrow({
        where: { idempotencyKey: input.idempotencyKey },
      });

      expect(original.referenceId).toBe(input.referenceId);
    });
  });

  it("LED-13 rejects reuse of an idempotency key with a different reference type", async () => {
    await withContext(async (context) => {
      const { debitWallet, creditWallet } =
        await getTransferWallets(context);

      const input = makeInput(context, debitWallet.id, creditWallet.id);
      await post(input);

      await expect(
        post({
          ...input,
          referenceType: "DIFFERENT_REFERENCE",
        }),
      ).rejects.toThrow();

      const count = await prisma.ledgerTransaction.count({
        where: { idempotencyKey: input.idempotencyKey },
      });

      expect(count).toBe(1);
    });
  });

  it("LED-14 rejects reuse of an idempotency key with a different debit wallet", async () => {
    await withContext(async (context) => {
      const { debitWallet, creditWallet } =
        await getTransferWallets(context);

      const alternateDebitWallet = await prisma.wallet.findUnique({
        where: { ownerUserId: context.investorUser.id },
        select: { id: true },
      });

      if (!alternateDebitWallet) {
        throw new Error("Expected the alternate investor wallet to exist.");
      }

      expect(alternateDebitWallet.id).not.toBe(debitWallet.id);

      const input = makeInput(context, debitWallet.id, creditWallet.id);
      await post(input);

      await expect(
        post({
          ...input,
          debitWalletId: alternateDebitWallet.id,
        }),
      ).rejects.toThrow();

      const count = await prisma.ledgerTransaction.count({
        where: { idempotencyKey: input.idempotencyKey },
      });

      expect(count).toBe(1);
    });
  });


  it("LED-15 rejects reuse of an idempotency key with a different credit wallet", async () => {
    await withContext(async (context) => {
      const { debitWallet, creditWallet } =
        await getTransferWallets(context);

      const temporaryAccount = await prisma.platformAccount.create({
        data: {
          accountCode: `TEST-${randomUUID()}`,
          accountName: "Temporary LED-15 Test Account",
          accountType: "LIABILITY",
          currency: "THB",
          status: "ACTIVE",
        },
      });

      let temporaryWalletId: string | undefined;

      try {
        const temporaryWallet = await prisma.wallet.create({
          data: {
            ownerPlatformAccountId: temporaryAccount.id,
            currency: "THB",
            balanceSatang: 0n,
            status: "ACTIVE",
          },
          select: { id: true },
        });

        temporaryWalletId = temporaryWallet.id;

        const input = makeInput(
          context,
          debitWallet.id,
          creditWallet.id,
          { amountSatang: 1n },
        );

        await post(input);

        await expect(
          post({
            ...input,
            creditWalletId: temporaryWallet.id,
          }),
        ).rejects.toThrow();

        const original = await prisma.ledgerTransaction.findUniqueOrThrow({
          where: { idempotencyKey: input.idempotencyKey },
          include: { entries: true },
        });

        expect(original.entries).toHaveLength(2);
        expect(
          original.entries.some(
            (entry) => entry.walletId === creditWallet.id,
          ),
        ).toBe(true);

        expect(
          original.entries.some(
            (entry) => entry.walletId === temporaryWallet.id,
          ),
        ).toBe(false);

        expect(
          await prisma.ledgerTransaction.count({
            where: { idempotencyKey: input.idempotencyKey },
          }),
        ).toBe(1);
      } finally {
        if (temporaryWalletId) {
          await prisma.wallet.delete({
            where: { id: temporaryWalletId },
          });
        }

        await prisma.platformAccount.delete({
          where: { id: temporaryAccount.id },
        });
      }
    });
  });

  it("LED-16 rejects reuse of an idempotency key with a different amount", async () => {
    await withContext(async (context) => {
      const { debitWallet, creditWallet } =
        await getTransferWallets(context);

      const input = makeInput(
        context,
        debitWallet.id,
        creditWallet.id,
        { amountSatang: 1n },
      );

      await post(input);

      await expect(
        post({
          ...input,
          amountSatang: 2n,
        }),
      ).rejects.toThrow();

      const count = await prisma.ledgerTransaction.count({
        where: { idempotencyKey: input.idempotencyKey },
      });

      expect(count).toBe(1);
    });
  });


  it("LED-17 prevents concurrent transfers from overdrawing the debit wallet", async () => {
    await withContext(async (context) => {
      const { debitWallet, creditWallet } =
        await getTransferWallets(context);

      const initialDebitBalance = debitWallet.balanceSatang;
      const initialCreditBalance = creditWallet.balanceSatang;

      expect(initialDebitBalance).toBeGreaterThan(0n);

      const amountSatang = initialDebitBalance / 2n + 1n;

      const firstInput = makeInput(
        context,
        debitWallet.id,
        creditWallet.id,
        { amountSatang },
      );

      const secondInput = makeInput(
        context,
        debitWallet.id,
        creditWallet.id,
        { amountSatang },
      );

      const results = await Promise.allSettled([
        post(firstInput),
        post(secondInput),
      ]);

      const successful = results.filter(
        (result) => result.status === "fulfilled",
      );

      expect(successful).toHaveLength(1);

      const [debitAfter, creditAfter] = await Promise.all([
        prisma.wallet.findUniqueOrThrow({
          where: { id: debitWallet.id },
          select: { balanceSatang: true },
        }),
        prisma.wallet.findUniqueOrThrow({
          where: { id: creditWallet.id },
          select: { balanceSatang: true },
        }),
      ]);

      expect(debitAfter.balanceSatang).toBeGreaterThanOrEqual(0n);
      expect(debitAfter.balanceSatang).toBe(
        initialDebitBalance - amountSatang,
      );
      expect(creditAfter.balanceSatang).toBe(
        initialCreditBalance + amountSatang,
      );

      const postedCount = await prisma.ledgerTransaction.count({
        where: {
          idempotencyKey: {
            in: [firstInput.idempotencyKey, secondInput.idempotencyKey],
          },
          status: "POSTED",
        },
      });

      expect(postedCount).toBe(1);
    });
  });


  it("LED-18 returns the same posting for concurrent requests with the same idempotency key", async () => {
    await withContext(async (context) => {
      const { debitWallet, creditWallet } =
        await getTransferWallets(context);

      const input = makeInput(
        context,
        debitWallet.id,
        creditWallet.id,
        { amountSatang: 1n },
      );

      const results = await Promise.all([
        post(input),
        post(input),
      ]);

      expect(results[0].ledgerTransactionId).toBe(
        results[1].ledgerTransactionId,
      );

      expect(results.map((result) => result.reused).sort()).toEqual([
        false,
        true,
      ]);

      const transactionCount = await prisma.ledgerTransaction.count({
        where: { idempotencyKey: input.idempotencyKey },
      });

      expect(transactionCount).toBe(1);

      const debitAfter = await prisma.wallet.findUniqueOrThrow({
        where: { id: debitWallet.id },
        select: { balanceSatang: true },
      });

      expect(debitAfter.balanceSatang).toBe(
        debitWallet.balanceSatang - 1n,
      );
    });
  });

});
