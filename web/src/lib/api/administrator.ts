import { authenticateApiRequest, type ApiIdentity } from "./authentication";
import { requireRole } from "./authorization";

export async function requireAdministrator(request: Request): Promise<ApiIdentity> {
  const identity = await authenticateApiRequest(request);
  return requireRole(identity, "ADMIN");
}
