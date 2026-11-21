import { prisma } from "../prisma";
import { verifyPassword } from "./password";

export interface LocalAuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
  borrowerProfile: { id: string; legalName: string; phone: string | null } | null;
  investorProfile: { id: string; displayName: string } | null;
}

export async function authenticateLocalCredentials(
  emailInput: string,
  password: string,
): Promise<LocalAuthenticatedUser | null> {
  if (password.length > 128 || !emailInput.trim() || emailInput.length > 255) return null;
  const email = emailInput.trim().toLowerCase();
  const users = await prisma.user.findMany({
    where: { email: { equals: email, mode: "insensitive" }, accountStatus: "ACTIVE" },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      roles: {
        where: { revokedAt: null },
        select: { role: { select: { code: true } } },
      },
      borrowerProfile: { select: { id: true, legalName: true, phone: true } },
      investorProfile: { select: { id: true, displayName: true } },
    },
    take: 2,
  });
  const user = users.length === 1 ? users[0] : null;
  const passwordMatches = await verifyPassword(password, user?.passwordHash);
  if (!user || !passwordMatches) return null;

  await prisma.user.updateMany({
    where: { id: user.id, accountStatus: "ACTIVE" },
    data: { lastLoginAt: new Date() },
  });
  return {
    id: user.id,
    email: user.email,
    roles: user.roles.map(({ role }) => role.code),
    borrowerProfile: user.borrowerProfile,
    investorProfile: user.investorProfile,
  };
}
