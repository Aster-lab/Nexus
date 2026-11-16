import {createHash} from "node:crypto";
import { DatabaseEnvironment } from "@/types/database-environment";

export function assertDbEnvironment(
    expectedEnvironment: string | undefined,
    environment: DatabaseEnvironment = process.env,
): void {
    if (
        expectedEnvironment !== "development" &&
        expectedEnvironment !== "test"
    ) {
        throw new Error(
            "Specify the expected environment: development or test.",
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
}

async function main() {
    try {
        const expectedEnvironment = process.argv[2];
        assertDbEnvironment(expectedEnvironment);

        console.log(`Database environment verified: ${expectedEnvironment}`);
    } catch (error) {
        console.error("Databse environment verification failed: ",error);
        process.exitCode = 1;
    }
}

const scriptPath = process.argv[1]?.replace(/\\/g,"/");
if (
    scriptPath === "scripts/assert-db-environment.ts" ||
    scriptPath?.endsWith("/scripts/assert-db-environment.ts")
) {void main()};