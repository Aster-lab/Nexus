import {createHash} from "node:crypto";
import {execSync} from "node:child_process";
import {createInterface} from "node:readline/promises";
import {stdin, stdout} from "node:process";

import { DatabaseEnvironment } from "@/types/database-environment";

interface ResetDependencies{
    confirm : (question:string) => Promise<string>;
    runCommand : (command: string) => void;
}
export async function resetDatabase(
    expectedEnvironment: string | undefined,
    flags: string[],
    environment: DatabaseEnvironment,
    dependencies: ResetDependencies,
): Promise<void> {
    if (
        expectedEnvironment !== "development" &&
        expectedEnvironment !== "test"
    ) {
        throw new Error("Specify development or test.");
    }

    if (!flags.includes("--confirm-reset")) {
        throw new Error("Reset blocked: --confirm-reset is required.");
    }

    if (
        expectedEnvironment === "development" &&
        !flags.includes("--backup-confirmed")
    ) {
        throw new Error(
            "Development reset blocked: create a backup branch first and pass --backup-confirmed.",
        );
    }

    const actualEnvironment = environment.DATABASE_ENV;
    const databaseUrl = environment.DATABASE_URL;
    const expectedFingerprint = environment.DATABASE_URL_SHA256;

    if (!actualEnvironment || !databaseUrl || !expectedFingerprint) {
        throw new Error("Database environment configuration is incomplete.");
    }

    if (actualEnvironment !== expectedEnvironment) {
        throw new Error(
            `Environment mismatch. Expected ${expectedEnvironment}, received ${actualEnvironment}.`,
        );
    }

    const actualFingerprint = createHash("sha256")
        .update(databaseUrl)
        .digest("hex");

    if (actualFingerprint !== expectedFingerprint) {
        throw new Error("Database URL fingerprint mismatch.");
    }

    console.log(`Target environment verified: ${expectedEnvironment}`);

    const confirmation = await dependencies.confirm(
        `This will DELETE database contents. Type "${expectedEnvironment}" to continue: `,
    );

    if (confirmation.trim() !== expectedEnvironment) {
        throw new Error("Confirmation mismatch. Reset cancelled.");
    }

    console.log("Starting database reset...");

    dependencies.runCommand("npx prisma migrate reset --force");

    console.log("Applying approved seed data...");

    dependencies.runCommand("npx tsx prisma/seed/index.ts");

    console.log(`${expectedEnvironment} database reset completed.`);
}

async function askForConfirmation(question: string): Promise<string> {
    const rl = createInterface({ input: stdin, output: stdout });

    try {
        return await rl.question(question);
    } finally {
        rl.close();
    }
}

async function main() {
    const [expectedEnvironment, ...flags] = process.argv.slice(2);

    try {
        await resetDatabase(
            expectedEnvironment,
            flags,
            process.env,
            {
                confirm: askForConfirmation,
                runCommand: (command) => {
                    execSync(command, { stdio: "inherit" });
                },
            },
        );
    } catch (error) {
        console.error("Database reset failed:", error);
        process.exitCode = 1;
    }
}

const scriptPath = process.argv[1]?.replace(/\\/g, "/");

if (
    scriptPath === "scripts/reset-database.ts" ||
    scriptPath?.endsWith("/scripts/reset-database.ts")
) {
    void main();
}