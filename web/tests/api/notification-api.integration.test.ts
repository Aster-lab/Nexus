import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { GET as listNotifications } from "../../src/app/api/notifications/route";
import { PATCH as markNotificationRead } from "../../src/app/api/notifications/[notificationId]/read/route";
import { prisma } from "../../src/lib/prisma";
import { createAuthenticatedApiRequest, expectApiError, expectApiSuccess } from "../helpers/api";

interface TestUser { id: string; token: string }
const users: TestUser[] = [];
const notificationIds: string[] = [];

async function createUser(): Promise<TestUser> {
  const role = await prisma.role.upsert({ where: { code: "BORROWER" }, create: { code: "BORROWER", name: "Borrower" }, update: {}, select: { id: true } });
  const user = await prisma.user.create({ data: { email: `${randomUUID()}@notification.test`, accountStatus: "ACTIVE" }, select: { id: true } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({ data: { userId: user.id, sessionTokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 60_000) } });
  const result = { id: user.id, token };
  users.push(result);
  return result;
}

async function createNotification(userId: string, data: { status?: "READ" | "UNREAD"; actionPath?: string | null } = {}) {
  const notification = await prisma.notification.create({ data: {
    userId, category: "APPLICATION", title: "Application update", content: "Your application status changed.",
    status: data.status ?? "UNREAD", actionPath: data.actionPath ?? null,
  }, select: { id: true } });
  notificationIds.push(notification.id);
  return notification.id;
}

function request(url: string, user: TestUser) {
  return createAuthenticatedApiRequest(url, { userId: user.id, role: "BORROWER", sessionCookie: user.token });
}

describe("authenticated notification APIs", () => {
  beforeEach(() => { users.length = 0; notificationIds.length = 0; });
  afterEach(async () => {
    await prisma.notification.deleteMany({ where: { id: { in: notificationIds } } });
    const userIds = users.map((user) => user.id);
    await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  });

  it("requires an authenticated session", async () => {
    await expectApiError(await listNotifications(new Request("http://localhost/api/notifications")), { status: 401, code: "UNAUTHENTICATED" });
  });

  it("lists only the current user's notifications with status filtering and safe action paths", async () => {
    const owner = await createUser();
    const other = await createUser();
    const ownId = await createNotification(owner.id, { actionPath: "/borrower/applications" });
    await createNotification(owner.id, { status: "READ" });
    await createNotification(other.id, { actionPath: "/admin/users" });

    const response = await listNotifications(request("http://localhost/api/notifications?status=UNREAD", owner));
    const data = await expectApiSuccess<{ items: Array<{ id: string; status: string; actionPath: string | null }>; unreadCount: number }>(response);
    expect(data.items).toEqual([expect.objectContaining({ id: ownId, status: "UNREAD", actionPath: "/borrower/applications" })]);
    expect(data.unreadCount).toBe(1);
    expect(response.headers.get("cache-control")).toContain("no-store");
  });

  it("marks an owned notification read and treats a repeated read as idempotent", async () => {
    const owner = await createUser();
    const notificationId = await createNotification(owner.id);
    const first = await markNotificationRead(request(`http://localhost/api/notifications/${notificationId}/read`, owner), { params: Promise.resolve({ notificationId }) });
    expect(await expectApiSuccess<{ id: string; status: string }>(first)).toMatchObject({ id: notificationId, status: "READ" });
    const repeated = await markNotificationRead(request(`http://localhost/api/notifications/${notificationId}/read`, owner), { params: Promise.resolve({ notificationId }) });
    expect(await expectApiSuccess<{ id: string; status: string }>(repeated)).toMatchObject({ id: notificationId, status: "READ" });
  });

  it("does not allow another account to read a notification or inject an external destination", async () => {
    const owner = await createUser();
    const other = await createUser();
    const notificationId = await createNotification(owner.id, { actionPath: "/borrower/loans" });
    const forbidden = await markNotificationRead(request(`http://localhost/api/notifications/${notificationId}/read`, other), { params: Promise.resolve({ notificationId }) });
    await expectApiError(forbidden, { status: 404, code: "NOT_FOUND" });

    const unsafeTitle = `Unsafe ${randomUUID()}`;
    await expect(prisma.notification.create({ data: {
      userId: owner.id, category: "APPLICATION", title: unsafeTitle, content: "Unsafe destination", actionPath: "https://example.com",
    } })).rejects.toThrow();
    expect(await prisma.notification.count({ where: { userId: owner.id, title: unsafeTitle } })).toBe(0);
  });
});
