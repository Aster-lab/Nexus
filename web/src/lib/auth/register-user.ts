import type { Prisma } from "../../generated/prisma/client";
import { ApiError } from "../api/errors";
import { prisma } from "../prisma";
import type { RegistrationRequest } from "../contracts/registration";
import { hashPassword } from "./password";
import { ensureUserWallet } from "../services/user-wallet-provisioning.service";

export interface RegisteredUser {
  id: string;
  email: string;
  roles: string[];
  borrowerProfile: { id: string; legalName: string; phone: string | null } | null;
  investorProfile: { id: string; displayName: string } | null;
}

function duplicateEmailError(): ApiError {
  return new ApiError("EMAIL_ALREADY_REGISTERED", "An account with this email is already registered.", 409);
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function registerUser(input: RegistrationRequest): Promise<RegisteredUser> {
  const existing = await prisma.user.findFirst({
    where: { email: { equals: input.email, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) throw duplicateEmailError();

  const passwordHash = await hashPassword(input.password);
  try {
    return await prisma.$transaction(async (tx) => {
      const roles = await tx.role.findMany({
        where: { code: { in: input.roles } },
        select: { id: true, code: true },
      });
      if (roles.length !== input.roles.length) {
        throw new ApiError("ROLE_CONFIGURATION_UNAVAILABLE", "Account registration is temporarily unavailable.", 503);
      }

      const user = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          accountStatus: "ACTIVE",
          emailVerifiedAt: null,
        },
        select: { id: true, email: true },
      });
      await tx.userRole.createMany({
        data: roles.map((role) => ({
          userId: user.id,
          roleId: role.id,
          grantReason: "SELF_REGISTRATION",
        })),
      });

      const borrowerProfile = input.borrowerProfile
        ? await tx.borrowerProfile.create({
            data: {
              userId: user.id,
              legalName: input.borrowerProfile.legalName,
              phone: input.borrowerProfile.phone,
              address: input.borrowerProfile.address as Prisma.InputJsonValue,
            },
            select: { id: true, legalName: true, phone: true },
          })
        : null;
      const investorProfile = input.investorProfile
        ? await tx.investorProfile.create({
            data: { userId: user.id, displayName: input.investorProfile.displayName },
            select: { id: true, displayName: true },
          })
        : null;

      // Registration is limited to borrower/investor roles; one user wallet is shared
      // when the account selects both roles. It starts empty and is never funded here.
      await ensureUserWallet(tx, user.id);

      return {
        id: user.id,
        email: user.email,
        roles: input.roles,
        borrowerProfile,
        investorProfile,
      };
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) throw duplicateEmailError();
    throw error;
  }
}
