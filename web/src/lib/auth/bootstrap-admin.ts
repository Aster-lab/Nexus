import { Prisma } from "../../generated/prisma/client";
import { z } from "zod";
import { prisma } from "../prisma";
import { hashPassword } from "./password";

const bootstrapInputSchema = z.object({
  email: z.string().trim().pipe(z.email().max(254)).transform((email) => email.toLowerCase()),
  password: z.string().min(12).max(128),
}).strict();

export interface BootstrappedAdmin { id: string; email: string }

export async function bootstrapFirstAdmin(input: { email: string; password: string }): Promise<BootstrappedAdmin> {
  const validated = bootstrapInputSchema.parse(input);
  const passwordHash = await hashPassword(validated.password);

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ locked: number }>>`
      SELECT 1::int AS locked
      FROM (SELECT pg_advisory_xact_lock(726531948201::bigint)) AS bootstrap_lock
    `;

    const existingAdmin = await tx.userRole.findFirst({
      where: { role: { code: "ADMIN" } },
      select: { id: true },
    });
    if (existingAdmin) throw new Error("An administrator has already been provisioned.");

    const role = await tx.role.findUnique({ where: { code: "ADMIN" }, select: { id: true } });
    if (!role) throw new Error("The ADMIN role is not seeded. Run the database seed before bootstrapping.");

    const existingUser = await tx.user.findFirst({
      where: { email: { equals: validated.email, mode: "insensitive" } },
      select: { id: true },
    });
    if (existingUser) throw new Error("That email is already registered. Use a new email for the first administrator.");

    const user = await tx.user.create({
      data: { email: validated.email, passwordHash, accountStatus: "ACTIVE" },
      select: { id: true, email: true },
    });
    await tx.userRole.create({
      data: { userId: user.id, roleId: role.id, grantReason: "ONE_TIME_BOOTSTRAP" },
    });
    await tx.securityEvent.create({
      data: {
        userId: user.id,
        eventType: "ADMIN_BOOTSTRAP",
        severity: "HIGH",
        outcome: "SUCCESS",
        sourceReference: "one-time-interactive-cli",
        metadata: { role: "ADMIN", provisioningMethod: "ONE_TIME_BOOTSTRAP" },
      },
    });
    return user;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
