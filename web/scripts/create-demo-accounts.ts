import { randomBytes } from "node:crypto";
import { pathToFileURL } from "node:url";
import { Prisma } from "../src/generated/prisma/client";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/lib/auth/password";
import { assertDemoDatabase, createDemoPassword } from "./demo-environment";
import { ensureUserWallet } from "../src/lib/services/user-wallet-provisioning.service";

const DEMO_ACCOUNTS = [
  { key: "administrator", email: "demo-admin@nexus.local", role: "ADMIN" },
  { key: "borrower", email: "demo-borrower@nexus.local", role: "BORROWER" },
  { key: "investor", email: "demo-investor@nexus.local", role: "INVESTOR" },
] as const;

export async function createDemoAccounts(): Promise<Array<{ email: string; password: string }>> {
  assertDemoDatabase();
  const prepared = await Promise.all(DEMO_ACCOUNTS.map(async (account) => {
    const password = createDemoPassword();
    return { ...account, password, passwordHash: await hashPassword(password) };
  }));

  await prisma.$transaction(async (tx) => {
    const existingAdmin = await tx.userRole.findFirst({
      where: { role: { code: "ADMIN" } },
      select: { id: true },
    });
    if (existingAdmin) throw new Error("The demo database already contains an administrator. Reset nexus_demo before provisioning another demo set.");

    const existingDemoAccount = await tx.user.findFirst({
      where: { email: { in: DEMO_ACCOUNTS.map((account) => account.email) } },
      select: { id: true },
    });
    if (existingDemoAccount) throw new Error("Demo accounts already exist. Reset nexus_demo before provisioning another demo set.");

    const roles = await tx.role.findMany({
      where: { code: { in: DEMO_ACCOUNTS.map((account) => account.role) } },
      select: { id: true, code: true },
    });
    const roleIds = new Map(roles.map((role) => [role.code, role.id]));
    if (roleIds.size !== 3) throw new Error("Required roles are missing; seed the demo database before creating demo accounts.");

    for (const account of prepared) {
      const user = await tx.user.create({
        data: { email: account.email, passwordHash: account.passwordHash, accountStatus: "ACTIVE" },
        select: { id: true },
      });
      await tx.userRole.create({
        data: { userId: user.id, roleId: roleIds.get(account.role)!, grantReason: "ISOLATED_DEMO_SEED" },
      });

      if (account.role === "BORROWER") {
        await tx.borrowerProfile.create({
          data: {
            userId: user.id,
            legalName: "NEXUS Demo Borrower",
            phone: "+66 80 000 0001",
            address: {
              schema_version: "borrower_profile_address.v1",
              line1: "100 Demo Street",
              line2: null,
              subdistrict: "Khlong Toei",
              district: "Khlong Toei",
              province: "Bangkok",
              postal_code: "10110",
              country_code: "TH",
            } satisfies Prisma.InputJsonObject,
          },
        });
      }
      if (account.role === "INVESTOR") {
        await tx.investorProfile.create({ data: { userId: user.id, displayName: "NEXUS Demo Investor" } });
      }
      if (account.role === "BORROWER" || account.role === "INVESTOR") {
        await ensureUserWallet(tx, user.id);
      }
      if (account.role === "ADMIN") {
        await tx.securityEvent.create({
          data: {
            userId: user.id,
            eventType: "ADMIN_BOOTSTRAP",
            severity: "HIGH",
            outcome: "SUCCESS",
            sourceReference: "isolated-demo-seed",
            metadata: { role: "ADMIN", provisioningMethod: "ISOLATED_DEMO_SEED" },
          },
        });
      }
    }
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return prepared.map(({ email, password }) => ({ email, password }));
}

const scriptPath = process.argv[1];
if (scriptPath && import.meta.url === pathToFileURL(scriptPath).href) {
  void createDemoAccounts()
    .then((accounts) => {
      console.log("Demo credentials (displayed once; save them securely):");
      for (const account of accounts) console.log(`${account.email}  ${account.password}`);
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : "Unable to create demo accounts.");
      process.exitCode = 1;
    })
    .finally(async () => prisma.$disconnect());
}
