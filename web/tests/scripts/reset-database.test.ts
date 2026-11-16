
import {
    describe,
    it,
    expect,
    vi,
    beforeEach,
    afterEach,
} from "vitest";
import { createHash } from "node:crypto";

import { resetDatabase } from "../../scripts/reset-database";

const databaseUrl = "postgresql://test:test@localhost:5432/nexus_test";

const fingerprint = createHash("sha256")
    .update(databaseUrl)
    .digest("hex");

const validTestEnvironment = {
    DATABASE_ENV: "test",
    DATABASE_URL: databaseUrl,
    DATABASE_URL_SHA256: fingerprint,
};

const validDevelopmentEnvironment = {
    DATABASE_ENV: "development",
    DATABASE_URL: databaseUrl,
    DATABASE_URL_SHA256: fingerprint,
};

const confirmMock = vi.fn();
const runCommandMock = vi.fn();

const dependencies = {
    confirm: confirmMock,
    runCommand: runCommandMock,
};

describe("resetDatabase", () => {
    beforeEach(() => {
        vi.clearAllMocks();

        confirmMock.mockResolvedValue("test");
        runCommandMock.mockReturnValue(undefined);

        vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it("rejects an unsupported environment", async () => {
        await expect(
            resetDatabase(
                "production",
                ["--confirm-reset"],
                validTestEnvironment,
                dependencies,
            ),
        ).rejects.toThrow("Specify development or test.");

        expect(confirmMock).not.toHaveBeenCalled();
        expect(runCommandMock).not.toHaveBeenCalled();
    });

    it("rejects a reset without --confirm-reset", async () => {
        await expect(
            resetDatabase(
                "test",
                [],
                validTestEnvironment,
                dependencies,
            ),
        ).rejects.toThrow(
            "Reset blocked: --confirm-reset is required.",
        );

        expect(confirmMock).not.toHaveBeenCalled();
        expect(runCommandMock).not.toHaveBeenCalled();
    });

    it("requires backup confirmation for development reset", async () => {
        await expect(
            resetDatabase(
                "development",
                ["--confirm-reset"],
                validDevelopmentEnvironment,
                dependencies,
            ),
        ).rejects.toThrow(
            "Development reset blocked: create a backup branch first and pass --backup-confirmed.",
        );

        expect(confirmMock).not.toHaveBeenCalled();
        expect(runCommandMock).not.toHaveBeenCalled();
    });

    it("rejects incomplete database configuration", async () => {
        await expect(
            resetDatabase(
                "test",
                ["--confirm-reset"],
                {},
                dependencies,
            ),
        ).rejects.toThrow(
            "Database environment configuration is incomplete.",
        );

        expect(confirmMock).not.toHaveBeenCalled();
        expect(runCommandMock).not.toHaveBeenCalled();
    });

    it("rejects an environment mismatch", async () => {
        await expect(
            resetDatabase(
                "development",
                ["--confirm-reset", "--backup-confirmed"],
                validTestEnvironment,
                dependencies,
            ),
        ).rejects.toThrow(
            "Environment mismatch. Expected development, received test.",
        );

        expect(confirmMock).not.toHaveBeenCalled();
        expect(runCommandMock).not.toHaveBeenCalled();
    });

    it("rejects a database URL fingerprint mismatch", async () => {
        await expect(
            resetDatabase(
                "test",
                ["--confirm-reset"],
                {
                    ...validTestEnvironment,
                    DATABASE_URL_SHA256: "incorrect-fingerprint",
                },
                dependencies,
            ),
        ).rejects.toThrow("Database URL fingerprint mismatch.");

        expect(confirmMock).not.toHaveBeenCalled();
        expect(runCommandMock).not.toHaveBeenCalled();
    });

    it("cancels when the typed confirmation does not match", async () => {
        confirmMock.mockResolvedValue("development");

        await expect(
            resetDatabase(
                "test",
                ["--confirm-reset"],
                validTestEnvironment,
                dependencies,
            ),
        ).rejects.toThrow("Confirmation mismatch. Reset cancelled.");

        expect(confirmMock).toHaveBeenCalledTimes(1);
        expect(runCommandMock).not.toHaveBeenCalled();
    });

    it("runs migrations before seeding in a test reset", async () => {
        await resetDatabase(
            "test",
            ["--confirm-reset"],
            validTestEnvironment,
            dependencies,
        );

        expect(confirmMock).toHaveBeenCalledWith(
            'This will DELETE database contents. Type "test" to continue: ',
        );

        expect(runCommandMock.mock.calls).toEqual([
            ["npx prisma migrate reset --force"],
            ["npx tsx prisma/seed/index.ts"],
        ]);
    });

    it("allows development reset when backup and reset are confirmed", async () => {
        confirmMock.mockResolvedValue("development");

        await resetDatabase(
            "development",
            ["--confirm-reset", "--backup-confirmed"],
            validDevelopmentEnvironment,
            dependencies,
        );

        expect(confirmMock).toHaveBeenCalledTimes(1);
        expect(runCommandMock.mock.calls).toEqual([
            ["npx prisma migrate reset --force"],
            ["npx tsx prisma/seed/index.ts"],
        ]);
    });

    it("does not seed when migration fails", async () => {
        runCommandMock.mockImplementationOnce(() => {
            throw new Error("Migration failed");
        });

        await expect(
            resetDatabase(
                "test",
                ["--confirm-reset"],
                validTestEnvironment,
                dependencies,
            ),
        ).rejects.toThrow("Migration failed");

        expect(runCommandMock).toHaveBeenCalledTimes(1);
        expect(runCommandMock).toHaveBeenCalledWith(
            "npx prisma migrate reset --force",
        );
    });

    it("propagates seed failures", async () => {
        runCommandMock
            .mockImplementationOnce(() => {})
            .mockImplementationOnce(() => {
                throw new Error("Seed failed");
            });

        await expect(
            resetDatabase(
                "test",
                ["--confirm-reset"],
                validTestEnvironment,
                dependencies,
            ),
        ).rejects.toThrow("Seed failed");

        expect(runCommandMock).toHaveBeenCalledTimes(2);
    });
});
