import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Prisma } from "../../src/generated/prisma/client";

const { transactionMock, userRoleFindFirst, roleFindUnique, userFindFirst, userCreate, userRoleCreate, eventCreate } = vi.hoisted(() => ({
  transactionMock: vi.fn(),
  userRoleFindFirst: vi.fn(),
  roleFindUnique: vi.fn(),
  userFindFirst: vi.fn(),
  userCreate: vi.fn(),
  userRoleCreate: vi.fn(),
  eventCreate: vi.fn(),
}));

vi.mock("../../src/lib/prisma", () => ({
  prisma: { $transaction: transactionMock },
}));
vi.mock("../../src/lib/auth/password", () => ({ hashPassword: vi.fn(async () => "hashed-admin-password") }));

import { bootstrapFirstAdmin } from "../../src/lib/auth/bootstrap-admin";

describe("one-time administrator bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    transactionMock.mockImplementation(async (callback: (tx: Prisma.TransactionClient) => Promise<unknown>) => callback({
      $queryRaw: vi.fn(),
      userRole: { findFirst: userRoleFindFirst, create: userRoleCreate },
      role: { findUnique: roleFindUnique },
      user: { findFirst: userFindFirst, create: userCreate },
      securityEvent: { create: eventCreate },
    } as unknown as Prisma.TransactionClient));
    userRoleFindFirst.mockResolvedValue(null);
    roleFindUnique.mockResolvedValue({ id: "admin-role-id", code: "ADMIN" });
    userFindFirst.mockResolvedValue(null);
    userCreate.mockResolvedValue({ id: "admin-user-id", email: "admin@example.test" });
    userRoleCreate.mockResolvedValue({ id: "role-assignment-id" });
    eventCreate.mockResolvedValue({ id: "event-id" });
  });

  it("creates one active administrator, hashes credentials, and records the bootstrap event atomically", async () => {
    await expect(bootstrapFirstAdmin({ email: "Admin@Example.Test", password: "a secure admin password" }))
      .resolves.toMatchObject({ id: "admin-user-id", email: "admin@example.test" });

    expect(userCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      email: "admin@example.test", passwordHash: "hashed-admin-password", accountStatus: "ACTIVE",
    }) }));
    expect(userRoleCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      roleId: "admin-role-id", grantReason: "ONE_TIME_BOOTSTRAP",
    }) }));
    expect(eventCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      eventType: "ADMIN_BOOTSTRAP", outcome: "SUCCESS", userId: "admin-user-id",
    }) }));
  });

  it("refuses to run when any administrator role assignment already exists", async () => {
    userRoleFindFirst.mockResolvedValue({ id: "existing-admin-assignment" });

    await expect(bootstrapFirstAdmin({ email: "admin@example.test", password: "a secure admin password" }))
      .rejects.toThrow(/administrator has already been provisioned/i);
    expect(userCreate).not.toHaveBeenCalled();
  });

  it("rejects an existing email and does not create an administrator", async () => {
    userFindFirst.mockResolvedValue({ id: "existing-user" });

    await expect(bootstrapFirstAdmin({ email: "admin@example.test", password: "a secure admin password" }))
      .rejects.toThrow(/email is already registered/i);
    expect(userRoleCreate).not.toHaveBeenCalled();
  });
});
