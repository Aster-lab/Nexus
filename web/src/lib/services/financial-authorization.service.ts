import { Prisma } from "../../generated/prisma/client";

export class FinancialAuthorizationError extends Error {
  readonly code = "FINANCIAL_ADMIN_REQUIRED";

  constructor() {
    super("Administrator authorization is required for this financial operation.");
    this.name = "FinancialAuthorizationError";
  }
}

/** Requires a live account with an unrevoked ADMIN role. */
export async function requireFinancialAdministrator(
  tx: Prisma.TransactionClient,
  actorUserId: string,
): Promise<void> {
  if (!actorUserId) throw new FinancialAuthorizationError();

  const administrator = await tx.user.findFirst({
    where: {
      id: actorUserId,
      accountStatus: "ACTIVE",
      roles: {
        some: {
          revokedAt: null,
          role: { code: "ADMIN" },
        },
      },
    },
    select: { id: true },
  });

  if (!administrator) throw new FinancialAuthorizationError();
}
