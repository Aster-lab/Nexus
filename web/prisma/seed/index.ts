import {prisma} from "../../src/lib/prisma";
import {seedRoles} from "./roles.seed";
import { seedPlatformPolicies } from "./platform-policies.seed";
import { seedPlatformAccounts } from "./platform-accounts.seed";

async function main() {
    console.log("Starting Nexus database seeding...");
    await seedRoles();
    await seedPlatformPolicies();
    await seedPlatformAccounts();
    console.log("Nexus database seeding completed.");
}

main()
    .catch((e) =>{
        console.error("Error during seeding:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
