import { createHash } from "node:crypto";
import { ApiError, apiErrorResponseFrom } from "../../../../lib/api/errors";
import { apiSuccessResponse } from "../../../../lib/api/responses";
import { API_SESSION_COOKIE_NAME, sessionTokenFromRequest } from "../../../../lib/api/authentication";
import { prisma } from "../../../../lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  try {
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).origin !== new URL(request.url).origin) {
      throw new ApiError("FORBIDDEN", "Cross-origin authentication requests are not allowed.", 403);
    }
    const token = sessionTokenFromRequest(request);
    if (token && token.length >= 32 && token.length <= 512) {
      await prisma.session.updateMany({
        where: {
          sessionTokenHash: createHash("sha256").update(token).digest("hex"),
          revokedAt: null,
        },
        data: { revokedAt: new Date(), revokeReason: "USER_LOGOUT" },
      });
    }
    const response = apiSuccessResponse({ signedOut: true }, { message: "Signed out." });
    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    response.headers.set(
      "Set-Cookie",
      `${API_SESSION_COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`,
    );
    for (const cookieName of [
      "next-auth.session-token",
      "__Secure-next-auth.session-token",
      "next-auth.csrf-token",
      "__Host-next-auth.csrf-token",
      "next-auth.callback-url",
      "__Secure-next-auth.callback-url",
    ]) {
      response.headers.append(
        "Set-Cookie",
        `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${secure}`,
      );
    }
    return response;
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
