import type { Prisma } from "../../src/generated/prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createInAppNotification } from "../../src/lib/services/notification.service";

describe("transactional in-app notification helper", () => {
  it("persists an unread notice through the caller's transaction", async () => {
    const create = vi.fn(async () => ({ id: "notification-1" }));
    const tx = { notification: { create } } as unknown as Prisma.TransactionClient;

    await createInAppNotification(tx, {
      userId: "user-1", category: "APPLICATION_STATUS", title: "Application update",
      content: "Your application has been approved.", actionPath: "/borrower/applications/app-1",
    });

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      userId: "user-1", category: "APPLICATION_STATUS", status: "UNREAD",
      actionPath: "/borrower/applications/app-1",
    }), select: { id: true } }));
  });

  it("supports notices without a destination", async () => {
    const create = vi.fn(async () => ({ id: "notification-2" }));
    const tx = { notification: { create } } as unknown as Prisma.TransactionClient;
    await createInAppNotification(tx, {
      userId: "user-1", category: "REPAYMENT", title: "Payment posted", content: "Your payment is confirmed.",
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ actionPath: null, status: "UNREAD" }), select: { id: true } }));
  });
});
