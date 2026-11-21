import { createInterface } from "node:readline/promises";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { prisma } from "../src/lib/prisma";
import { seedPlatformAccounts } from "../prisma/seed/platform-accounts.seed";
import { seedPlatformPolicies } from "../prisma/seed/platform-policies.seed";
import { seedRoles } from "../prisma/seed/roles.seed";
import { createDemoAccounts } from "./create-demo-accounts";
import { assertDemoDatabase } from "./demo-environment";

export async function resetDemo(): Promise<void> {
  assertDemoDatabase();
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Demo reset requires an interactive terminal.");
  }

  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log("This permanently deletes all data in loopback PostgreSQL database nexus_demo.");
    const confirmation = await prompt.question('Type "RESET NEXUS DEMO" to continue: ');
    if (confirmation !== "RESET NEXUS DEMO") throw new Error("Demo reset confirmation did not match.");
  } finally {
    prompt.close();
  }

  const prismaCli = resolve(process.cwd(), "node_modules/prisma/build/index.js");
  const reset = spawnSync(process.execPath, [prismaCli, "migrate", "reset", "--force"], { stdio: "inherit" });
  if (reset.error) throw reset.error;
  if (reset.status !== 0) throw new Error(`Demo database reset failed with status ${reset.status}.`);

  await seedRoles();
  await seedPlatformPolicies();
  await seedPlatformAccounts();
  const credentials = await createDemoAccounts();
  console.log("\nDemo database reset complete. Save these newly generated credentials; they are displayed once:");
  for (const account of credentials) console.log(`${account.email}  ${account.password}`);
}

const scriptPath = process.argv[1];
if (scriptPath && import.meta.url === pathToFileURL(scriptPath).href) {
  void resetDemo()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Demo reset failed.");
      process.exitCode = 1;
    })
    .finally(async () => prisma.$disconnect());
}
