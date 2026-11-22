import { createHash } from "node:crypto";
import type { DatabaseEnvironment } from "@/types/database-environment";

const ALLOWED_ENVIRONMENTS = ["development", "test", "staging"] as const;

function isLoopbackHost(hostname: string): boolean {
    const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "::1" || host.startsWith("127.");
}

export function assertDbEnvironment(
    expectedEnvironment: string | undefined,
    environment: DatabaseEnvironment = process.env,
): void {
    if (!ALLOWED_ENVIRONMENTS.includes(expectedEnvironment as typeof ALLOWED_ENVIRONMENTS[number])) {
        throw new Error(
            "Specify the expected environment: development, test, or staging.",
        );
    }

    const actualEnvironment = environment.DATABASE_ENV;
    const databaseUrl = environment.DATABASE_URL;
    const expectedFingerprint = environment.DATABASE_URL_SHA256;

    if (!databaseUrl || !expectedFingerprint || !actualEnvironment) {
        throw new Error("Database environment configuration is incomplete.");
    }

    if (actualEnvironment !== expectedEnvironment) {
        throw new Error(
            `Database environment mismatch. Expected ${expectedEnvironment}, received ${actualEnvironment}.`,
        );
    }

    const actualFingerprint = createHash("sha256")
        .update(databaseUrl)
        .digest("hex");

    if (actualFingerprint !== expectedFingerprint) {
        throw new Error(
            `Database URL fingerprint mismatch for ${expectedEnvironment}.`,
        );
    }

    if (expectedEnvironment === "staging") {
        let databaseUrlObject: URL;
        try {
            databaseUrlObject = new URL(databaseUrl);
        } catch {
            throw new Error("Staging DATABASE_URL must be a valid PostgreSQL URL.");
        }
        if (!(["postgres:", "postgresql:"].includes(databaseUrlObject.protocol))) {
            throw new Error("Staging DATABASE_URL must use PostgreSQL.");
        }
        if (isLoopbackHost(databaseUrlObject.hostname)) {
            throw new Error("Staging database must use a hosted non-loopback PostgreSQL URL.");
        }
        const databaseName = decodeURIComponent(databaseUrlObject.pathname.replace(/^\//, "")).toLowerCase();
        if (["nexus_dev", "nexus_test", "nexus_demo"].includes(databaseName)) {
            throw new Error("Staging cannot target the local development, test, or demo database.");
        }
    }
}

async function main() {
    try {
        const expectedEnvironment = process.argv[2];
        assertDbEnvironment(expectedEnvironment);

        console.log(`Database environment verified: ${expectedEnvironment}`);
    } catch (error) {
        console.error("Database environment verification failed:", error);
        process.exitCode = 1;
    }
}

const scriptPath = process.argv[1]?.replace(/\\/g,"/");
if (
    scriptPath === "scripts/assert-db-environment.ts" ||
    scriptPath?.endsWith("/scripts/assert-db-environment.ts")
) {void main()};
