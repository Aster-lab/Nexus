import { ApiError, apiErrorResponseFrom } from "../../../../lib/api/errors";
import { apiSuccessResponse } from "../../../../lib/api/responses";
import { parseJsonBody } from "../../../../lib/api/validation";
import { RegistrationRequestSchema } from "../../../../lib/contracts/registration";
import { registerUser } from "../../../../lib/auth/register-user";
import { apiErrorResponse } from "../../../../lib/api/responses";
import { authRateLimitSubjects, consumeAuthRateLimit } from "../../../../lib/api/auth-rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function enforceSameOriginWhenPresent(request: Request): void {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).origin !== new URL(request.url).origin) {
    throw new ApiError("FORBIDDEN", "Cross-origin account creation requests are not allowed.", 403);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    enforceSameOriginWhenPresent(request);
    const body = await parseJsonBody(request, RegistrationRequestSchema);
    const rateLimit = await consumeAuthRateLimit(
      "AUTH_REGISTER_ATTEMPT",
      authRateLimitSubjects(request, body.email, { maxAttempts: 3, windowSeconds: 3600 }, { maxAttempts: 12, windowSeconds: 3600 }),
    );
    if (rateLimit.limited) {
      const response = apiErrorResponse("RATE_LIMITED", "Too many registration attempts. Try again later.", 429);
      response.headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
      return response;
    }
    const user = await registerUser(body);
    return apiSuccessResponse(user, { status: 201, message: "Account created. You can now sign in." });
  } catch (error) {
    return apiErrorResponseFrom(error);
  }
}
