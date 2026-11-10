import { describe, it, expect, vi, beforeEach } from "vitest";

const { findUniqueMock, createMock, transactionMock } = vi.hoisted(() => ({
    findUniqueMock: vi.fn(),
    createMock: vi.fn(),
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
        status: "INACTIVE",
    },
    {
        accountCode: "2100",
        accountName: "Shared User-Wallet Control",
        accountType: "LIABILITY",
        currency: "THB",
        status: "INACTIVE",
    },
    {
        accountCode: "2200",
        accountName: "Simulated Escrow",
        accountType: "LIABILITY",
        currency: "THB",
        status: "INACTIVE",
    },
    {
        accountCode: "2300",
        accountName: "Repayment Clearing",
        accountType: "LIABILITY",
        currency: "THB",
        status: "INACTIVE",
    },
];

describe("seedPlatformAccounts", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        findUniqueMock.mockResolvedValue(null);
        createMock.mockResolvedValue({});

        transactionMock.mockImplementation(async (callback) =>
            callback({
                platformAccount: {
                    findUnique: findUniqueMock,
                    create: createMock,
                },
            }),
        );
    });

    it("creates all four approved platform accounts", async () => {
        await seedPlatformAccounts();

        expect(transactionMock).toHaveBeenCalledTimes(1);
        expect(findUniqueMock).toHaveBeenCalledTimes(4);
        expect(createMock).toHaveBeenCalledTimes(4);

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

    it("skips existing matching accounts", async () => {
        findUniqueMock.mockImplementation(async ({ where }) => {
            const account = expectedAccounts.find(
                (item) => item.accountCode === where.accountCode,
            );

            return account ?? null;
        });

        await seedPlatformAccounts();

        expect(findUniqueMock).toHaveBeenCalledTimes(4);
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

        expect(createMock).toHaveBeenCalledTimes(4);

        await seedPlatformAccounts();

        expect(createMock).toHaveBeenCalledTimes(4);
        expect(findUniqueMock).toHaveBeenCalledTimes(8);
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

    it("does not create an account when its status conflicts", async () => {
        findUniqueMock.mockResolvedValue({
            ...expectedAccounts[0],
            status: "ACTIVE",
        });

        await expect(seedPlatformAccounts()).rejects.toThrow(
            "PlatformAccount conflict for code 1200",
        );

        expect(createMock).not.toHaveBeenCalled();
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