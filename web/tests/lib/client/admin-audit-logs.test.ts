import { describe, expect, it } from "vitest";
import { getAdminAuditLogsPath } from "../../../src/lib/client/admin-audit-logs";

describe("WP9.6.8 administrator audit client", () => {
  it("uses only supported audit filters and newest-first pagination", () => {
    expect(getAdminAuditLogsPath({ page: 1, limit: 10, action: "REPAYMENT_SUBMITTED", targetType: "REPAYMENT", targetId: "", actorUserId: "actor-1", sortOrder: "desc" })).toBe("/api/admin/audit-logs?page=1&limit=10&sortBy=createdAt&sortOrder=desc&action=REPAYMENT_SUBMITTED&targetType=REPAYMENT&actorUserId=actor-1");
  });
});
