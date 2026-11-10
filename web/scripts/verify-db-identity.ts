import { createHash } from "node:crypto";
import { prisma } from "../src/lib/prisma";

async function main() {
    const result = await prisma.$queryRaw<
        {
            database: string;
            dbUser: string;
            serverAddress: string | null;
            serverPort: number;
            serverVersion: string;
            serverStartTime : string;
        }[]
    >`
        SELECT
        current_database() AS database,
        (
            SELECT oid::text
            FROM pg_database
            WHERE datname = current_database()
        ) AS "databaseOid",
        inet_server_addr()::text AS "serverAddress",
        inet_server_port() AS "serverPort",
        pg_postmaster_start_time()::text AS "serverStartTime"
    `;
    console.log(result[0]);
    const identity = result[0];

    const fingerprint = createHash("sha256")
        .update(JSON.stringify(identity))
        .digest("hex");

    console.log({
        database: identity.database,
        serverVersion: identity.serverVersion,
        fingerprint,
    });
}

main()
    .catch((error) => {
        console.error("Database identity check failed:", error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });