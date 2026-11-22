import { createInterface } from "node:readline/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { prisma } from "../src/lib/prisma";
import { seedPlatformAccounts } from "../prisma/seed/platform-accounts.seed";
import { seedPlatformPolicies } from "../prisma/seed/platform-policies.seed";
import { seedRoles } from "../prisma/seed/roles.seed";
import { createDemoAccounts } from "./create-demo-accounts";
import { activateDemoLoanPolicies } from "./demo-policy-activation";
import { assertDemoDatabase } from "./demo-environment";

export async function setupDemo(): Promise<void> {
  assertDemoDatabase();
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Demo setup requires an interactive terminal to confirm the isolated database and display credentials once.");
  }

  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log("Target: loopback PostgreSQL database nexus_demo (disposable demo data only).");
    const confirmation = await prompt.question('Type "SET UP NEXUS DEMO" to continue: ');
    if (confirmation !== "SET UP NEXUS DEMO") throw new Error("Demo setup confirmation did not match.");
  } finally {
    prompt.close();
  }

  const prismaCli = resolve(process.cwd(), "node_modules/prisma/build/index.js");
  const migration = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], { stdio: "inherit" });
  if (migration.error) throw migration.error;
  if (migration.status !== 0) throw new Error(`Prisma migration deployment failed with status ${migration.status}.`);

  if (await prisma.user.count() > 0) {
    throw new Error("nexus_demo already contains users. Use the explicit demo reset command before creating a fresh demo set.");
  }

  await seedRoles();
  await seedPlatformPolicies();
  await seedPlatformAccounts();
  const credentials = await createDemoAccounts();
  await activateDemoLoanPolicies();

  console.log("\nDemo accounts are ready. Credentials are shown once; they are not stored in plaintext.");
  for (const account of credentials) console.log(`${account.email}  ${account.password}`);
  console.log("Initial loan, interest, repayment, and fee policies are approved for this isolated demo database.");
  console.log("Use these accounts only while the application is connected to .env.demo.");
}

const scriptPath = process.argv[1];
if (scriptPath && import.meta.url === pathToFileURL(scriptPath).href) {
  void setupDemo()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Demo setup failed.");
      process.exitCode = 1;
    })
    .finally(async () => prisma.$disconnect());
}
