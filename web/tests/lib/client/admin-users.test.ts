import { describe, expect, it } from "vitest";
import { getAdminUsersPath, getAdminUserPath, updateAdminUserStatus } from "../../../src/lib/client/admin-users";

describe("WP9.6.7 administrator user client", () => {
  it("builds only supported list filters and sort values", () => {
    expect(getAdminUsersPath({ page: 2, limit: 10, accountStatus: "ACTIVE", role: "INVESTOR", sortBy: "email", sortOrder: "asc" })).toBe("/api/admin/users?page=2&limit=10&sortBy=email&sortOrder=asc&accountStatus=ACTIVE&role=INVESTOR");
  });
  it("sends account status through the supported PATCH operation", async () => {
    const calls: unknown[][] = [];
    await updateAdminUserStatus("user-1", "RESTRICTED", async (...args: unknown[]) => { calls.push(args); return { success: true, message: "Updated", data: { id: "user-1", accountStatus: "RESTRICTED" } } as never; });
    expect(calls[0][0]).toBe("/api/admin/users/user-1");
    expect(calls[0][1]).toEqual({ accountStatus: "RESTRICTED" });
  });
  it("encodes a user identifier in a detail path only for UI row identity", () => {
    expect(getAdminUserPath("user / 1")).toBe("/api/admin/users/user%20%2F%201");
  });
});
