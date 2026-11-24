import { Prisma } from "../../generated/prisma/client";
import { prisma } from "../prisma";

export interface VerifiedOAuthIdentityInput {
  provider: string;
  providerAccountId: string;
  email: string | null | undefined;
  emailVerified: boolean;
}

export async function linkVerifiedOAuthIdentity(
  input: VerifiedOAuthIdentityInput,
): Promise<string | null> {
  const email = input.email?.trim().toLowerCase();
  if (!input.emailVerified || !email || email.length > 255 ||
    !input.provider || input.provider.length > 50 ||
    !input.providerAccountId || input.providerAccountId.length > 255) {
    return null;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const users = await tx.user.findMany({
        where: { email: { equals: email, mode: "insensitive" }, accountStatus: "ACTIVE" },
        select: { id: true },
        take: 2,
      });
      if (users.length !== 1) return null;
      const userId = users[0].id;
      const existing = await tx.oAuthAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: input.provider,
            providerAccountId: input.providerAccountId,
          },
        },
        select: { userId: true },
      });
      if (existing) return existing.userId === userId ? userId : null;
      await tx.oAuthAccount.create({
        data: {
          provider: input.provider,
          providerAccountId: input.providerAccountId,
          userId,
        },
      });
      return userId;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const existing = await prisma.oAuthAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: input.provider,
            providerAccountId: input.providerAccountId,
          },
        },
        select: { userId: true },
      });
      if (existing) {
        const matchedUser = await prisma.user.findFirst({
          where: {
            id: existing.userId,
            accountStatus: "ACTIVE",
            email: { equals: email, mode: "insensitive" },
          },
          select: { id: true },
        });
        return matchedUser?.id ?? null;
      }
    }
    throw error;
  }
}
