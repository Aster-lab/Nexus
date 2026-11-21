import { createHmac } from "node:crypto";
import { prisma } from "../prisma";

export type AuthRateLimitSubjectKind = "EMAIL" | "IP";

export interface AuthRateLimitSubject {
  kind: AuthRateLimitSubjectKind;
  value: string;
  maxAttempts: number;
  windowSeconds: number;
}

export interface AuthRateLimitResult {
  limited: boolean;
  retryAfterSeconds: number;
}

function normalizedValue(subject: AuthRateLimitSubject): string {
  const value = subject.kind === "EMAIL"
    ? subject.value.trim().toLowerCase()
    : subject.value.trim();
  if (!value || value.length > 255) throw new Error("Invalid authentication rate-limit subject.");
  if (!Number.isSafeInteger(subject.maxAttempts) || subject.maxAttempts < 1 ||
      !Number.isSafeInteger(subject.windowSeconds) || subject.windowSeconds < 1) {
    throw new Error("Invalid authentication rate-limit policy.");
  }
  return value;
}

function subjectReference(subject: AuthRateLimitSubject, value: string): string {
  const secret = process.env.AUTH_RATE_LIMIT_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("Authentication rate-limit hashing secret is not configured.");
  }
  return createHmac("sha256", secret)
    .update(`${subject.kind}:${value}`)
    .digest("hex");
}

/**
 * Atomically record an authentication attempt and determine whether its
 * account/network subjects have exceeded their shared database-backed limits.
 * Values are HMACed before persistence so email addresses and IPs are not logged.
 */
export async function consumeAuthRateLimit(
  eventType: "AUTH_LOGIN_ATTEMPT" | "AUTH_REGISTER_ATTEMPT",
  subjects: AuthRateLimitSubject[],
  now = new Date(),
): Promise<AuthRateLimitResult> {
  if (!subjects.length) throw new Error("At least one authentication rate-limit subject is required.");

  const records = subjects.map((subject) => {
    const value = normalizedValue(subject);
    return { subject, sourceReference: subjectReference(subject, value) };
  });
  const uniqueRecords = [...new Map(records.map((record) => [record.sourceReference, record])).values()];

  return prisma.$transaction(async (tx) => {
    const lockKeys = uniqueRecords
      .map(({ sourceReference }) => `${eventType}:${sourceReference}`)
      .sort();
    for (const lockKey of lockKeys) {
      await tx.$queryRaw<Array<{ locked: number }>>`
        WITH acquired AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(hashtextextended(${lockKey}, 0))
        )
        SELECT 1 AS locked FROM acquired
      `;
    }

    const windows: Array<{
      subject: AuthRateLimitSubject;
      sourceReference: string;
      limited: boolean;
      retryAfterSeconds: number;
    }> = [];
    for (const { subject, sourceReference } of uniqueRecords) {
      const windowStart = new Date(now.getTime() - subject.windowSeconds * 1000);
      const [usage] = await tx.$queryRaw<Array<{ attempts: number; oldestAttempt: Date | null }>>`
        SELECT COUNT(*)::int AS attempts, MIN(created_at) AS "oldestAttempt"
        FROM security_events
        WHERE event_type = ${eventType}
          AND source_reference = ${sourceReference}
          AND created_at >= ${windowStart}
      `;
      const limited = usage.attempts >= subject.maxAttempts;
      const retryAt = usage.oldestAttempt
        ? new Date(usage.oldestAttempt.getTime() + subject.windowSeconds * 1000)
        : now;
      windows.push({
        subject,
        sourceReference,
        limited,
        retryAfterSeconds: limited
          ? Math.max(1, Math.ceil((retryAt.getTime() - now.getTime()) / 1000))
          : 0,
      });
    }

    const limited = windows.some(({ limited: isLimited }) => isLimited);
    await tx.securityEvent.createMany({
      data: windows.map(({ subject, sourceReference }) => ({
        eventType,
        severity: limited ? "HIGH" : "INFO",
        sourceReference,
        outcome: limited ? "RATE_LIMITED" : "ATTEMPT",
        metadata: { subjectKind: subject.kind },
        createdAt: now,
      })),
    });

    return {
      limited,
      retryAfterSeconds: limited
        ? Math.max(...windows.map(({ retryAfterSeconds }) => retryAfterSeconds))
        : 0,
    };
  });
}

export async function checkCredentialsLoginRateLimit(email: string): Promise<AuthRateLimitResult> {
  return consumeAuthRateLimit("AUTH_LOGIN_ATTEMPT", [
    { kind: "EMAIL", value: email, maxAttempts: 8, windowSeconds: 900 },
  ]);
}

export function authRateLimitSubjects(
  request: Request,
  email: string,
  emailPolicy: Pick<AuthRateLimitSubject, "maxAttempts" | "windowSeconds">,
  ipPolicy: Pick<AuthRateLimitSubject, "maxAttempts" | "windowSeconds">,
): AuthRateLimitSubject[] {
  const forwarded = request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const subjects: AuthRateLimitSubject[] = [
    { kind: "EMAIL", value: email, ...emailPolicy },
  ];
  if (forwarded && forwarded.length <= 255) {
    subjects.push({ kind: "IP", value: forwarded, ...ipPolicy });
  }
  return subjects;
}
