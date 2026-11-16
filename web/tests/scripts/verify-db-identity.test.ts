import {describe, it, expect,vi,beforeEach,afterEach} from "vitest";
import {createHash} from "node:crypto";

const { queryRawMock, disconnectMock } = vi.hoisted(() => ({
    queryRawMock: vi.fn(),
    disconnectMock: vi.fn(),
}));

vi.mock("../../src/lib/prisma", () => ({
    prisma: {
        $queryRaw: queryRawMock,
        $disconnect: disconnectMock,
    },
}));

import { verifyDbIdentity } from "../../scripts/verify-db-identity";

const expectedIdentity = {
    database: "postgres",
    databaseOid: "5",
    serverAddress: "10.0.65.241/32",
    serverPort: 5432,
    serverStartTime: "2026-11-03 06:51:09.841244+00",
};

describe("verifyDbIdentity", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        queryRawMock.mockResolvedValue([expectedIdentity]);
        disconnectMock.mockResolvedValue(undefined);

        vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("retrieves and returns database identity", async () => {
        const result = await verifyDbIdentity();

        expect(queryRawMock).toHaveBeenCalledTimes(1);

        expect(result.identity).toEqual(expectedIdentity);

        expect(disconnectMock).toHaveBeenCalledTimes(1);
    });

    it("generates the correct SHA-256 fingerprint", async () => {
        const result = await verifyDbIdentity();

        const expectedFingerprint = createHash("sha256")
            .update(JSON.stringify(expectedIdentity))
            .digest("hex");

        expect(result.fingerprint).toBe(expectedFingerprint);
    });

    it("logs the database identity and fingerprint", async () => {
        const logSpy = vi.spyOn(console, "log");

        await verifyDbIdentity();

        expect(logSpy).toHaveBeenCalledWith(expectedIdentity);

        expect(logSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                database: expectedIdentity.database,
                databaseOid: expectedIdentity.databaseOid,
                serverAddress: expectedIdentity.serverAddress,
                serverPort: expectedIdentity.serverPort,
                serverStartTime: expectedIdentity.serverStartTime,
                fingerprint: expect.any(String),
            }),
        );
    });

    it("throws an error when the identity query returns no records", async () => {
        queryRawMock.mockResolvedValue([]);

        await expect(verifyDbIdentity()).rejects.toThrow(
            "Database identity query returned no rows.",
        );

        expect(disconnectMock).toHaveBeenCalledTimes(1);
    });

    it("propagates database query errors", async () => {
        queryRawMock.mockRejectedValue(
            new Error("Database connection failed"),
        );

        await expect(verifyDbIdentity()).rejects.toThrow(
            "Database connection failed",
        );

        expect(disconnectMock).toHaveBeenCalledTimes(1);
    });

    it("disconnects Prisma after a successful query", async () => {
        await verifyDbIdentity();

        expect(disconnectMock).toHaveBeenCalledTimes(1);
    });

    it("disconnects Prisma even when the query fails", async () => {
        queryRawMock.mockRejectedValue(
            new Error("Database query failed"),
        );

        await expect(verifyDbIdentity()).rejects.toThrow(
            "Database query failed",
        );

        expect(disconnectMock).toHaveBeenCalledTimes(1);
    });
});