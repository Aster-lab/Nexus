import { createHash } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { pathToFileURL } from "node:url";
import { prisma } from "../src/lib/prisma";
import { bootstrapFirstAdmin } from "../src/lib/auth/bootstrap-admin";

function verifyBootstrapDatabase() {
  const environment = process.env.DATABASE_ENV;
  const url = process.env.DATABASE_URL;
  const fingerprint = process.env.DATABASE_URL_SHA256;
  if (!url || !fingerprint || !environment) throw new Error("DATABASE_URL, DATABASE_ENV, and DATABASE_URL_SHA256 must be configured.");
  if (environment !== "development" && environment !== "production") {
    throw new Error("Admin bootstrap is only allowed for an explicitly configured development or production database.");
  }
  const actualFingerprint = createHash("sha256").update(url).digest("hex");
  if (actualFingerprint !== fingerprint) throw new Error("DATABASE_URL fingerprint does not match the configured database fingerprint.");
  const hostname = new URL(url).hostname.toLowerCase();
  const localHost = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
  if (environment === "development" && !localHost) throw new Error("Development bootstrap requires a loopback PostgreSQL host.");
  if (environment === "production" && localHost) throw new Error("Production bootstrap cannot target a loopback database.");
  if (environment === "production" && !process.argv.includes("--confirm-production")) {
    throw new Error("Production bootstrap requires the explicit --confirm-production flag.");
  }
  return environment;
}

async function readHiddenPassword(): Promise<string> {
  if (!stdin.isTTY || typeof stdin.setRawMode !== "function") throw new Error("Run this command in an interactive terminal so the password can be entered without echo.");
  stdout.write("Administrator password (hidden): ");
  stdin.setRawMode(true);
  stdin.setEncoding("utf8");
  stdin.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const cleanup = () => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener("data", onData);
      stdout.write("\n");
    };
    const onData = (chunk: string) => {
      for (const character of chunk) {
        if (character === "\u0003") { cleanup(); reject(new Error("Admin bootstrap cancelled.")); return; }
        if (character === "\r" || character === "\n") { cleanup(); resolve(value); return; }
        if (character === "\u007f" || character === "\b") value = Array.from(value).slice(0, -1).join("");
        else if (character >= " ") value += character;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const environment = verifyBootstrapDatabase();
  if (!stdin.isTTY || !stdout.isTTY) throw new Error("Admin bootstrap requires an interactive terminal.");
  const prompt = createInterface({ input: stdin, output: stdout });
  try {
    console.log(`Target database environment: ${environment}`);
    const email = (await prompt.question("First administrator email: ")).trim();
    if (environment === "production") {
      const confirmation = await prompt.question('Type "BOOTSTRAP FIRST NEXUS ADMIN" to confirm production provisioning: ');
      if (confirmation !== "BOOTSTRAP FIRST NEXUS ADMIN") throw new Error("Production confirmation did not match.");
    }
    const confirmedEmail = (await prompt.question("Re-enter administrator email to confirm: ")).trim();
    if (confirmedEmail.toLowerCase() !== email.toLowerCase()) throw new Error("Email confirmation did not match.");
    prompt.close();
    const password = await readHiddenPassword();
    const user = await bootstrapFirstAdmin({ email, password });
    console.log(`First administrator created: ${user.email} (${user.id}). Sign in through the NEXUS login page.`);
  } finally {
    prompt.close();
    await prisma.$disconnect();
  }
}

const scriptPath = process.argv[1];
if (scriptPath && import.meta.url === pathToFileURL(scriptPath).href) {
  void main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Administrator bootstrap failed.");
    process.exitCode = 1;
  });
}
