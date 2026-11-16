import { createHash } from "node:crypto";
import { prisma } from "../src/lib/prisma";

interface DatabaseIdentity {
    database: string;
    databaseOid: string;
    serverAddress : string |null;
    serverPort : number;
    serverStartTime: string;
}
export async function verifyDbIdentity() {
    try {
        const result = await prisma.$queryRaw<DatabaseIdentity[]>`
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
        const identity = result[0];

        if (!identity){
            throw new Error ("Database identity query returned no rows.");
        }
        const fingerprint = createHash("sha256")
            .update(JSON.stringify(identity))
            .digest("hex");

        console.log(identity);
        console.log({
            database: identity.database,
            databaseOid: identity.databaseOid,
            serverAddress: identity.serverAddress,
            serverPort: identity.serverPort,
            serverStartTime: identity.serverStartTime,
            fingerprint,
        });
        return {
            identity,
            fingerprint,
        };
    } finally{
        await prisma.$disconnect();
    }
}

async function main(){
    try{
        await verifyDbIdentity();
    } catch (error) {
        console.error("Database identity check failed: ",error);
        process.exitCode = 1;
    }
}

const scriptPath = process.argv[1]?.replace(/\\/g, "/");
if (scriptPath?.endsWith("/scripts/verify-db-identity.ts")){
    void main();
}