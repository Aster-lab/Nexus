import { describe, expect, it, vi } from "vitest";

const { getMock, patchMock } = vi.hoisted(() => ({ getMock: vi.fn(), patchMock: vi.fn() }));
vi.mock("../../../src/lib/client/api-client", () => ({ apiGet: getMock, apiPatch: patchMock }));

import { getNotificationsPath, listNotifications, markNotificationRead } from "../../../src/lib/client/notifications";

describe("notification API client", () => {
  it("builds same-origin paginated filters", () => {
    expect(getNotificationsPath({ status: "UNREAD", page: 2, limit: 10 })).toBe("/api/notifications?status=UNREAD&page=2&limit=10");
  });

  it("loads the current user's notification summary and marks one item read", async () => {
    getMock.mockResolvedValue({ data: { items: [], unreadCount: 2, pagination: { total: 0 } } });
    patchMock.mockResolvedValue({ data: { id: "n-1", status: "READ" } });
    await listNotifications();
    await markNotificationRead("n-1");
    expect(getMock).toHaveBeenCalledWith("/api/notifications?limit=20");
    expect(patchMock).toHaveBeenCalledWith("/api/notifications/n-1/read", {});
  });
});
