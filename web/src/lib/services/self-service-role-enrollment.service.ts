import type { Prisma } from "../../generated/prisma/client";
import { ApiError } from "../api/errors";
import type { SelfServiceRoleEnrollment } from "../contracts/role-enrollment";
import { ensureUserWallet } from "./user-wallet-provisioning.service";
import { prisma } from "../prisma";

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function enrollSelfServiceRole(userId: string, input: SelfServiceRoleEnrollment) {
  try {
    return await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { accountStatus: true } });
      if (!user || user.accountStatus !== "ACTIVE") {
        throw new ApiError("FORBIDDEN", "An active account is required to enable a workspace.", 403);
      }

      const role = await tx.role.findUnique({ where: { code: input.role }, select: { id: true } });
      if (!role) throw new ApiError("ROLE_CONFIGURATION_UNAVAILABLE", "Workspace enrollment is temporarily unavailable.", 503);

      const existingAssignment = await tx.userRole.findFirst({
        where: { userId, roleId: role.id, revokedAt: null },
        select: { id: true },
      });
      if (existingAssignment) throw new ApiError("ROLE_ALREADY_ACTIVE", "This workspace is already enabled for your account.", 409);

      if (input.role === "BORROWER") {
        const existingProfile = await tx.borrowerProfile.findUnique({ where: { userId }, select: { id: true } });
        const data = {
          legalName: input.profile.legalName,
          phone: input.profile.phone,
          address: input.profile.address as Prisma.InputJsonValue,
        };
        if (existingProfile) await tx.borrowerProfile.update({ where: { userId }, data });
        else await tx.borrowerProfile.create({ data: { userId, ...data } });
      } else {
        const existingProfile = await tx.investorProfile.findUnique({ where: { userId }, select: { id: true } });
        if (existingProfile) {
          await tx.investorProfile.update({ where: { userId }, data: { displayName: input.profile.displayName, investorStatus: "ACTIVE" } });
        } else {
          await tx.investorProfile.create({ data: { userId, displayName: input.profile.displayName } });
        }
      }

      await tx.userRole.create({
        data: { userId, roleId: role.id, grantReason: "SELF_SERVICE_ROLE_ENROLLMENT" },
        select: { id: true },
      });
      await ensureUserWallet(tx, userId);

      const [roles, borrowerProfile, investorProfile] = await Promise.all([
        tx.userRole.findMany({ where: { userId, revokedAt: null }, select: { role: { select: { code: true } } } }),
        tx.borrowerProfile.findUnique({ where: { userId }, select: { id: true, legalName: true, phone: true } }),
        tx.investorProfile.findUnique({ where: { userId }, select: { id: true, displayName: true } }),
      ]);
      return {
        roles: roles.map(({ role: assignedRole }) => assignedRole.code),
        borrowerProfile,
        investorProfile,
      };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new ApiError("ROLE_ALREADY_ACTIVE", "This workspace is already enabled for your account.", 409);
    }
    throw error;
  }
}
