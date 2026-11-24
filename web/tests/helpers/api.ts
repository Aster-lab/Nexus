import { expect } from "vitest";

export type ApiTestRole = "BORROWER" | "INVESTOR" | "ADMIN";

export interface ApiTestIdentity {
  userId: string;
  role: ApiTestRole;
  sessionCookie: string;
  cookieName?: string;
}

export function createAuthenticatedApiRequest(
  url: string,
  identity: ApiTestIdentity,
  init: RequestInit = {},
): Request {
  const headers = new Headers(init.headers);
  const cookieName = identity.cookieName ?? "nexus_session";
  const cookieValue = `${cookieName}=${encodeURIComponent(identity.sessionCookie)}`;
  const existingCookie = headers.get("cookie");
  headers.set("cookie", existingCookie ? `${existingCookie}; ${cookieValue}` : cookieValue);
  return new Request(url, { ...init, headers });
}

export async function expectApiSuccess<T>(response: Response, status = 200): Promise<T> {
  expect(response.status).toBe(status);
  const body: unknown = await response.json();
  expect(body).toMatchObject({ success: true });
  return (body as { data: T }).data;
}

export async function expectApiError(
  response: Response,
  expected: { status: number; code: string },
): Promise<void> {
  expect(response.status).toBe(expected.status);
  expect(await response.json()).toMatchObject({
    success: false,
    error: { code: expected.code },
  });
}
