import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as borrowerTopUp } from "../../src/app/api/borrower/wallet/top-ups/route";
import { POST as investorTopUp } from "../../src/app/api/investor/wallet/top-ups/route";
import { prisma } from "../../src/lib/prisma";
import { createAuthenticatedApiRequest, expectApiError, expectApiSuccess, type ApiTestRole } from "../helpers/api";

type Principal = { userId: string; role: ApiTestRole; token: string; walletId: string };
const principals: Principal[] = [];
let sourceAccountStatus: "ACTIVE" | "INACTIVE" | null = null;

async function createPrincipal(roleCode: "BORROWER" | "INVESTOR"): Promise<Principal> {
  const role = await prisma.role.upsert({ where: { code: roleCode }, create: { code: roleCode, name: roleCode }, update: {}, select: { id: true } });
  const user = await prisma.user.create({ data: { email: `${randomUUID()}@wallet-top-up.test`, accountStatus: "ACTIVE" }, select: { id: true } });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  if (roleCode === "BORROWER") await prisma.borrowerProfile.create({ data: { userId: user.id, legalName: "Top-up test borrower", address: {} } });
  else await prisma.investorProfile.create({ data: { userId: user.id, displayName: "Top-up test investor" } });
  const wallet = await prisma.wallet.create({ data: { ownerUserId: user.id, currency: "THB", balanceSatang: 0n, status: "ACTIVE" }, select: { id: true } });
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({ data: { userId: user.id, sessionTokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 60 * 60 * 1000) } });
  const principal = { userId: user.id, role: roleCode, token, walletId: wallet.id };
  principals.push(principal);
  return principal;
}

function request(principal: Principal, amountSatang: string, idempotencyKey: string): Request {
  return createAuthenticatedApiRequest(`http://localhost/api/${principal.role.toLowerCase()}/wallet/top-ups`, { userId: principal.userId, role: principal.role, sessionCookie: principal.token }, {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": idempotencyKey },
    body: JSON.stringify({ amountSatang }),
  });
}

describe("simulated wallet top-ups", () => {
  beforeAll(async () => {
    const source = await prisma.platformAccount.findUniqueOrThrow({ where: { accountCode: "1300" }, select: { id: true, status: true } });
    sourceAccountStatus = source.status;
    if (source.status !== "ACTIVE") await prisma.platformAccount.update({ where: { id: source.id }, data: { status: "ACTIVE" } });
  });

  afterAll(async () => {
    if (principals.length) await prisma.session.deleteMany({ where: { userId: { in: principals.map(({ userId }) => userId) } } });
    const source = await prisma.platformAccount.findUnique({ where: { accountCode: "1300" }, select: { id: true, status: true } });
    if (source && sourceAccountStatus && source.status !== sourceAccountStatus) await prisma.platformAccount.update({ where: { id: source.id }, data: { status: sourceAccountStatus } });
  });

  it.each(["BORROWER", "INVESTOR"] as const)("posts a balanced, audited simulated top-up for a %s wallet", async (role) => {
    const principal = await createPrincipal(role);
    const key = `wallet-top-up-${randomUUID()}`;
    const post = role === "BORROWER" ? borrowerTopUp : investorTopUp;
    const result = await expectApiSuccess<{ walletId: string; amountSatang: string; balanceSatang: string; ledgerTransactionId: string; status: string; simulated: boolean }>(await post(request(principal, "125000", key)), 201);

    expect(result).toMatchObject({ walletId: principal.walletId, amountSatang: "125000", balanceSatang: "125000", status: "POSTED", simulated: true });
    const transaction = await prisma.ledgerTransaction.findUniqueOrThrow({ where: { id: result.ledgerTransactionId }, include: { entries: { include: { platformAccount: true } } } });
    expect(transaction.status).toBe("POSTED");
    expect(transaction.entries).toHaveLength(2);
    expect(transaction.entries).toEqual(expect.arrayContaining([
      expect.objectContaining({ platformAccount: expect.objectContaining({ accountCode: "1300" }), entryType: "DEBIT", amountSatang: 125000n }),
      expect.objectContaining({ walletId: principal.walletId, entryType: "CREDIT", amountSatang: 125000n }),
    ]));
    await expect(prisma.wallet.findUniqueOrThrow({ where: { id: principal.walletId }, select: { balanceSatang: true } })).resolves.toEqual({ balanceSatang: 125000n });
    await expect(prisma.auditLog.findFirst({ where: { actorUserId: principal.userId, targetId: result.ledgerTransactionId, action: "SIMULATED_WALLET_TOP_UP_POSTED", outcome: "SUCCESS" } })).resolves.not.toBeNull();
  });

  it("reuses an identical idempotent request and rejects a changed amount", async () => {
    const principal = await createPrincipal("INVESTOR");
    const key = `wallet-top-up-${randomUUID()}`;
    const first = await expectApiSuccess<{ ledgerTransactionId: string }>(await investorTopUp(request(principal, "70000", key)), 201);
    const replay = await expectApiSuccess<{ ledgerTransactionId: string; reused: boolean }>(await investorTopUp(request(principal, "70000", key)));
    expect(replay).toMatchObject({ ledgerTransactionId: first.ledgerTransactionId, reused: true });
    await expectApiError(await investorTopUp(request(principal, "80000", key)), { status: 409, code: "IDEMPOTENCY_KEY_CONFLICT" });
    await expect(prisma.ledgerTransaction.count({ where: { idempotencyKey: key, status: "POSTED" } })).resolves.toBe(1);
    await expect(prisma.wallet.findUniqueOrThrow({ where: { id: principal.walletId }, select: { balanceSatang: true } })).resolves.toEqual({ balanceSatang: 70000n });
  });

  it("resolves concurrent duplicate submissions to one ledger credit", async () => {
    const principal = await createPrincipal("BORROWER");
    const key = `wallet-top-up-${randomUUID()}`;
    const responses = await Promise.all([
      borrowerTopUp(request(principal, "9900", key)),
      borrowerTopUp(request(principal, "9900", key)),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 201]);
    const results = await Promise.all(responses.map((response) => expectApiSuccess<{ ledgerTransactionId: string }>(response, response.status)));
    expect(results[0].ledgerTransactionId).toBe(results[1].ledgerTransactionId);
    await expect(prisma.ledgerTransaction.count({ where: { idempotencyKey: key, status: "POSTED" } })).resolves.toBe(1);
    await expect(prisma.ledgerEntry.count({ where: { ledgerTransaction: { idempotencyKey: key } } })).resolves.toBe(2);
    await expect(prisma.wallet.findUniqueOrThrow({ where: { id: principal.walletId }, select: { balanceSatang: true } })).resolves.toEqual({ balanceSatang: 9900n });
  });

  it("rejects a top-up above THB 50,000 without consuming its idempotency key", async () => {
    const principal = await createPrincipal("BORROWER");
    const key = `wallet-top-up-${randomUUID()}`;
    await expectApiError(await borrowerTopUp(request(principal, "5000001", key)), { status: 400, code: "VALIDATION_ERROR" });
    await expect(prisma.ledgerTransaction.findUnique({ where: { idempotencyKey: key } })).resolves.toBeNull();
    await expect(prisma.wallet.findUniqueOrThrow({ where: { id: principal.walletId }, select: { balanceSatang: true } })).resolves.toEqual({ balanceSatang: 0n });
  });

  it("does not allow an investor identity to use the borrower top-up endpoint", async () => {
    const principal = await createPrincipal("INVESTOR");
    await expectApiError(await borrowerTopUp(request(principal, "10000", `wallet-top-up-${randomUUID()}`)), { status: 403, code: "FORBIDDEN" });
  });

  it("rejects an unavailable simulated funding source without persisting partial records", async () => {
    const principal = await createPrincipal("INVESTOR");
    const source = await prisma.platformAccount.findUniqueOrThrow({ where: { accountCode: "1300" }, select: { id: true, status: true } });
    await prisma.platformAccount.update({ where: { id: source.id }, data: { status: "INACTIVE" } });
    const key = `wallet-top-up-${randomUUID()}`;
    try {
      await expectApiError(await investorTopUp(request(principal, "10000", key)), { status: 503, code: "SOURCE_ACCOUNT_UNAVAILABLE" });
    } finally {
      await prisma.platformAccount.update({ where: { id: source.id }, data: { status: source.status } });
    }
    await expect(prisma.ledgerTransaction.findUnique({ where: { idempotencyKey: key } })).resolves.toBeNull();
    await expect(prisma.idempotencyRecord.findUnique({ where: { idempotencyKey: key } })).resolves.toBeNull();
    await expect(prisma.wallet.findUniqueOrThrow({ where: { id: principal.walletId }, select: { balanceSatang: true } })).resolves.toEqual({ balanceSatang: 0n });
  });
});
