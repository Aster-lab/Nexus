import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as getCurrentUser } from "../../src/app/api/auth/me/route";
import { POST as login } from "../../src/app/api/auth/login/route";
import { POST as logout } from "../../src/app/api/auth/logout/route";
import {
  GET as getMyProfile,
  PATCH as patchMyProfile,
} from "../../src/app/api/users/me/route";
import { prisma } from "../../src/lib/prisma";
import { ApiError } from "../../src/lib/api/errors";
import { authenticateApiRequest } from "../../src/lib/api/authentication";
import { hashPassword } from "../../src/lib/auth/password";
import { linkVerifiedOAuthIdentity } from "../../src/lib/auth/oauth-identity";
import { createNexusOidcProvider } from "../../src/lib/auth";
import {
  assertResourceOwner,
  requireRole,
} from "../../src/lib/api/authorization";
import { createAuthenticatedApiRequest, expectApiError, expectApiSuccess } from "../helpers/api";

interface TestPrincipal {
  userId: string;
  email: string;
  token: string;
}

const createdUserIds: string[] = [];

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function createPrincipal(roleCode: "BORROWER" | "INVESTOR" | "ADMIN"): Promise<TestPrincipal> {
  const role = await prisma.role.upsert({
    where: { code: roleCode },
    create: { code: roleCode, name: roleCode },
    update: {},
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { email: `${randomUUID()}@api.test`, accountStatus: "ACTIVE" },
    select: { id: true, email: true },
  });
  createdUserIds.push(user.id);
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

  if (roleCode === "BORROWER") {
    await prisma.borrowerProfile.create({
      data: { userId: user.id, legalName: "API Test Borrower", address: {} },
    });
  }
  if (roleCode === "INVESTOR") {
    await prisma.investorProfile.create({ data: { userId: user.id, displayName: "API Investor" } });
  }

  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      userId: user.id,
      sessionTokenHash: tokenHash(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });

  return { userId: user.id, email: user.email, token };
}

let borrower: TestPrincipal;
let investor: TestPrincipal;
let administrator: TestPrincipal;

function authenticatedRequest(token: string, init: RequestInit = {}): Request {
  return createAuthenticatedApiRequest("http://localhost/api/test", {
    userId: "metadata-only",
    role: "BORROWER",
    sessionCookie: token,
    cookieName: "nexus_session",
  }, init);
}

describe("API-02 authentication and current-user APIs", () => {
  beforeEach(async () => {
    borrower = await createPrincipal("BORROWER");
    investor = await createPrincipal("INVESTOR");
    administrator = await createPrincipal("ADMIN");
  });

  afterEach(async () => {
    if (createdUserIds.length === 0) return;
    await prisma.session.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.oAuthAccount.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.borrowerProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.investorProfile.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    createdUserIds.length = 0;
  });

  it("API-02-01 returns the authenticated user's own profile and active roles", async () => {
    const response = await getCurrentUser(authenticatedRequest(borrower.token));
    const data = await expectApiSuccess<{ id: string; email: string; roles: string[] }>(response);
    expect(data.id).toBe(borrower.userId);
    expect(data.email).toContain("@api.test");
    expect(data.roles).toEqual(["BORROWER"]);
  });

  it("AUTH-01 logs in with local credentials and issues only a hashed Nexus session", async () => {
    const password = "correct horse battery staple 2026";
    await prisma.user.update({
      where: { id: borrower.userId },
      data: { passwordHash: await hashPassword(password) },
    });
    const response = await login(new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: borrower.email, password }),
    }));
    const data = await expectApiSuccess<{ id: string; email: string; roles: string[] }>(response);
    expect(data).toMatchObject({ id: borrower.userId, email: borrower.email, roles: ["BORROWER"] });
    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("nexus_session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");
    const rawToken = /nexus_session=([^;]+)/.exec(setCookie ?? "")?.[1];
    expect(rawToken).toBeTruthy();
    const session = await prisma.session.findFirstOrThrow({
      where: { userId: borrower.userId, sessionTokenHash: tokenHash(decodeURIComponent(rawToken!)) },
    });
    expect(session.sessionTokenHash).not.toBe(decodeURIComponent(rawToken!));
    await expectApiSuccess(await getCurrentUser(new Request("http://localhost/api/auth/me", {
      headers: { cookie: `nexus_session=${rawToken}` },
    })));
    expect(JSON.stringify(data)).not.toContain(password);
  });

  it("AUTH-02 rejects invalid local credentials without creating a session", async () => {
    await prisma.user.update({
      where: { id: borrower.userId },
      data: { passwordHash: await hashPassword("correct horse battery staple 2026") },
    });
    const sessionsBefore = await prisma.session.count({ where: { userId: borrower.userId } });
    const response = await login(new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: borrower.email, password: "incorrect password" }),
    }));
    await expectApiError(response, { status: 401, code: "UNAUTHENTICATED" });
    expect(await prisma.session.count({ where: { userId: borrower.userId } })).toBe(sessionsBefore);
  });

  it("AUTH-03 logs out by revoking the current Nexus session", async () => {
    const password = "correct horse battery staple 2026";
    await prisma.user.update({
      where: { id: borrower.userId },
      data: { passwordHash: await hashPassword(password) },
    });
    const loginResponse = await login(new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: borrower.email, password }),
    }));
    const cookie = loginResponse.headers.get("set-cookie")?.split(";")[0];
    const rawToken = cookie?.split("=")[1];
    expect(rawToken).toBeTruthy();
    const logoutResponse = await logout(new Request("http://localhost/api/auth/logout", {
      method: "POST",
      headers: { cookie: cookie! },
    }));
    await expectApiSuccess(logoutResponse);
    const session = await prisma.session.findFirstOrThrow({
      where: { userId: borrower.userId, sessionTokenHash: tokenHash(decodeURIComponent(rawToken!)) },
    });
    expect(session.revokedAt).toBeInstanceOf(Date);
    expect(logoutResponse.headers.get("set-cookie")).toContain("Max-Age=0");
    await expectApiError(await getCurrentUser(new Request("http://localhost/api/auth/me", {
      headers: { cookie: cookie! },
    })), { status: 401, code: "UNAUTHENTICATED" });
  });

  it("AUTH-04 links only a verified OAuth identity to an existing active Nexus user", async () => {
    const linkedUserId = await linkVerifiedOAuthIdentity({
      provider: "nexus-oidc",
      providerAccountId: `subject-${randomUUID()}`,
      email: borrower.email,
      emailVerified: true,
    });
    expect(linkedUserId).toBe(borrower.userId);
    await expect(prisma.oAuthAccount.findFirstOrThrow({ where: { userId: borrower.userId, provider: "nexus-oidc" } }))
      .resolves.toMatchObject({ userId: borrower.userId });
  });

  it("AUTH-05 refuses unverified OAuth email and never provisions an account implicitly", async () => {
    const noAccountUserCount = await prisma.user.count();
    const linkedUserId = await linkVerifiedOAuthIdentity({
      provider: "nexus-oidc",
      providerAccountId: `subject-${randomUUID()}`,
      email: `missing-${randomUUID()}@api.test`,
      emailVerified: false,
    });
    expect(linkedUserId).toBeNull();
    expect(await prisma.user.count()).toBe(noAccountUserCount);
  });

  it("AUTH-06 refuses an OAuth subject already linked to another Nexus account", async () => {
    const providerAccountId = `subject-${randomUUID()}`;
    await expect(linkVerifiedOAuthIdentity({
      provider: "nexus-oidc",
      providerAccountId,
      email: borrower.email,
      emailVerified: true,
    })).resolves.toBe(borrower.userId);
    await expect(linkVerifiedOAuthIdentity({
      provider: "nexus-oidc",
      providerAccountId,
      email: investor.email,
      emailVerified: true,
    })).resolves.toBeNull();
    await expect(prisma.oAuthAccount.findUniqueOrThrow({
      where: { provider_providerAccountId: { provider: "nexus-oidc", providerAccountId } },
    })).resolves.toMatchObject({ userId: borrower.userId });
  });

  it("AUTH-07 configures OAuth as an OpenID Connect flow with state and PKCE checks", () => {
    const provider = createNexusOidcProvider({
      issuer: "https://identity.example.test",
      clientId: "nexus-web-client",
      clientSecret: "test-only-secret",
    });
    expect(provider).toMatchObject({
      id: "nexus-oidc",
      type: "oauth",
      wellKnown: "https://identity.example.test/.well-known/openid-configuration",
    });
    expect(provider.checks).toEqual(expect.arrayContaining(["state", "pkce"]));
  });

  it("API-02-02 rejects a request without a session", async () => {
    await expectApiError(await getCurrentUser(new Request("http://localhost/api/auth/me")), {
      status: 401, code: "UNAUTHENTICATED",
    });
  });

  it("API-02-03 through API-02-05 allow each user's assigned role", async () => {
    const borrowerIdentity = await authenticateApiRequest(authenticatedRequest(borrower.token));
    const investorIdentity = await authenticateApiRequest(authenticatedRequest(investor.token));
    const adminIdentity = await authenticateApiRequest(authenticatedRequest(administrator.token));
    expect(requireRole(borrowerIdentity, "BORROWER").userId).toBe(borrower.userId);
    expect(requireRole(investorIdentity, "INVESTOR").userId).toBe(investor.userId);
    expect(requireRole(adminIdentity, "ADMIN").userId).toBe(administrator.userId);
  });

  it("API-02-06 rejects a borrower from administrator-only operations", async () => {
    const identity = await authenticateApiRequest(authenticatedRequest(borrower.token));
    try {
      requireRole(identity, "ADMIN");
      throw new Error("Expected a borrower to be denied administrator access");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ code: "FORBIDDEN", status: 403 });
    }
  });

  it("API-02-07 ignores a caller-supplied user ID and enforces session ownership", async () => {
    const identity = await authenticateApiRequest(authenticatedRequest(borrower.token));
    try {
      assertResourceOwner(identity, investor.userId);
      throw new Error("Expected cross-user ownership check to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({ code: "FORBIDDEN", status: 403 });
    }
    expect(assertResourceOwner(identity, borrower.userId)).toBe(identity);
    const request = createAuthenticatedApiRequest(
      `http://localhost/api/users/me?userId=${investor.userId}`,
      { userId: "untrusted", role: "INVESTOR", sessionCookie: borrower.token, cookieName: "nexus_session" },
    );
    const response = await getMyProfile(request);
    const profile = await expectApiSuccess<{ userId: string }>(response);
    expect(profile.userId).toBe(borrower.userId);
  });

  it("API-02-08 updates only the authenticated investor's permitted profile field", async () => {
    const request = authenticatedRequest(investor.token, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ displayName: "Updated investor" }),
    });
    const response = await patchMyProfile(request);
    const data = await expectApiSuccess<{ userId: string; displayName: string }>(response);
    expect(data.userId).toBe(investor.userId);
    expect(data.displayName).toBe("Updated investor");
    await expect(prisma.investorProfile.findUniqueOrThrow({ where: { userId: investor.userId } }))
      .resolves.toMatchObject({ displayName: "Updated investor" });
  });

  it("API-02-09 rejects attempts to change protected identity fields", async () => {
    const request = authenticatedRequest(borrower.token, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: investor.userId, accountStatus: "ADMIN" }),
    });
    await expectApiError(await patchMyProfile(request), {
      status: 400, code: "VALIDATION_ERROR",
    });
    await expect(prisma.user.findUniqueOrThrow({ where: { id: borrower.userId } }))
      .resolves.toMatchObject({ accountStatus: "ACTIVE" });
  });

  it("API-02-10 rejects invalid, expired, and revoked sessions", async () => {
    const invalidResponse = await getMyProfile(authenticatedRequest("invalid-session-token"));
    await expectApiError(invalidResponse, { status: 401, code: "UNAUTHENTICATED" });

    const expiredToken = randomBytes(32).toString("base64url");
    await prisma.session.create({
      data: {
        userId: borrower.userId,
        sessionTokenHash: tokenHash(expiredToken),
        expiresAt: new Date(Date.now() - 1000),
      },
    });
    await expectApiError(await getMyProfile(authenticatedRequest(expiredToken)), {
      status: 401, code: "UNAUTHENTICATED",
    });

    const revokedToken = randomBytes(32).toString("base64url");
    await prisma.session.create({
      data: {
        userId: borrower.userId,
        sessionTokenHash: tokenHash(revokedToken),
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: new Date(),
        revokeReason: "TEST",
      },
    });
    await expectApiError(await getMyProfile(authenticatedRequest(revokedToken)), {
      status: 401, code: "UNAUTHENTICATED",
    });
  });
});
