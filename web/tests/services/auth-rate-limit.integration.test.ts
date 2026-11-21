import { createHmac, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "../../src/lib/prisma";
import {
  checkCredentialsLoginRateLimit,
  consumeAuthRateLimit,
} from "../../src/lib/api/auth-rate-limit";
import { POST as login } from "../../src/app/api/auth/login/route";
import { POST as register } from "../../src/app/api/auth/register/route";

const secret = "wp11-auth-rate-limit-test-secret-32-bytes";
const savedSecret = process.env.NEXTAUTH_SECRET;
const savedRateLimitSecret = process.env.AUTH_RATE_LIMIT_SECRET;
const action = "AUTH_LOGIN_ATTEMPT";
const subject = (email: string, maxAttempts = 2, windowSeconds = 900) => ({
  kind: "EMAIL" as const,
  value: email,
  maxAttempts,
  windowSeconds,
});

function sourceReference(email: string): string {
  const normalized = email.trim().toLowerCase();
  const activeSecret = process.env.AUTH_RATE_LIMIT_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!activeSecret) throw new Error("Test authentication rate-limit secret is unavailable.");
  return createHmac("sha256", activeSecret).update(`EMAIL:${normalized}`).digest("hex");
}

beforeEach(() => {
  process.env.NEXTAUTH_SECRET = secret;
  process.env.AUTH_RATE_LIMIT_SECRET = secret;
});

afterEach(() => {
  if (savedSecret === undefined) delete process.env.NEXTAUTH_SECRET;
  else process.env.NEXTAUTH_SECRET = savedSecret;
  if (savedRateLimitSecret === undefined) delete process.env.AUTH_RATE_LIMIT_SECRET;
  else process.env.AUTH_RATE_LIMIT_SECRET = savedRateLimitSecret;
});

describe("shared database authentication rate limit", () => {
  it("allows configured attempts, then reports the retry window without storing the identifier", async () => {
    const email = `rate-${randomUUID()}@example.test`;
    const now = new Date();

    const first = await consumeAuthRateLimit(action, [subject(email)], now);
    const second = await consumeAuthRateLimit(action, [subject(email)], new Date(now.getTime() + 1));
    const third = await consumeAuthRateLimit(action, [subject(email)], new Date(now.getTime() + 2));

    expect([first.limited, second.limited, third.limited]).toEqual([false, false, true]);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);

    const events = await prisma.securityEvent.findMany({
      where: { eventType: action, sourceReference: sourceReference(email) },
      orderBy: { createdAt: "asc" },
      select: { sourceReference: true, outcome: true, metadata: true },
    });
    expect(events).toHaveLength(3);
    expect(events.map(({ outcome }) => outcome).sort()).toEqual([
      "ATTEMPT",
      "ATTEMPT",
      "RATE_LIMITED",
    ]);
    expect(events.every(({ sourceReference }) => sourceReference !== email)).toBe(true);
    expect(events.every(({ metadata }) => !JSON.stringify(metadata).includes(email))).toBe(true);
  });

  it("enforces a shared limit under concurrent requests without losing increments", async () => {
    const email = `concurrent-${randomUUID()}@example.test`;
    const now = new Date();
    const attempts = await Promise.all(
      Array.from({ length: 6 }, () => consumeAuthRateLimit(
        action,
        [subject(email, 3)],
        now,
      )),
    );

    expect(attempts.filter(({ limited }) => !limited)).toHaveLength(3);
    expect(attempts.filter(({ limited }) => limited)).toHaveLength(3);
    expect(await prisma.securityEvent.count({
      where: { eventType: action, sourceReference: sourceReference(email) },
    })).toBe(6);
  });

  it("starts a new window after the configured interval", async () => {
    const email = `window-${randomUUID()}@example.test`;
    const start = new Date();
    expect((await consumeAuthRateLimit(action, [subject(email)], start)).limited).toBe(false);
    expect((await consumeAuthRateLimit(
      action,
      [subject(email)],
      new Date(start.getTime() + 901_000),
    )).limited).toBe(false);
  });

  it("returns 429 with Retry-After after repeated sign-in failures", async () => {
    const email = `login-route-${randomUUID()}@example.test`;
    const ip = `2001:db8:${randomUUID().replaceAll("-", "").match(/.{1,4}/g)!.join(":")}`;
    const request = () => new Request("http://localhost/api/auth/login", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": ip },
      body: JSON.stringify({ email, password: "incorrect-password" }),
    });

    for (let attempt = 0; attempt < 8; attempt += 1) {
      expect((await login(request())).status).toBe(401);
    }
    const blocked = await login(request());
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
    expect(await blocked.json()).toMatchObject({
      success: false,
      error: { code: "RATE_LIMITED" },
    });
  });

  it("limits the directly reachable NextAuth credentials-provider path", async () => {
    const email = `nextauth-${randomUUID()}@example.test`;
    const attempts = [];
    for (let attempt = 0; attempt < 9; attempt += 1) {
      attempts.push(await checkCredentialsLoginRateLimit(email));
    }
    expect(attempts.slice(0, 8).every(({ limited }) => !limited)).toBe(true);
    expect(attempts[8].limited).toBe(true);
  });

  it("returns 429 for repeated registration attempts without creating an account", async () => {
    const email = `duplicate-${randomUUID()}@example.test`;
    const temporaryUser = await prisma.user.create({ data: { email }, select: { id: true } });
    const request = () => new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email,
        password: "ValidPassword-123!",
        roles: ["INVESTOR"],
        investorProfile: { displayName: "Rate limit verification" },
      }),
    });

    try {
      for (let attempt = 0; attempt < 3; attempt += 1) {
        expect((await register(request())).status).toBe(409);
      }
      const blocked = await register(request());
      expect(blocked.status).toBe(429);
      expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0);
      expect(await blocked.json()).toMatchObject({
        success: false,
        error: { code: "RATE_LIMITED" },
      });
    } finally {
      await prisma.user.delete({ where: { id: temporaryUser.id } });
    }
  });
});
