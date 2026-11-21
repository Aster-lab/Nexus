import { ApiError } from "./errors";
import type { ApiIdentity } from "./authentication";

export type ApiRole = "BORROWER" | "INVESTOR" | "ADMIN";

export function requireRole(identity: ApiIdentity, role: ApiRole): ApiIdentity {
  if (!identity.roles.includes(role)) {
    throw new ApiError("FORBIDDEN", "You are not authorized to perform this action.", 403);
  }
  return identity;
}

export function requireAdministrator(identity: ApiIdentity): ApiIdentity {
  return requireRole(identity, "ADMIN");
}

export function assertResourceOwner(
  identity: ApiIdentity,
  ownerUserId: string,
  options: { allowAdministrator?: boolean } = {},
): ApiIdentity {
  if (identity.userId !== ownerUserId &&
    !(options.allowAdministrator && identity.roles.includes("ADMIN"))) {
    throw new ApiError("FORBIDDEN", "You are not authorized to access this resource.", 403);
  }
  return identity;
}
