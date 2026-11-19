
import { randomUUID } from "node:crypto";
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "vitest";

import { prisma } from "../../src/lib/prisma";
import { createOpeningBalance } from "../../src/lib/services/opening-balance.service";

const SOURCE_ACCOUNT_CODE = "1300";
const CURRENCY = "THB";
const TEST_AMOUNT = 250_000n;

let administratorUserId: string;
let adminRoleId: string;
let sourceAccountId: string;
let originalSourceAccountStatus: "ACTIVE" | "INACTIVE";

function uniqueEmail(prefix: string): string {
  return `nexus-test-${prefix}-${randomUUID()}@example.test`;
}

async function createUser(emailPrefix: string) {
  return prisma.user.create({
    data: {
      email: uniqueEmail(emailPrefix),
      accountStatus: "ACTIVE",
    },
  });
}

async function createAdministrator() {
  const user = await createUser("admin");

  await prisma.userRole.create({
    data: {
      userId: user.id,
      roleId: adminRoleId,
      grantReason: "Opening balance integration test",
    },
  });

  return user;
}

async function createBorrowerWallet() {
  const user = await createUser("borrower");

  await prisma.borrowerProfile.create({
    data: {
      userId: user.id,
      legalName: "NEXUS Test Borrower",
      address: {
        street: "1 Test Road",
        city: "Bangkok",
        country: "Thailand",
      },
    },
  });

  const wallet = await prisma.wallet.create({
    data: {
      ownerUserId: user.id,
      currency: CURRENCY,
      balanceSatang: 0n,
      status: "ACTIVE",
    },
  });

  return { user, wallet };
}

function openingBalanceInput(
  walletId: string,
  overrides: Partial<{
    administratorUserId: string;
    amountSatang: bigint;
    idempotencyKey: string;
    reason: string;
  }> = {},
) {
  return {
    administratorUserId:
      overrides.administratorUserId ?? administratorUserId,
    walletId,
    amountSatang: overrides.amountSatang ?? TEST_AMOUNT,
    idempotencyKey:
      overrides.idempotencyKey ?? `opening-${randomUUID()}`,
    reason:
      overrides.reason ?? "Initial simulated wallet funding",
  };
}

beforeAll(async () => {
  const [adminRole, sourceAccount] = await Promise.all([
    prisma.role.findUnique({
      where: { code: "ADMIN" },
    }),
    prisma.platformAccount.findUnique({
      where: { accountCode: SOURCE_ACCOUNT_CODE },
    }),
  ]);

  if (!adminRole) {
    throw new Error("Seeded ADMIN role was not found in the test database.");
  }

  if (!sourceAccount) {
    throw new Error("Seeded platform account 1300 was not found.");
  }

  if (
    sourceAccount.accountType !== "ASSET" ||
    sourceAccount.currency !== CURRENCY
  ) {
    throw new Error("Platform account 1300 has an unexpected configuration.");
  }

  adminRoleId = adminRole.id;
  sourceAccountId = sourceAccount.id;
  originalSourceAccountStatus = sourceAccount.status;

  const administrator = await createAdministrator();
  administratorUserId = administrator.id;

  await prisma.platformAccount.update({
    where: { id: sourceAccountId },
    data: { status: "ACTIVE" },
  });
});

afterAll(async () => {
  if (sourceAccountId) {
    await prisma.platformAccount.update({
      where: { id: sourceAccountId },
      data: { status: originalSourceAccountStatus },
    });
  }
});

describe("createOpeningBalance", () => {
  it("posts a balanced opening balance and creates an audit record", async () => {
    const { user, wallet } = await createBorrowerWallet();
    const input = openingBalanceInput(wallet.id);

    const result = await createOpeningBalance(input);

    const [openingBalance, updatedWallet, auditLog] = await Promise.all([
      prisma.openingBalance.findUnique({
        where: { id: result.id },
      }),
      prisma.wallet.findUniqueOrThrow({
        where: { id: wallet.id },
      }),
      prisma.auditLog.findFirst({
        where: {
          actorUserId: administratorUserId,
          targetId: result.id,
        },
      }),
    ]);

    expect(openingBalance).not.toBeNull();
    expect(openingBalance?.walletId).toBe(wallet.id);
    expect(openingBalance?.administratorUserId).toBe(administratorUserId);
    expect(openingBalance?.amountSatang).toBe(TEST_AMOUNT);
    expect(openingBalance?.currency).toBe(CURRENCY);

    expect(updatedWallet.balanceSatang).toBe(TEST_AMOUNT);

    expect(auditLog).not.toBeNull();
    expect(auditLog?.outcome).toBe("SUCCESS");
    expect(auditLog?.action).toBe("OPENING_BALANCE_POSTED");

    const entries = await prisma.ledgerEntry.findMany({
      where: {
        ledgerTransactionId: openingBalance!.ledgerTransactionId,
      },
    });

    expect(entries).toHaveLength(2);

    expect(
      entries.find((entry) => entry.platformAccountId === sourceAccountId),
    ).toMatchObject({
      entryType: "DEBIT",
      amountSatang: TEST_AMOUNT,
      currency: CURRENCY,
    });

    expect(
      entries.find((entry) => entry.walletId === wallet.id),
    ).toMatchObject({
      entryType: "CREDIT",
      amountSatang: TEST_AMOUNT,
      currency: CURRENCY,
    });

    const ledgerTransaction =
      await prisma.ledgerTransaction.findUniqueOrThrow({
        where: { id: openingBalance!.ledgerTransactionId },
      });

    expect(ledgerTransaction.status).toBe("POSTED");
    expect(ledgerTransaction.postedAt).not.toBeNull();

    expect(user.accountStatus).toBe("ACTIVE");
  });

  it("returns the existing result for an identical idempotent retry", async () => {
    const { wallet } = await createBorrowerWallet();
    const input = openingBalanceInput(wallet.id);

    const first = await createOpeningBalance(input);
    const second = await createOpeningBalance(input);

    expect(second.id).toBe(first.id);

    const [openingCount, ledgerCount] = await Promise.all([
      prisma.openingBalance.count({
        where: { walletId: wallet.id },
      }),
      prisma.ledgerTransaction.count({
        where: { idempotencyKey: input.idempotencyKey },
      }),
    ]);

    expect(openingCount).toBe(1);
    expect(ledgerCount).toBe(1);
  });

  it("rejects reuse of an idempotency key with different details", async () => {
    const { wallet } = await createBorrowerWallet();
    const input = openingBalanceInput(wallet.id);

    await createOpeningBalance(input);

    await expect(
      createOpeningBalance({
        ...input,
        amountSatang: TEST_AMOUNT + 1n,
      }),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
  });

  it("rejects a second opening balance for the same wallet", async () => {
    const { wallet } = await createBorrowerWallet();

    await createOpeningBalance(openingBalanceInput(wallet.id));

    await expect(
      createOpeningBalance(
        openingBalanceInput(wallet.id),
      ),
    ).rejects.toMatchObject({
      code: "OPENING_BALANCE_ALREADY_EXISTS",
    });

    const count = await prisma.openingBalance.count({
      where: { walletId: wallet.id },
    });

    expect(count).toBe(1);
  });

  it("rejects a user without the ADMIN role", async () => {
    const unauthorizedUser = await createUser("unauthorized");
    const { wallet } = await createBorrowerWallet();

    await expect(
      createOpeningBalance(
        openingBalanceInput(wallet.id, {
          administratorUserId: unauthorizedUser.id,
        }),
      ),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  it("rejects an administrator funding their own wallet", async () => {
    const wallet = await prisma.wallet.create({
      data: {
        ownerUserId: administratorUserId,
        currency: CURRENCY,
        balanceSatang: 0n,
        status: "ACTIVE",
      },
    });

    await expect(
      createOpeningBalance(openingBalanceInput(wallet.id)),
    ).rejects.toMatchObject({
      code: "SELF_FUNDING_NOT_ALLOWED",
    });

    expect(
      await prisma.openingBalance.count({
        where: { walletId: wallet.id },
      }),
    ).toBe(0);
  });

  it("rejects a zero or negative opening balance", async () => {
    const { wallet } = await createBorrowerWallet();

    for (const amountSatang of [0n, -1n]) {
      await expect(
        createOpeningBalance(
          openingBalanceInput(wallet.id, { amountSatang }),
        ),
      ).rejects.toMatchObject({
        code: "INVALID_INPUT",
      });
    }

    expect(
      await prisma.openingBalance.count({
        where: { walletId: wallet.id },
      }),
    ).toBe(0);
  });

  it("rejects posting when source account 1300 is inactive", async () => {
    const { wallet } = await createBorrowerWallet();

    await prisma.platformAccount.update({
      where: { id: sourceAccountId },
      data: { status: "INACTIVE" },
    });

    try {
      await expect(
        createOpeningBalance(openingBalanceInput(wallet.id)),
      ).rejects.toMatchObject({
        code: "SOURCE_ACCOUNT_UNAVAILABLE",
      });

      expect(
        await prisma.openingBalance.count({
          where: { walletId: wallet.id },
        }),
      ).toBe(0);
    } finally {
      await prisma.platformAccount.update({
        where: { id: sourceAccountId },
        data: { status: "ACTIVE" },
      });
    }
  });

  it("allows only one concurrent opening balance for a wallet", async () => {
    const { wallet } = await createBorrowerWallet();

    const results = await Promise.allSettled([
      createOpeningBalance(openingBalanceInput(wallet.id)),
      createOpeningBalance(openingBalanceInput(wallet.id)),
    ]);

    const fulfilled = results.filter(
      (result) => result.status === "fulfilled",
    );

    expect(fulfilled).toHaveLength(1);

    expect(
      await prisma.openingBalance.count({
        where: { walletId: wallet.id },
      }),
    ).toBe(1);

    const updatedWallet = await prisma.wallet.findUniqueOrThrow({
      where: { id: wallet.id },
    });

    expect(updatedWallet.balanceSatang).toBe(TEST_AMOUNT);
  });
});
