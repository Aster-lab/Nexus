import { createInterface } from "node:readline/promises";
import { pathToFileURL } from "node:url";
import { assertDemoDatabase } from "../src/lib/config/demo-environment";
import { prisma } from "../src/lib/prisma";
import { activateDemoLoanPolicies } from "./demo-policy-activation";

export async function runDemoPolicyActivation(): Promise<void> {
  assertDemoDatabase();
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("Demo policy activation requires an interactive terminal.");
  }

  const prompt = createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log("Target: loopback PostgreSQL database nexus_demo (demo lending policies only).");
    const confirmation = await prompt.question('Type "ACTIVATE NEXUS DEMO POLICIES" to continue: ');
    if (confirmation !== "ACTIVATE NEXUS DEMO POLICIES") throw new Error("Demo policy activation confirmation did not match.");
  } finally {
    prompt.close();
  }

  const activation = await activateDemoLoanPolicies();
  console.log(`Confirmed demo database: ${activation[0]}`);
  for (const policy of activation.slice(1)) console.log(policy);
  console.log("No financial records were created or changed.");
}

const scriptPath = process.argv[1];
if (scriptPath && import.meta.url === pathToFileURL(scriptPath).href) {
  void runDemoPolicyActivation()
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Unable to activate demo lending policies.");
      process.exitCode = 1;
    })
    .finally(async () => prisma.$disconnect());
}
