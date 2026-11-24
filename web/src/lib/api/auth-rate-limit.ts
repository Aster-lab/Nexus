import { createHmac } from "node:crypto";
import { Prisma } from "../../generated/prisma/client";
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
    const lockValues = lockKeys.map((lockKey) => Prisma.sql`(${lockKey})`);
    await tx.$queryRaw<Array<{ locked: number }>>(Prisma.sql`
      WITH lock_keys(lock_key) AS (VALUES ${Prisma.join(lockValues)}),
      acquired AS MATERIALIZED (
        SELECT pg_advisory_xact_lock(hashtextextended(lock_key, 0))
        FROM lock_keys
        ORDER BY lock_key
      )
      SELECT COUNT(*)::int AS locked FROM acquired
    `);

    const windows: Array<{
      subject: AuthRateLimitSubject;
      sourceReference: string;
      limited: boolean;
      retryAfterSeconds: number;
    }> = [];
    const windowValues = uniqueRecords.map(({ subject, sourceReference }) => Prisma.sql`(
      ${sourceReference},
      CAST(${new Date(now.getTime() - subject.windowSeconds * 1000)} AS timestamptz),
      ${subject.maxAttempts}
    )`);
    const usages = await tx.$queryRaw<Array<{
      sourceReference: string;
      maxAttempts: number;
      attempts: number;
      oldestAttempt: Date | null;
    }>>(Prisma.sql`
      WITH limits(source_reference, window_start, max_attempts) AS (VALUES ${Prisma.join(windowValues)})
      SELECT limits.source_reference AS "sourceReference",
        limits.max_attempts AS "maxAttempts",
        COUNT(events.id)::int AS attempts,
        MIN(events.created_at) AS "oldestAttempt"
      FROM limits
      LEFT JOIN security_events AS events
        ON events.event_type = ${eventType}
        AND events.source_reference = limits.source_reference
        AND events.created_at >= limits.window_start
      GROUP BY limits.source_reference, limits.max_attempts
    `);
    const usageBySource = new Map(usages.map((usage) => [usage.sourceReference, usage]));
    for (const { subject, sourceReference } of uniqueRecords) {
      const usage = usageBySource.get(sourceReference);
      if (!usage) throw new Error("Authentication rate-limit query returned an incomplete result.");
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
