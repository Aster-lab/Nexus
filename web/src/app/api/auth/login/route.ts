import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { authenticateLocalCredentials } from "../../../../lib/auth/local-credentials";
import { ApiError, apiErrorResponseFrom } from "../../../../lib/api/errors";
import { API_SESSION_COOKIE_NAME } from "../../../../lib/api/authentication";
import { apiSuccessResponse } from "../../../../lib/api/responses";
import { parseJsonBody } from "../../../../lib/api/validation";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_LIFETIME_SECONDS = 8 * 60 * 60;
const loginSchema = z.object({
  email: z.email().trim().max(255),
  password: z.string().min(1).max(128),
}).strict();

function enforceSameOriginWhenPresent(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).origin !== new URL(request.url).origin) {
    throw new ApiError("FORBIDDEN", "Cross-origin authentication requests are not allowed.", 403);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    enforceSameOriginWhenPresent(request);
    const body = await parseJsonBody(request, loginSchema);
    const identity = await authenticateLocalCredentials(body.email, body.password);
    if (!identity) throw new ApiError("UNAUTHENTICATED", "Email or password is incorrect.", 401);

    const rawToken = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_SECONDS * 1000);
    const session = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM users WHERE id = ${identity.id}::uuid AND account_status = 'ACTIVE' FOR UPDATE
      `;
      const user = await tx.user.findFirst({
        where: { id: identity.id, accountStatus: "ACTIVE" },
        select: { id: true },
      });
      if (!user) return null;
      return tx.session.create({
        data: {
          userId: user.id,
          sessionTokenHash: createHash("sha256").update(rawToken).digest("hex"),
          expiresAt,
        },
        select: { id: true },
      });
    });
    if (!session) throw new ApiError("UNAUTHENTICATED", "Email or password is incorrect.", 401);

    const response = apiSuccessResponse({
      id: identity.id,
      email: identity.email,
      roles: identity.roles,
      borrowerProfile: identity.borrowerProfile,
      investorProfile: identity.investorProfile,
      expiresAt: expiresAt.toISOString(),
    }, { message: "Signed in successfully." });
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    response.headers.set(
      "Set-Cookie",
      `${API_SESSION_COOKIE_NAME}=${encodeURIComponent(rawToken)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_LIFETIME_SECONDS}${secure}`,
    );
    return response;
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
