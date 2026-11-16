
import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";

import { assertDbEnvironment } from "../../scripts/assert-db-environment";

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

describe("assertDbEnvironment", () => {
    it("accepts a valid development environment", () => {
        expect(() =>
            assertDbEnvironment("development", validDevelopmentEnvironment),
        ).not.toThrow();
    });

    it("accepts a valid test environment", () => {
        expect(() =>
            assertDbEnvironment("test", validTestEnvironment),
        ).not.toThrow();
    });

    it("rejects an unsupported expected environment", () => {
        expect(() =>
            assertDbEnvironment("production", validTestEnvironment),
        ).toThrow(
            "Specify the expected environment: development or test.",
        );
    });

    it("rejects a missing expected environment", () => {
        expect(() =>
            assertDbEnvironment(undefined, validTestEnvironment),
        ).toThrow(
            "Specify the expected environment: development or test.",
        );
    });

    it("rejects missing environment configuration", () => {
        expect(() =>
            assertDbEnvironment("test", {}),
        ).toThrow("Database environment configuration is incomplete.");
    });

    it("rejects a missing database URL", () => {
        expect(() =>
            assertDbEnvironment("test", {
                DATABASE_ENV: "test",
                DATABASE_URL_SHA256: fingerprint,
            }),
        ).toThrow("Database environment configuration is incomplete.");
    });

    it("rejects an environment label mismatch", () => {
        expect(() =>
            assertDbEnvironment("development", validTestEnvironment),
        ).toThrow(
            "Database environment mismatch. Expected development, received test.",
        );
    });

    it("rejects a database URL fingerprint mismatch", () => {
        expect(() =>
            assertDbEnvironment("test", {
                ...validTestEnvironment,
                DATABASE_URL_SHA256: "incorrect-fingerprint",
            }),
        ).toThrow("Database URL fingerprint mismatch for test.");
    });

    it("rejects a missing fingerprint", () => {
        expect(() =>
            assertDbEnvironment("test", {
                DATABASE_ENV: "test",
                DATABASE_URL: databaseUrl,
            }),
        ).toThrow("Database environment configuration is incomplete.");
    });
});
