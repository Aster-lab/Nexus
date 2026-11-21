import { createHash, randomBytes, randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { GET as getAdministratorLoans } from "../../src/app/api/admin/loans/route";
import { GET as getBorrowerApplications, POST as createBorrowerApplication } from "../../src/app/api/borrower/applications/route";
import { POST as evaluateBorrower } from "../../src/app/api/ml/borrower-evaluation/route";
import { GET as getInvestorMarketplace } from "../../src/app/api/investor/marketplace/route";
import { prisma } from "../../src/lib/prisma";
import { createAuthenticatedApiRequest, expectApiError } from "../helpers/api";

type RoleCode = "BORROWER" | "INVESTOR";
type Principal = { userId: string; token: string; role: RoleCode; borrowerProfileId?: string };
const createdUserIds = new Set<string>();

async function createPrincipal(roleCode: RoleCode): Promise<Principal> {
  const role = await prisma.role.upsert({
    where: { code: roleCode },
    create: { code: roleCode, name: roleCode },
    update: {},
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { email: `${randomUUID()}@api-regression.test`, accountStatus: "ACTIVE" },
    select: { id: true },
  });
  createdUserIds.add(user.id);
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });

  let borrowerProfileId: string | undefined;
  if (roleCode === "BORROWER") {
    const profile = await prisma.borrowerProfile.create({
      data: { userId: user.id, legalName: "API Regression Borrower", address: { country: "Thailand" } },
      select: { id: true },
    });
    borrowerProfileId = profile.id;
  } else {
    await prisma.investorProfile.create({
      data: { userId: user.id, displayName: "API Regression Investor" },
    });
  }

  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      userId: user.id,
      sessionTokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
  return { userId: user.id, token, role: roleCode, borrowerProfileId };
}

function request(principal: Principal, url: string, init: RequestInit = {}): Request {
  return createAuthenticatedApiRequest(url, {
    userId: principal.userId,
    role: principal.role,
    sessionCookie: principal.token,
  }, init);
}

afterEach(async () => {
  const userIds = [...createdUserIds];
  if (!userIds.length) return;
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.borrowerProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.investorProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  createdUserIds.clear();
});

describe("API-07 cross-cutting API regression", () => {
  it("API-07-01 rejects unauthenticated requests across protected API surfaces", async () => {
    await expectApiError(
      await getBorrowerApplications(new Request("http://localhost/api/borrower/applications")),
      { status: 401, code: "UNAUTHENTICATED" },
    );
    await expectApiError(
      await getInvestorMarketplace(new Request("http://localhost/api/investor/marketplace")),
      { status: 401, code: "UNAUTHENTICATED" },
    );
    await expectApiError(
      await getAdministratorLoans(new Request("http://localhost/api/admin/loans")),
      { status: 401, code: "UNAUTHENTICATED" },
    );
  });

  it("API-07-02 enforces role boundaries across borrower, investor, administrator, and ML routes", async () => {
    const borrower = await createPrincipal("BORROWER");
    const investor = await createPrincipal("INVESTOR");

    await expectApiError(
      await getInvestorMarketplace(request(borrower, "http://localhost/api/investor/marketplace")),
      { status: 403, code: "FORBIDDEN" },
    );
    await expectApiError(
      await getBorrowerApplications(request(investor, "http://localhost/api/borrower/applications")),
      { status: 403, code: "FORBIDDEN" },
    );
    await expectApiError(
      await getAdministratorLoans(request(investor, "http://localhost/api/admin/loans")),
      { status: 403, code: "FORBIDDEN" },
    );
    await expectApiError(
      await evaluateBorrower(request(investor, "http://localhost/api/ml/borrower-evaluation", { method: "POST" })),
      { status: 403, code: "FORBIDDEN" },
    );
  });

  it("API-07-03 rejects malformed JSON without creating an application", async () => {
    const borrower = await createPrincipal("BORROWER");
    const before = await prisma.loanApplication.count({ where: { borrowerProfileId: borrower.borrowerProfileId! } });
    const response = await createBorrowerApplication(request(
      borrower,
      "http://localhost/api/borrower/applications",
      { method: "POST", headers: { "content-type": "application/json" }, body: "{ invalid json" },
    ));

    await expectApiError(response, { status: 400, code: "INVALID_JSON" });
    expect(await prisma.loanApplication.count({ where: { borrowerProfileId: borrower.borrowerProfileId! } })).toBe(before);
  });

  it("API-07-04 rejects unsupported request fields without creating an application", async () => {
    const borrower = await createPrincipal("BORROWER");
    const before = await prisma.loanApplication.count({ where: { borrowerProfileId: borrower.borrowerProfileId! } });
    const response = await createBorrowerApplication(request(
      borrower,
      "http://localhost/api/borrower/applications",
      { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userId: borrower.userId }) },
    ));

    await expectApiError(response, { status: 400, code: "VALIDATION_ERROR" });
    expect(await prisma.loanApplication.count({ where: { borrowerProfileId: borrower.borrowerProfileId! } })).toBe(before);
  });
});
