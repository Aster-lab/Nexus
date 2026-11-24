import { createHash } from "node:crypto";
import { getServerSession } from "next-auth";
import { prisma } from "../prisma";
import { authOptions } from "../auth";
import { ApiError } from "./errors";

export const API_SESSION_COOKIE_NAME = "nexus_session";
const MAX_SESSION_TOKEN_LENGTH = 512;

export interface ApiIdentity {
  userId: string;
  email: string;
  roles: string[];
  borrowerProfile: { id: string; legalName: string; phone: string | null } | null;
  investorProfile: { id: string; displayName: string } | null;
}

function unauthenticated(): ApiError {
  return new ApiError("UNAUTHENTICATED", "Authentication is required.", 401);
}

function validToken(token: string | null): token is string {
  return Boolean(token && token.length >= 32 && token.length <= MAX_SESSION_TOKEN_LENGTH);
}

function tokenFromCookie(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;

  const matching = cookieHeader.split(";").map((part) => part.trim())
    .filter((part) => part.startsWith(`${API_SESSION_COOKIE_NAME}=`));
  if (matching.length !== 1) return null;

  try {
    return decodeURIComponent(matching[0].slice(API_SESSION_COOKIE_NAME.length + 1));
  } catch {
    return null;
  }
}

export function sessionTokenFromRequest(request: Request): string | null {
  const authorization = request.headers.get("authorization");
  if (authorization !== null) {
    const match = /^Bearer ([A-Za-z0-9_-]{32,512})$/i.exec(authorization.trim());
    return match?.[1] ?? null;
  }
  return tokenFromCookie(request);
}

export async function authenticateApiRequest(request: Request): Promise<ApiIdentity> {
  const token = sessionTokenFromRequest(request);
  if (validToken(token)) {
    const session = await prisma.session.findFirst({
      where: {
        sessionTokenHash: createHash("sha256").update(token).digest("hex"),
        revokedAt: null,
        expiresAt: { gt: new Date() },
        user: { accountStatus: "ACTIVE" },
      },
      select: {
        user: {
          select: {
            id: true,
            email: true,
            roles: {
              where: { revokedAt: null },
              select: { role: { select: { code: true } } },
            },
            borrowerProfile: { select: { id: true, legalName: true, phone: true } },
            investorProfile: { select: { id: true, displayName: true } },
          },
        },
      },
    });
    if (session) {
      return {
        userId: session.user.id,
        email: session.user.email,
        roles: session.user.roles.map(({ role }) => role.code),
        borrowerProfile: session.user.borrowerProfile,
        investorProfile: session.user.investorProfile,
      };
    }
  }

  let nextAuthUserId: string | undefined;
  try {
    const session = await getServerSession(authOptions);
    nextAuthUserId = session?.user?.id;
  } catch {
  }
  if (!nextAuthUserId) throw unauthenticated();
  const user = await prisma.user.findFirst({
    where: { id: nextAuthUserId, accountStatus: "ACTIVE" },
    select: {
      id: true,
      email: true,
      roles: {
        where: { revokedAt: null },
        select: { role: { select: { code: true } } },
      },
      borrowerProfile: { select: { id: true, legalName: true, phone: true } },
      investorProfile: { select: { id: true, displayName: true } },
    },
  });
  if (!user) throw unauthenticated();
  return {
    userId: user.id,
    email: user.email,
    roles: user.roles.map(({ role }) => role.code),
    borrowerProfile: user.borrowerProfile,
    investorProfile: user.investorProfile,
  };
}
