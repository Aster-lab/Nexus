import { describe, it, expect, vi, beforeEach } from "vitest";

const { findUniqueMock, createMock, updateMock, walletUpsertMock, transactionMock } = vi.hoisted(() => ({
    findUniqueMock: vi.fn(),
    createMock: vi.fn(),
    updateMock: vi.fn(),
    walletUpsertMock: vi.fn(),
    transactionMock: vi.fn(),
}));

vi.mock("../../src/lib/prisma", () => ({
    prisma: {
        $transaction: transactionMock,
    },
}));

import { seedPlatformAccounts } from "../../prisma/seed/platform-accounts.seed";

const expectedAccounts = [
    {
        accountCode: "1200",
        accountName: "Simulated Loan Principal Receivable",
        accountType: "ASSET",
        currency: "THB",
        status: "ACTIVE",
    },
    {
        accountCode: "2100",
        accountName: "Shared User-Wallet Control",
        accountType: "LIABILITY",
        currency: "THB",
        status: "ACTIVE",
    },
    {
        accountCode: "2200",
        accountName: "Simulated Escrow",
        accountType: "LIABILITY",
        currency: "THB",
        status: "ACTIVE",
    },
    {
        accountCode: "2300",
        accountName: "Repayment Clearing",
        accountType: "LIABILITY",
        currency: "THB",
        status: "ACTIVE",
    },
    {
        accountCode: "1300",
        accountName: "Simulated Opening Balance Asset",
        accountType: "ASSET",
        currency : "THB",
        status: "ACTIVE",
    }
];

describe("seedPlatformAccounts", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        findUniqueMock.mockResolvedValue(null);
        createMock.mockImplementation(async ({ data }) => ({ id: `id-${data.accountCode}`, ...data }));
        updateMock.mockImplementation(async ({ where, data }) => ({ id: where.id, ...data }));
        walletUpsertMock.mockResolvedValue({});

        transactionMock.mockImplementation(async (callback) =>
            callback({
                platformAccount: {
                    findUnique: findUniqueMock,
                    create: createMock,
                    update: updateMock,
                },
                wallet: { upsert: walletUpsertMock },
            }),
        );
    });

    it("creates all five approved platform accounts", async () => {
        await seedPlatformAccounts();

        expect(transactionMock).toHaveBeenCalledTimes(1);
        expect(findUniqueMock).toHaveBeenCalledTimes(5);
        expect(createMock).toHaveBeenCalledTimes(5);

        for (const account of expectedAccounts) {
            expect(createMock).toHaveBeenCalledWith({
                data: account,
            });
        }
    });

    it("uses the approved account codes and classifications", async () => {
        await seedPlatformAccounts();

        const createdAccounts = createMock.mock.calls.map(
            ([args]) => args.data,
        );

        expect(createdAccounts).toEqual(expectedAccounts);
    });

    it("activates the approved opening balance asset", async () => {
        await seedPlatformAccounts();

        const openingBalanceAccount = createMock.mock.calls
            .map(([args]) => args.data)
            .find((account) => account.accountCode === "1300");

        expect(openingBalanceAccount).toEqual({
            accountCode: "1300",
            accountName: "Simulated Opening Balance Asset",
            accountType: "ASSET",
            currency: "THB",
            status: "ACTIVE",
        });
    });

    it("provisions zero-balance wallets for the active escrow and clearing accounts", async () => {
        await seedPlatformAccounts();

        expect(walletUpsertMock).toHaveBeenCalledTimes(2);
        expect(walletUpsertMock).toHaveBeenCalledWith({
            where: { ownerPlatformAccountId: "id-2200" },
            create: { ownerPlatformAccountId: "id-2200", currency: "THB", balanceSatang: 0n, status: "ACTIVE" },
            update: {},
        });
        expect(walletUpsertMock).toHaveBeenCalledWith({
            where: { ownerPlatformAccountId: "id-2300" },
            create: { ownerPlatformAccountId: "id-2300", currency: "THB", balanceSatang: 0n, status: "ACTIVE" },
            update: {},
        });
    });

    it("skips existing matching accounts", async () => {
        findUniqueMock.mockImplementation(async ({ where }) => {
            const account = expectedAccounts.find(
                (item) => item.accountCode === where.accountCode,
            );

            return account ?? null;
        });

        await seedPlatformAccounts();

        expect(findUniqueMock).toHaveBeenCalledTimes(5);
        expect(createMock).not.toHaveBeenCalled();
    });

    it("does not create duplicate accounts when run repeatedly", async () => {
        const database = new Map(
            expectedAccounts.map((account) => [
                account.accountCode,
                null,
            ]),
        );

        findUniqueMock.mockImplementation(async ({ where }) => {
            return database.get(where.accountCode) ?? null;
        });

        createMock.mockImplementation(async ({ data }) => {
            database.set(data.accountCode, data);
            return data;
        });

        await seedPlatformAccounts();

        expect(createMock).toHaveBeenCalledTimes(5);

        await seedPlatformAccounts();

        expect(createMock).toHaveBeenCalledTimes(5);
        expect(findUniqueMock).toHaveBeenCalledTimes(10);
    });

    it("throws an error when an existing account has different details", async () => {
        findUniqueMock.mockImplementation(async ({ where }) => {
            if (where.accountCode === "1200") {
                return {
                    ...expectedAccounts[0],
                    accountName: "Incorrect Account Name",
                };
            }

            return null;
        });

        await expect(seedPlatformAccounts()).rejects.toThrow(
            "PlatformAccount conflict for code 1200",
        );

        expect(createMock).not.toHaveBeenCalled();
    });

    it("does not create an account when its type conflicts", async () => {
        findUniqueMock.mockResolvedValue({
            ...expectedAccounts[0],
            accountType: "LIABILITY",
        });

        await expect(seedPlatformAccounts()).rejects.toThrow(
            "PlatformAccount conflict for code 1200",
        );

        expect(createMock).not.toHaveBeenCalled();
    });

    it("does not create an account when its currency conflicts", async () => {
        findUniqueMock.mockResolvedValue({
            ...expectedAccounts[0],
            currency: "USD",
        });

        await expect(seedPlatformAccounts()).rejects.toThrow(
            "PlatformAccount conflict for code 1200",
        );

        expect(createMock).not.toHaveBeenCalled();
    });

    it("reactivates required financial control accounts while preserving optional account statuses", async () => {
        findUniqueMock.mockImplementation(async ({ where }) => {
            if (["1200", "2100", "1300"].includes(where.accountCode)) {
                return {
                    ...expectedAccounts.find((account) => account.accountCode === where.accountCode),
                    id: `existing-${where.accountCode}`,
                    status: "INACTIVE",
                };
            }
            return null;
        });

        await expect(seedPlatformAccounts()).resolves.toBeUndefined();
        expect(updateMock).toHaveBeenCalledTimes(3);
        expect(updateMock).toHaveBeenCalledWith({ where: { id: "existing-1200" }, data: { status: "ACTIVE" } });
        expect(updateMock).toHaveBeenCalledWith({ where: { id: "existing-2100" }, data: { status: "ACTIVE" } });
        expect(updateMock).toHaveBeenCalledWith({ where: { id: "existing-1300" }, data: { status: "ACTIVE" } });
        expect(createMock).toHaveBeenCalledTimes(2);
    });

    it("propagates database errors", async () => {
        const databaseError = new Error("Database connection failed");

        findUniqueMock.mockRejectedValue(databaseError);

        await expect(seedPlatformAccounts()).rejects.toThrow(
            "Database connection failed",
        );
    });

    it("uses a Prisma transaction for all account operations", async () => {
        await seedPlatformAccounts();

        expect(transactionMock).toHaveBeenCalledTimes(1);
    });
});
