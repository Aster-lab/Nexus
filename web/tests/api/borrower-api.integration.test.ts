import { createHash, randomBytes, randomUUID } from "node:crypto";
import { Prisma } from "../../src/generated/prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { POST as createApplication } from "../../src/app/api/borrower/applications/route";
import { GET as listApplications } from "../../src/app/api/borrower/applications/route";
import {
  GET as getApplication,
  PATCH as updateApplication,
} from "../../src/app/api/borrower/applications/[applicationId]/route";
import { POST as submitApplication } from "../../src/app/api/borrower/applications/[applicationId]/submit/route";
import { POST as saveFinancialInformation } from "../../src/app/api/borrower/applications/[applicationId]/financial-information/route";
import { GET as listOffers } from "../../src/app/api/borrower/offers/route";
import { GET as getOffer } from "../../src/app/api/borrower/offers/[offerId]/route";
import { POST as acceptOffer } from "../../src/app/api/borrower/offers/[offerId]/accept/route";
import { GET as getLoans } from "../../src/app/api/borrower/loans/route";
import { GET as getLoan } from "../../src/app/api/borrower/loans/[loanId]/route";
import { GET as getSchedule } from "../../src/app/api/borrower/loans/[loanId]/schedule/route";
import { GET as getPayableSummary } from "../../src/app/api/borrower/loans/[loanId]/payable/route";
import { GET as getBorrowerDashboard } from "../../src/app/api/borrower/dashboard/route";
import { GET as getBorrowerWallet } from "../../src/app/api/borrower/wallet/route";
import {
  GET as listRepayments,
  POST as submitRepayment,
} from "../../src/app/api/borrower/repayments/route";
import { GET as getReceipt } from "../../src/app/api/borrower/repayments/[repaymentId]/receipt/route";
import { prisma } from "../../src/lib/prisma";
import { LoanInterestPolicyValuesSchema, PlatformFeePolicyValuesSchema } from "../../src/lib/contracts/platform-policy";
import { generateRepaymentSchedule } from "../../src/lib/services/repayment.service";
import { createRepaymentTestContext, type RepaymentTestContext } from "../fixtures/repayment.fixture";
import { activateEscrowAccountForTests } from "../fixtures/investor-contribution.fixture";
import { createAuthenticatedApiRequest, expectApiError, expectApiSuccess } from "../helpers/api";

interface Borrower {
  userId: string;
  profileId: string;
  token: string;
}

const createdApplicationIds: string[] = [];
const createdSessionUserIds: string[] = [];
const temporaryPolicyVersionIds: string[] = [];
const createdOfferIds: string[] = [];
const createdLoanIds: string[] = [];
const repaymentContexts: RepaymentTestContext[] = [];
const repaymentFixtureRolesCreated: string[] = [];
const repaymentFixtureRolesRevived: Array<{ id: string; revokedAt: Date }> = [];
const escrowAccountSetups: Array<Awaited<ReturnType<typeof activateEscrowAccountForTests>>> = [];

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function createBorrower(): Promise<Borrower> {
  const role = await prisma.role.upsert({
    where: { code: "BORROWER" },
    create: { code: "BORROWER", name: "Borrower" },
    update: {},
    select: { id: true },
  });
  const user = await prisma.user.create({
    data: { email: `${randomUUID()}@borrower-api.test`, accountStatus: "ACTIVE" },
    select: { id: true },
  });
  await prisma.userRole.create({ data: { userId: user.id, roleId: role.id } });
  const profile = await prisma.borrowerProfile.create({
    data: {
      userId: user.id,
      legalName: "Borrower API Test",
      phone: "0812345678",
      address: { country: "Thailand" },
    },
    select: { id: true },
  });
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      userId: user.id,
      sessionTokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  createdSessionUserIds.push(user.id);
  return { userId: user.id, profileId: profile.id, token };
}

async function ensureActiveLoanOfferPolicy(approverUserId: string): Promise<void> {
  const policy = await prisma.platformPolicy.upsert({
    where: { policyCode: "LOAN_OFFER_POLICY" },
    create: {
      policyCode: "LOAN_OFFER_POLICY",
      name: "Loan offer policy (API test)",
      description: "Temporary API integration test policy.",
    },
    update: {},
    select: { id: true },
  });
  const current = await prisma.policyVersion.findFirst({
    where: { policyId: policy.id, status: "ACTIVE" },
    select: { id: true },
  });
  if (current) return;

  const latest = await prisma.policyVersion.findFirst({
    where: { policyId: policy.id },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });
  const version = await prisma.policyVersion.create({
    data: {
      policyId: policy.id,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      policyValues: {
        schema_version: "loan_offer_policy.v1",
        min_principal_satang: 100_000,
        max_principal_satang: 5_000_000,
        allowed_term_months: [3, 6, 9, 12, 18, 24],
        offer_validity_days: 7,
      },
      status: "ACTIVE",
      approvedByUserId: approverUserId,
      effectiveAt: new Date(),
    },
    select: { id: true },
  });
  temporaryPolicyVersionIds.push(version.id);
}

async function ensureActiveOfferTermsPolicies(approverUserId: string): Promise<void> {
  const policies = [
    {
      policyCode: "PLATFORM_FEE_POLICY",
      name: "Platform fee policy (API test)",
      policyValues: {
        schema_version: "platform_fee_policy.v1",
        fee_rate_basis_points: 200,
        calculation_basis: "ORIGINAL_LOAN_PRINCIPAL",
        calculation_timing: "ONCE_PER_LOAN",
        wallet_deduction: false,
        treatment: "CALCULATE_AND_DISPLAY_ONLY",
        currency: "THB",
      },
    },
    {
      policyCode: "LOAN_INTEREST_POLICY",
      name: "Loan interest policy (API test)",
      policyValues: {
        schema_version: "loan_interest_policy.v1",
        annual_interest_rate_basis_points: 1200,
        calculation_method: "REDUCING_BALANCE",
        calculation_frequency: "MONTHLY",
        currency: "THB",
      },
    },
  ] as const;

  for (const definition of policies) {
    const policy = await prisma.platformPolicy.upsert({
      where: { policyCode: definition.policyCode },
      create: {
        policyCode: definition.policyCode,
        name: definition.name,
        description: "Temporary API integration test policy.",
      },
      update: {},
      select: { id: true },
    });
    const activeVersion = await prisma.policyVersion.findFirst({
      where: {
        policyId: policy.id,
        status: "ACTIVE",
        OR: [{ effectiveAt: null }, { effectiveAt: { lte: new Date() } }],
      },
      select: { id: true, policyValues: true },
    });
    const activeValuesAreValid = activeVersion && (
      definition.policyCode === "PLATFORM_FEE_POLICY"
        ? PlatformFeePolicyValuesSchema.safeParse(activeVersion.policyValues).success
        : LoanInterestPolicyValuesSchema.safeParse(activeVersion.policyValues).success
    );
    if (activeValuesAreValid) continue;

    const latest = await prisma.policyVersion.findFirst({
      where: { policyId: policy.id },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    const version = await prisma.policyVersion.create({
      data: {
        policyId: policy.id,
        versionNumber: (latest?.versionNumber ?? 0) + 1,
        policyValues: definition.policyValues as Prisma.InputJsonValue,
        status: "ACTIVE",
        approvedByUserId: approverUserId,
        effectiveAt: new Date(),
      },
      select: { id: true },
    });
    temporaryPolicyVersionIds.push(version.id);
  }
}

const validApplication = (legalName: string) => ({
  schema_version: "application_snapshot.v1",
  borrower: {
    legal_name: legalName,
    phone: "0812345678",
    address: {
      line1: "1 Test Road",
      line2: null,
      subdistrict: null,
      district: null,
      province: "Bangkok",
      postal_code: "10100",
      country_code: "TH",
    },
  },
  employment: {
    employment_status: "EMPLOYED",
    employer_name: "Test Co",
    occupation: "Analyst",
    months_in_role: 12,
  },
  requested_loan: { purpose: "Education", amount_satang: 300_000, term_months: 3 },
});

function borrowerRequest(borrower: Borrower, url: string, init: RequestInit = {}): Request {
  return createAuthenticatedApiRequest(url, {
    userId: "untrusted-client-user-id",
    role: "BORROWER",
    sessionCookie: borrower.token,
    cookieName: "nexus_session",
  }, init);
}

const validFinancialInformation = () => ({
  income_data: { schema_version: "borrower_income.v1", items: [
    { entry_id: "income-1", category: "SALARY", amount_satang: 5_000_000, frequency: "MONTHLY" },
  ] },
  expense_data: { schema_version: "borrower_expenses.v1", items: [] },
  debt_data: { schema_version: "borrower_debts.v1", items: [
    { entry_id: "debt-1", category: "CREDIT_CARD", outstanding_balance_satang: 2_000_000, payment_satang: 500_000, payment_frequency: "MONTHLY" },
  ] },
  credit_data: {
    schema_version: "borrower_credit.v2", entry_id: "credit-1", bureau_name: "THAI_CREDIT_BUREAU",
    report_date: "2026-11-01", credit_score: 720, inquiry_count_12_months: 1,
    delinquency_count_12_months: 0, accounts_opened_past_24_months: 2,
    bankcard_balance_satang: 2_000_000, bankcard_credit_limit_satang: 10_000_000,
    revolving_balance_satang: 3_000_000, revolving_credit_limit_satang: 12_000_000,
  },
  source_metadata: { schema_version: "borrower_financial_sources.v1", items: [
    { entry_id: "income-1", data_type: "INCOME", source_type: "DOCUMENT", captured_at: "2026-11-21T10:00:00+07:00", verification_status: "VERIFIED" },
    { entry_id: "debt-1", data_type: "DEBT", source_type: "DOCUMENT", captured_at: "2026-11-21T10:00:00+07:00", verification_status: "VERIFIED" },
    { entry_id: "credit-1", data_type: "CREDIT", source_type: "CREDIT_BUREAU", captured_at: "2026-11-21T10:00:00+07:00", verification_status: "VERIFIED" },
  ] },
});

async function createApprovedOffer(borrower: Borrower, expiresAt = new Date(Date.now() + 86_400_000)) {
  const draftResponse = await createApplication(borrowerRequest(borrower, "http://localhost/api/borrower/applications", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(validApplication("Offer applicant")),
  }));
  const application = await expectApiSuccess<{
    id: string;
    currentVersion: { id: string };
  }>(draftResponse, 201);
  createdApplicationIds.push(application.id);
  const submission = await submitApplication(borrowerRequest(
    borrower,
    `http://localhost/api/borrower/applications/${application.id}/submit`,
    { method: "POST" },
  ), { params: Promise.resolve({ applicationId: application.id }) });
  expect(submission.status).toBe(200);
  await prisma.loanApplication.update({
    where: { id: application.id }, data: { status: "APPROVED" },
  });
  const offer = await prisma.loanOffer.create({
    data: {
      applicationId: application.id,
      applicationVersionId: application.currentVersion.id,
      principalSatang: 300_000n,
      annualInterestRate: new Prisma.Decimal("0.12"),
      termMonths: 3,
      expiresAt,
      status: "ISSUED",
      createdByUserId: borrower.userId,
    },
    select: { id: true },
  });
  createdOfferIds.push(offer.id);
  return { applicationId: application.id, offerId: offer.id };
}

async function createDueRepaymentContext() {
  const context = await createRepaymentTestContext();
  repaymentContexts.push(context);
  const borrowerRole = await prisma.role.upsert({
    where: { code: "BORROWER" },
    create: { code: "BORROWER", name: "Borrower" },
    update: {},
    select: { id: true },
  });
  const existingBorrowerRole = await prisma.userRole.findFirst({
    where: { userId: context.borrowerUser.id, roleId: borrowerRole.id },
    select: { id: true, revokedAt: true },
  });
  if (existingBorrowerRole) {
    if (existingBorrowerRole.revokedAt) {
      repaymentFixtureRolesRevived.push({ id: existingBorrowerRole.id, revokedAt: existingBorrowerRole.revokedAt });
      await prisma.userRole.update({ where: { id: existingBorrowerRole.id }, data: { revokedAt: null } });
    }
  } else {
    const assignment = await prisma.userRole.create({
      data: { userId: context.borrowerUser.id, roleId: borrowerRole.id },
      select: { id: true },
    });
    repaymentFixtureRolesCreated.push(assignment.id);
  }
  await generateRepaymentSchedule({ loanId: context.loan.id, actorUserId: context.administratorUserId });
  const token = randomBytes(32).toString("base64url");
  await prisma.session.create({
    data: {
      userId: context.borrowerUser.id,
      sessionTokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  createdSessionUserIds.push(context.borrowerUser.id);
  const schedule = await prisma.repaymentSchedule.findUniqueOrThrow({
    where: { loanId: context.loan.id }, select: { currentVersionId: true },
  });
  const installment = await prisma.installment.findFirstOrThrow({
    where: { scheduleVersionId: schedule.currentVersionId!, dueDate: { lte: new Date() } },
    orderBy: { installmentNumber: "asc" },
    select: { id: true, principalDueSatang: true, interestDueSatang: true },
  });
  return {
    context,
    borrower: { userId: context.borrowerUser.id, profileId: "", token },
    installment,
    amount: installment.principalDueSatang + installment.interestDueSatang,
  };
}

describe("API-03 borrower application APIs", () => {
  let borrower: Borrower;
  let otherBorrower: Borrower;
  let approver: { id: string };

  beforeEach(async () => {
    escrowAccountSetups.push(await activateEscrowAccountForTests());
    borrower = await createBorrower();
    otherBorrower = await createBorrower();
    approver = await prisma.user.create({
      data: { email: `${randomUUID()}@api-approver.test`, accountStatus: "ACTIVE" },
      select: { id: true },
    });
    await ensureActiveLoanOfferPolicy(approver.id);
    await ensureActiveOfferTermsPolicies(approver.id);
  });

  afterEach(async () => {
    if (createdLoanIds.length) {
      await prisma.loanStatusHistory.deleteMany({ where: { loanId: { in: createdLoanIds } } });
      await prisma.escrowAccount.deleteMany({ where: { loanId: { in: createdLoanIds } } });
      await prisma.loan.deleteMany({ where: { id: { in: createdLoanIds } } });
      createdLoanIds.length = 0;
    }
    if (createdOfferIds.length) {
      await prisma.loanOffer.deleteMany({ where: { id: { in: createdOfferIds } } });
      createdOfferIds.length = 0;
    }
    if (temporaryPolicyVersionIds.length) {
      await prisma.policyVersion.deleteMany({ where: { id: { in: temporaryPolicyVersionIds } } });
      temporaryPolicyVersionIds.length = 0;
    }
    if (createdApplicationIds.length) {
      await prisma.borrowerFinancialInformation.deleteMany({
        where: { applicationVersion: { applicationId: { in: createdApplicationIds } } },
      });
    }
    for (const applicationId of createdApplicationIds.splice(0)) {
      const application = await prisma.loanApplication.findUnique({
        where: { id: applicationId },
        select: { currentVersionId: true },
      });
      if (!application) continue;
      if (application.currentVersionId) {
        const currentVersion = await prisma.applicationVersion.findUnique({
          where: { id: application.currentVersionId },
          select: { submittedAt: true },
        });
        if (currentVersion?.submittedAt) {
          await prisma.loanApplication.update({
            where: { id: applicationId }, data: { status: "REJECTED" },
          });
          continue;
        }
        await prisma.loanApplication.update({
          where: { id: applicationId }, data: { currentVersionId: null },
        });
      }
      await prisma.applicationVersion.deleteMany({ where: { applicationId } });
      await prisma.loanApplication.deleteMany({ where: { id: applicationId } });
    }
    if (createdSessionUserIds.length) {
      await prisma.session.deleteMany({ where: { userId: { in: createdSessionUserIds } } });
      for (const userId of createdSessionUserIds) {
        if (repaymentContexts.some((context) => context.borrowerUser.id === userId)) continue;
        const hasApplicationHistory = await prisma.loanApplication.count({
          where: { borrowerProfile: { userId } },
        });
        if (hasApplicationHistory > 0) continue;
        await prisma.userRole.deleteMany({ where: { userId } });
        await prisma.borrowerProfile.deleteMany({ where: { userId } });
        await prisma.user.deleteMany({ where: { id: userId } });
      }
      createdSessionUserIds.length = 0;
    }
    if (repaymentFixtureRolesCreated.length) {
      await prisma.userRole.deleteMany({ where: { id: { in: repaymentFixtureRolesCreated.splice(0) } } });
    }
    for (const assignment of repaymentFixtureRolesRevived.splice(0)) {
      await prisma.userRole.update({ where: { id: assignment.id }, data: { revokedAt: assignment.revokedAt } });
    }
    for (const context of repaymentContexts.splice(0)) await context.cleanup();
    for (const setup of escrowAccountSetups.splice(0).reverse()) await setup.cleanup();
    if (approver) await prisma.user.deleteMany({ where: { id: approver.id } });
  });

  it("API-03-01 creates a valid draft application for the authenticated borrower", async () => {
    const response = await createApplication(borrowerRequest(borrower, "http://localhost/api/borrower/applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validApplication("Borrower API Test")),
    }));
    const result = await expectApiSuccess<{ id: string; status: string; borrowerProfileId: string }>(response, 201);
    createdApplicationIds.push(result.id);
    expect(result.status).toBe("DRAFT");
    expect(result.borrowerProfileId).toBe(borrower.profileId);
  });

  it("APP-01/03 filters own applications by status and preserves supported created-date sorting", async () => {
    const created = await expectApiSuccess<{ id: string; status: string }>(await createApplication(
      borrowerRequest(borrower, "http://localhost/api/borrower/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validApplication("Application filter")),
      }),
    ), 201);
    createdApplicationIds.push(created.id);

    const response = await listApplications(borrowerRequest(
      borrower,
      "http://localhost/api/borrower/applications?page=1&limit=5&sortBy=createdAt&sortOrder=desc&status=DRAFT",
    ));
    expect(response.status).toBe(200);
    const body = await response.json() as {
      success: boolean;
      data: Array<{ id: string; status: string; currentVersion: null | { purpose: string | null; submittedData?: unknown } }>;
      pagination: { page: number; limit: number; total: number; totalPages: number };
    };
    expect(body.success).toBe(true);

    expect(body.data.every((application) => application.status === "DRAFT")).toBe(true);
    expect(body.data.some((application) => application.id === created.id)).toBe(true);
    const createdRow = body.data.find((application) => application.id === created.id);
    expect(createdRow?.currentVersion?.purpose).toBe("Education");
    expect(createdRow?.currentVersion).not.toHaveProperty("submittedData");
    expect(body.pagination).toMatchObject({ page: 1, limit: 5, total: 1, totalPages: 1 });
  });

  it("APP-11 rejects a non-borrower from creating an application", async () => {
    const investorRole = await prisma.role.upsert({
      where: { code: "INVESTOR" },
      create: { code: "INVESTOR", name: "Investor" },
      update: {},
      select: { id: true },
    });
    await prisma.userRole.create({ data: { userId: approver.id, roleId: investorRole.id } });
    const token = randomBytes(32).toString("base64url");
    await prisma.session.create({
      data: {
        userId: approver.id,
        sessionTokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    createdSessionUserIds.push(approver.id);

    const request = createAuthenticatedApiRequest(
      "http://localhost/api/borrower/applications",
      { userId: "untrusted-client-user-id", role: "INVESTOR", sessionCookie: token },
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(validApplication("Wrong role")),
      },
    );
    await expectApiError(await createApplication(request), { status: 403, code: "FORBIDDEN" });
  });

  it("DASH-01/02 returns the authenticated borrower's persisted dashboard summary", async () => {
    const setup = await createDueRepaymentContext();
    const response = await getBorrowerDashboard(borrowerRequest(
      setup.borrower,
      "http://localhost/api/borrower/dashboard",
    ));
    const dashboard = await expectApiSuccess<{
      activeLoanCount: number;
      totalOutstandingBalanceSatang: string;
      pendingApplicationCount: number;
      availableOfferCount: number;
      nextInstallment: null | {
        loanId: string;
        installmentId: string;
        installmentNumber: number;
        dueDate: string;
        remainingBalanceSatang: string;
      };
      upcomingInstallments: Array<{ installmentId: string }>;
      overdueInstallments: Array<{ installmentId: string }>;
    }>(response);

    const schedule = await prisma.repaymentSchedule.findUniqueOrThrow({
      where: { loanId: setup.context.loan.id },
      select: { currentVersionId: true },
    });
    const installments = await prisma.installment.findMany({
      where: { scheduleVersionId: schedule.currentVersionId! },
      orderBy: [{ dueDate: "asc" }, { installmentNumber: "asc" }],
    });
    const outstanding = installments.reduce((sum, installment) =>
      sum + installment.principalDueSatang - installment.paidPrincipalSatang +
        installment.interestDueSatang - installment.paidInterestSatang, 0n);
    const next = installments.find((installment) =>
      installment.principalDueSatang > installment.paidPrincipalSatang ||
      installment.interestDueSatang > installment.paidInterestSatang);
    const [expectedActiveLoanCount, expectedPendingApplicationCount, expectedAvailableOfferCount] = await Promise.all([
      prisma.loan.count({
        where: { borrowerProfileId: setup.context.loan.borrowerProfileId, status: { in: ["ACTIVE", "DELINQUENT"] } },
      }),
      prisma.loanApplication.count({
        where: {
          borrowerProfileId: setup.context.loan.borrowerProfileId,
          status: { in: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "INFORMATION_REQUESTED"] },
        },
      }),
      prisma.loanOffer.count({
        where: {
          status: "ISSUED",
          expiresAt: { gt: new Date() },
          application: { borrowerProfileId: setup.context.loan.borrowerProfileId, status: "APPROVED" },
        },
      }),
    ]);

    expect(dashboard.activeLoanCount).toBe(expectedActiveLoanCount);
    expect(BigInt(dashboard.totalOutstandingBalanceSatang)).toBe(outstanding);
    expect(dashboard.nextInstallment).toMatchObject({
      loanId: setup.context.loan.id,
      installmentId: next?.id,
      installmentNumber: next?.installmentNumber,
      dueDate: next?.dueDate.toISOString(),
      remainingBalanceSatang: next
        ? (next.principalDueSatang - next.paidPrincipalSatang + next.interestDueSatang - next.paidInterestSatang).toString()
        : "0",
    });
    expect(dashboard.pendingApplicationCount).toBe(expectedPendingApplicationCount);
    expect(dashboard.availableOfferCount).toBe(expectedAvailableOfferCount);
    expect(dashboard.upcomingInstallments.length + dashboard.overdueInstallments.length).toBeGreaterThan(0);
  });

  it("DASH-03 returns useful zero-value summary data when the borrower has no activity", async () => {
    const dashboard = await expectApiSuccess<{
      activeLoanCount: number;
      totalOutstandingBalanceSatang: string;
      pendingApplicationCount: number;
      availableOfferCount: number;
      nextInstallment: unknown;
      upcomingInstallments: unknown[];
      overdueInstallments: unknown[];
    }>(await getBorrowerDashboard(borrowerRequest(
      otherBorrower,
      "http://localhost/api/borrower/dashboard",
    )));

    expect(dashboard).toMatchObject({
      activeLoanCount: 0,
      totalOutstandingBalanceSatang: "0",
      pendingApplicationCount: 0,
      availableOfferCount: 0,
      nextInstallment: null,
      upcomingInstallments: [],
      overdueInstallments: [],
    });
  });

  it("DASH-07 rejects an authenticated investor from the borrower dashboard", async () => {
    const investorRole = await prisma.role.upsert({
      where: { code: "INVESTOR" },
      create: { code: "INVESTOR", name: "Investor" },
      update: {},
      select: { id: true },
    });
    await prisma.userRole.create({ data: { userId: approver.id, roleId: investorRole.id } });
    const token = randomBytes(32).toString("base64url");
    await prisma.session.create({
      data: {
        userId: approver.id,
        sessionTokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    createdSessionUserIds.push(approver.id);

    const request = createAuthenticatedApiRequest(
      "http://localhost/api/borrower/dashboard",
      { userId: "untrusted-client-user-id", role: "INVESTOR", sessionCookie: token },
    );
    await expectApiError(await getBorrowerDashboard(request), { status: 403, code: "FORBIDDEN" });
  });

  it("stores verified versioned financial and bureau inputs against the borrower's draft version", async () => {
    const draft = await expectApiSuccess<{ id: string; currentVersion: { id: string } }>(await createApplication(
      borrowerRequest(borrower, "http://localhost/api/borrower/applications", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validApplication("Prediction applicant")),
      }),
    ), 201);
    createdApplicationIds.push(draft.id);
    const response = await saveFinancialInformation(
      borrowerRequest(borrower, `http://localhost/api/borrower/applications/${draft.id}/financial-information`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validFinancialInformation()),
      }),
      { params: Promise.resolve({ applicationId: draft.id }) },
    );
    const saved = await expectApiSuccess<{ id: string; applicationVersionId: string }>(response, 201);
    expect(saved.applicationVersionId).toBe(draft.currentVersion.id);
    const record = await prisma.borrowerFinancialInformation.findUniqueOrThrow({ where: { id: saved.id } });
    expect(record.creditData).toMatchObject({ schema_version: "borrower_credit.v2", credit_score: 720, accounts_opened_past_24_months: 2 });
  });

  it("does not allow financial inputs to be added after application submission", async () => {
    const draft = await expectApiSuccess<{ id: string }>(await createApplication(
      borrowerRequest(borrower, "http://localhost/api/borrower/applications", {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validApplication("Submitted applicant")),
      }),
    ), 201);
    createdApplicationIds.push(draft.id);
    await submitApplication(borrowerRequest(borrower, `http://localhost/api/borrower/applications/${draft.id}/submit`, { method: "POST" }), {
      params: Promise.resolve({ applicationId: draft.id }),
    });
    const response = await saveFinancialInformation(
      borrowerRequest(borrower, `http://localhost/api/borrower/applications/${draft.id}/financial-information`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validFinancialInformation()),
      }),
      { params: Promise.resolve({ applicationId: draft.id }) },
    );
    await expectApiError(response, { status: 409, code: "APPLICATION_NOT_EDITABLE" });
  });

  it("API-03-02 rejects an invalid application snapshot", async () => {
    await expectApiError(await createApplication(borrowerRequest(borrower, "http://localhost/api/borrower/applications", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ requested_loan: { amount_satang: -1 } }),
    })), { status: 400, code: "VALIDATION_ERROR" });
  });

  it("API-03-03 lists only applications owned by the authenticated borrower", async () => {
    for (const [owner, legalName] of [[borrower, "Owner"], [otherBorrower, "Other"]] as const) {
      const response = await createApplication(borrowerRequest(owner, "http://localhost/api/borrower/applications", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(validApplication(legalName)),
      }));
      const application = await expectApiSuccess<{ id: string }>(response, 201);
      createdApplicationIds.push(application.id);
    }
    const response = await listApplications(borrowerRequest(borrower, "http://localhost/api/borrower/applications"));
    const result = await expectApiSuccess<Array<{ id: string }>>(response);
    expect(result).toHaveLength(1);
  });

  it("API-03-04 returns a non-disclosing 404 for another borrower's application", async () => {
    const createResponse = await createApplication(borrowerRequest(otherBorrower, "http://localhost/api/borrower/applications", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(validApplication("Other")),
    }));
    const application = await expectApiSuccess<{ id: string }>(createResponse, 201);
    createdApplicationIds.push(application.id);
    await expectApiError(await getApplication(
      borrowerRequest(borrower, `http://localhost/api/borrower/applications/${application.id}`),
      { params: Promise.resolve({ applicationId: application.id }) },
    ), { status: 404, code: "NOT_FOUND" });
  });

  it("APP-12/13/14 returns the borrower's persisted detail and backend edit permission", async () => {
    const createResponse = await createApplication(borrowerRequest(borrower, "http://localhost/api/borrower/applications", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(validApplication("Details")),
    }));
    const created = await expectApiSuccess<{ id: string }>(createResponse, 201);
    createdApplicationIds.push(created.id);
    const response = await getApplication(borrowerRequest(borrower, `http://localhost/api/borrower/applications/${created.id}`), {
      params: Promise.resolve({ applicationId: created.id }),
    });
    const detail = await expectApiSuccess<{
      status: string; permissions: { canEdit: boolean; canSubmit: boolean }; createdAt: string; updatedAt: string;
      currentVersion: { requestedPrincipalSatang: string; requestedTermMonths: number; submittedData: { requested_loan: { purpose: string } } };
      financialReviews: unknown[]; informationRequests: unknown[];
    }>(response);
    expect(detail).toMatchObject({ status: "DRAFT", permissions: { canEdit: true, canSubmit: true } });
    expect(detail.createdAt).toBeTruthy();
    expect(detail.updatedAt).toBeTruthy();
    expect(detail.currentVersion).toMatchObject({ requestedPrincipalSatang: "300000", requestedTermMonths: 3 });
    expect(detail.currentVersion.submittedData.requested_loan.purpose).toBe("Education");
    expect(detail.financialReviews).toEqual([]);
    expect(detail.informationRequests).toEqual([]);
  });

  it("API-03-05 updates an editable draft by creating a new version", async () => {
    const createResponse = await createApplication(borrowerRequest(borrower, "http://localhost/api/borrower/applications", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(validApplication("Draft")),
    }));
    const created = await expectApiSuccess<{ id: string }>(createResponse, 201);
    createdApplicationIds.push(created.id);
    const changed = validApplication("Updated Draft");
    changed.requested_loan.amount_satang = 400_000;
    const response = await updateApplication(borrowerRequest(borrower, `http://localhost/api/borrower/applications/${created.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(changed),
    }), { params: Promise.resolve({ applicationId: created.id }) });
    const updated = await expectApiSuccess<{ currentVersion: { versionNumber: number; requestedPrincipalSatang: string } }>(response);
    expect(updated.currentVersion.versionNumber).toBe(2);
    expect(updated.currentVersion.requestedPrincipalSatang).toBe("400000");
  });

  it("API-03-06 rejects modification after submission", async () => {
    const createResponse = await createApplication(borrowerRequest(borrower, "http://localhost/api/borrower/applications", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(validApplication("Submitted")),
    }));
    const created = await expectApiSuccess<{ id: string }>(createResponse, 201);
    createdApplicationIds.push(created.id);
    await submitApplication(borrowerRequest(borrower, `http://localhost/api/borrower/applications/${created.id}/submit`, {
      method: "POST",
    }), { params: Promise.resolve({ applicationId: created.id }) });
    await expectApiError(await updateApplication(borrowerRequest(borrower, `http://localhost/api/borrower/applications/${created.id}`, {
      method: "PATCH", headers: { "content-type": "application/json" },
      body: JSON.stringify(validApplication("Changed after submit")),
    }), { params: Promise.resolve({ applicationId: created.id }) }), {
      status: 409, code: "APPLICATION_NOT_EDITABLE",
    });
  });

  it("API-03-07 submits a valid draft through its lifecycle transition", async () => {
    const createResponse = await createApplication(borrowerRequest(borrower, "http://localhost/api/borrower/applications", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify(validApplication("Submit")),
    }));
    const created = await expectApiSuccess<{ id: string }>(createResponse, 201);
    createdApplicationIds.push(created.id);
    const response = await submitApplication(borrowerRequest(borrower, `http://localhost/api/borrower/applications/${created.id}/submit`, {
      method: "POST",
    }), { params: Promise.resolve({ applicationId: created.id }) });
    const result = await expectApiSuccess<{ status: string; submittedAt: string; permissions: { canEdit: boolean; canSubmit: boolean } }>(response);
    expect(result.status).toBe("SUBMITTED");
    expect(result.submittedAt).toBeTruthy();
    const detailResponse = await getApplication(borrowerRequest(borrower, `http://localhost/api/borrower/applications/${created.id}`), {
      params: Promise.resolve({ applicationId: created.id }),
    });
    const detail = await expectApiSuccess<{ status: string; permissions: { canEdit: boolean; canSubmit: boolean } }>(detailResponse);
    expect(detail).toMatchObject({ status: "SUBMITTED", permissions: { canEdit: false, canSubmit: false } });
    await expectApiError(await submitApplication(borrowerRequest(borrower, `http://localhost/api/borrower/applications/${created.id}/submit`, {
      method: "POST",
    }), { params: Promise.resolve({ applicationId: created.id }) }), { status: 409, code: "APPLICATION_NOT_SUBMITTABLE" });
  });

  it("API-03-08 accepts a valid offer and creates a FUNDING loan", async () => {
    const { offerId } = await createApprovedOffer(borrower);
    const offersResponse = await listOffers(borrowerRequest(borrower, "http://localhost/api/borrower/offers"));
    const offers = await expectApiSuccess<Array<{ id: string }>>(offersResponse);
    expect(offers.some((offer) => offer.id === offerId)).toBe(true);
    const response = await acceptOffer(borrowerRequest(borrower, `http://localhost/api/borrower/offers/${offerId}/accept`, {
      method: "POST",
    }), { params: Promise.resolve({ offerId }) });
    const result = await expectApiSuccess<{ loanId: string; status: string }>(response, 201);
    createdLoanIds.push(result.loanId);
    expect(result.status).toBe("FUNDING");
    await expect(prisma.escrowAccount.findUnique({ where: { loanId: result.loanId } })).resolves.toMatchObject({
      loanId: result.loanId,
      heldSatang: 0n,
      status: "OPEN",
    });
  });

  it("OFF-01/03/04 lists and displays the complete borrower offer terms and expiration", async () => {
    const { applicationId, offerId } = await createApprovedOffer(borrower);
    const response = await listOffers(borrowerRequest(borrower, "http://localhost/api/borrower/offers?page=1&limit=10&sortBy=expiresAt&sortOrder=asc"));
    const offers = await expectApiSuccess<Array<{ id: string; applicationId: string; status: string; permissions: { canAccept: boolean } }>>(response);
    expect(offers).toContainEqual(expect.objectContaining({ id: offerId, applicationId, status: "ISSUED", permissions: { canAccept: true } }));

    const detailResponse = await getOffer(borrowerRequest(borrower, `http://localhost/api/borrower/offers/${offerId}`), {
      params: Promise.resolve({ offerId }),
    });
    const detail = await expectApiSuccess<{
      id: string; applicationId: string; principalSatang: string; annualInterestRate: string;
      termMonths: number; repaymentFrequency: string; expiresAt: string; status: string;
      platformFee: { rateBasisPoints: number; calculationBasis: string; walletDeduction: boolean };
      permissions: { canAccept: boolean };
    }>(detailResponse);
    expect(detail).toMatchObject({
      id: offerId, applicationId, principalSatang: "300000", annualInterestRate: "0.12",
      termMonths: 3, repaymentFrequency: "MONTHLY", status: "ISSUED", permissions: { canAccept: true },
      platformFee: { rateBasisPoints: 200, calculationBasis: "ORIGINAL_LOAN_PRINCIPAL", walletDeduction: false },
    });
    expect(new Date(detail.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("OFF-12 returns a non-disclosing 404 when a borrower requests another borrower's offer", async () => {
    const { offerId } = await createApprovedOffer(otherBorrower);
    await expectApiError(await getOffer(borrowerRequest(borrower, `http://localhost/api/borrower/offers/${offerId}`), {
      params: Promise.resolve({ offerId }),
    }), { status: 404, code: "NOT_FOUND" });
  });

  it("OFF-10 rejects acceptance when the application state changes after the offer is issued", async () => {
    const { applicationId, offerId } = await createApprovedOffer(borrower);
    await prisma.loanApplication.update({ where: { id: applicationId }, data: { status: "REJECTED" } });
    await expectApiError(await acceptOffer(borrowerRequest(borrower, `http://localhost/api/borrower/offers/${offerId}/accept`, {
      method: "POST",
    }), { params: Promise.resolve({ offerId }) }), { status: 409, code: "OFFER_NOT_AVAILABLE" });
  });

  it("API-03-09 rejects an expired offer", async () => {
    const { offerId } = await createApprovedOffer(borrower, new Date(Date.now() - 1000));
    const detail = await expectApiSuccess<{ status: string; isExpired: boolean; permissions: { canAccept: boolean }; expiresAt: string }>(await getOffer(
      borrowerRequest(borrower, `http://localhost/api/borrower/offers/${offerId}`),
      { params: Promise.resolve({ offerId }) },
    ));
    expect(detail.status).toBe("ISSUED");
    expect(detail.isExpired).toBe(true);
    expect(detail.permissions.canAccept).toBe(false);
    expect(new Date(detail.expiresAt).getTime()).toBeLessThan(Date.now());
    await expectApiError(await acceptOffer(borrowerRequest(borrower, `http://localhost/api/borrower/offers/${offerId}/accept`, {
      method: "POST",
    }), { params: Promise.resolve({ offerId }) }), {
      status: 422, code: "BUSINESS_RULE_VIOLATION",
    });
  });

  it("API-03-10 prevents a borrower from accepting an offer twice", async () => {
    const { offerId } = await createApprovedOffer(borrower);
    const path = `http://localhost/api/borrower/offers/${offerId}/accept`;
    const context = { params: Promise.resolve({ offerId }) };
    const first = await acceptOffer(borrowerRequest(borrower, path, { method: "POST" }), context);
    const accepted = await expectApiSuccess<{ loanId: string }>(first, 201);
    createdLoanIds.push(accepted.loanId);
    const offerDetail = await expectApiSuccess<{ status: string; acceptedAt: string; permissions: { canAccept: boolean } }>(await getOffer(
      borrowerRequest(borrower, `http://localhost/api/borrower/offers/${offerId}`),
      { params: Promise.resolve({ offerId }) },
    ));
    expect(offerDetail).toMatchObject({ status: "ACCEPTED", permissions: { canAccept: false } });
    expect(offerDetail.acceptedAt).toBeTruthy();
    const listed = await expectApiSuccess<Array<{ id: string; status: string; permissions: { canAccept: boolean } }>>(
      await listOffers(borrowerRequest(borrower, "http://localhost/api/borrower/offers")),
    );
    expect(listed).toContainEqual(expect.objectContaining({ id: offerId, status: "ACCEPTED", permissions: { canAccept: false } }));
    await expectApiError(await acceptOffer(borrowerRequest(borrower, path, { method: "POST" }), context), {
      status: 409, code: "OFFER_ALREADY_ACCEPTED",
    });
  });

  it("API-03-11 returns the authenticated borrower's own loan", async () => {
    const { offerId } = await createApprovedOffer(borrower);
    const acceptedResponse = await acceptOffer(borrowerRequest(borrower, `http://localhost/api/borrower/offers/${offerId}/accept`, {
      method: "POST",
    }), { params: Promise.resolve({ offerId }) });
    const accepted = await expectApiSuccess<{ loanId: string }>(acceptedResponse, 201);
    createdLoanIds.push(accepted.loanId);
    const response = await getLoan(borrowerRequest(borrower, `http://localhost/api/borrower/loans/${accepted.loanId}`), {
      params: Promise.resolve({ loanId: accepted.loanId }),
    });
    const loan = await expectApiSuccess<{ id: string; status: string }>(response);
    expect(loan.id).toBe(accepted.loanId);
    expect(loan.status).toBe("FUNDING");
    const loansResponse = await getLoans(borrowerRequest(borrower, "http://localhost/api/borrower/loans"));
    const loans = await expectApiSuccess<Array<{ id: string }>>(loansResponse);
    expect(loans.some((item) => item.id === accepted.loanId)).toBe(true);
  });

  it("LOAN-01/02 lists the borrower's loans with persisted balance summaries and supports an empty state", async () => {
    const setup = await createDueRepaymentContext();
    const listed = await expectApiSuccess<Array<{
      id: string; principalSatang: string; outstandingPrincipalSatang: string;
      outstandingBalanceSatang: string; annualInterestRate: string; termMonths: number; disbursedAt: string | null;
    }>>(await getLoans(borrowerRequest(setup.borrower, "http://localhost/api/borrower/loans")));
    const row = listed.find((loan) => loan.id === setup.context.loan.id);
    expect(row).toMatchObject({
      id: setup.context.loan.id,
      principalSatang: setup.context.loan.principalSatang.toString(),
      annualInterestRate: setup.context.loan.annualInterestRate.toString(),
      termMonths: setup.context.loan.termMonths,
    });
    expect(row?.disbursedAt).toBeTruthy();
    expect(BigInt(row?.outstandingBalanceSatang ?? "0")).toBeGreaterThan(0n);
    const empty = await expectApiSuccess<Array<{ id: string }>>(await getLoans(borrowerRequest(otherBorrower, "http://localhost/api/borrower/loans")));
    expect(empty).toEqual([]);
  });

  it("LOAN-03/04/05 returns loan detail and schedule summaries derived from persisted installments", async () => {
    const setup = await createDueRepaymentContext();
    const detail = await expectApiSuccess<{
      id: string; outstandingPrincipalSatang: string; outstandingInterestSatang: string;
      outstandingBalanceSatang: string; paidPrincipalSatang: string; paidInterestSatang: string;
      installmentCount: number; maturityDate: string; disbursedAt: string;
    }>(await getLoan(borrowerRequest(setup.borrower, `http://localhost/api/borrower/loans/${setup.context.loan.id}`), {
      params: Promise.resolve({ loanId: setup.context.loan.id }),
    }));
    expect(detail.id).toBe(setup.context.loan.id);
    expect(detail.installmentCount).toBe(setup.context.loan.termMonths);
    expect(detail.maturityDate).toBeTruthy();
    expect(detail.disbursedAt).toBeTruthy();

    const schedule = await expectApiSuccess<{ installments: Array<{
      id: string; installmentNumber: number; dueDate: string; scheduledPaymentDate: string;
      openingPrincipalSatang: string; principalDueSatang: string; interestDueSatang: string;
      totalDueSatang: string; paidAmountSatang: string; remainingAmountSatang: string;
      lastPaidAt: string | null; status: string;
    }> }>(await getSchedule(borrowerRequest(setup.borrower, `http://localhost/api/borrower/loans/${setup.context.loan.id}/schedule`), {
      params: Promise.resolve({ loanId: setup.context.loan.id }),
    }));
    const persisted = await prisma.installment.findMany({
      where: { scheduleVersionId: (await prisma.repaymentSchedule.findUniqueOrThrow({ where: { loanId: setup.context.loan.id }, select: { currentVersionId: true } })).currentVersionId! },
      orderBy: { installmentNumber: "asc" },
    });
    expect(schedule.installments).toHaveLength(persisted.length);
    for (const [index, installment] of persisted.entries()) {
      const row = schedule.installments[index];
      const total = installment.principalDueSatang + installment.interestDueSatang;
      const paid = installment.paidPrincipalSatang + installment.paidInterestSatang;
      expect(row).toMatchObject({
        id: installment.id,
        installmentNumber: installment.installmentNumber,
        dueDate: installment.dueDate.toISOString(),
        scheduledPaymentDate: installment.dueDate.toISOString(),
        openingPrincipalSatang: installment.openingPrincipalSatang.toString(),
        principalDueSatang: installment.principalDueSatang.toString(),
        interestDueSatang: installment.interestDueSatang.toString(),
        totalDueSatang: total.toString(),
        paidAmountSatang: paid.toString(),
        remainingAmountSatang: (total - paid).toString(),
        status: installment.status,
      });
    }
    expect(BigInt(detail.outstandingBalanceSatang)).toBeGreaterThan(0n);
  });

  it("LOAN-06/07 displays paid and overdue installment statuses from the persisted schedule", async () => {
    const paidSetup = await createDueRepaymentContext();
    const paidResponse = await submitRepayment(borrowerRequest(paidSetup.borrower, "http://localhost/api/borrower/repayments", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": `loan-paid-${randomUUID()}` },
      body: JSON.stringify({ loanId: paidSetup.context.loan.id, amountSatang: paidSetup.amount.toString() }),
    }));
    await expectApiSuccess(paidResponse, 201);
    const paidSchedule = await expectApiSuccess<{ installments: Array<{ id: string; status: string; paidAmountSatang: string; remainingAmountSatang: string }> }>(
      await getSchedule(borrowerRequest(paidSetup.borrower, `http://localhost/api/borrower/loans/${paidSetup.context.loan.id}/schedule`), {
        params: Promise.resolve({ loanId: paidSetup.context.loan.id }),
      }),
    );
    const paidInstallment = paidSchedule.installments.find((row) => row.id === paidSetup.installment.id);
    expect(paidInstallment).toMatchObject({ status: "PAID", remainingAmountSatang: "0" });
    expect(paidInstallment?.paidAmountSatang).toBe(paidSetup.amount.toString());

    const overdueSetup = await createDueRepaymentContext();
    const partialResponse = await submitRepayment(borrowerRequest(overdueSetup.borrower, "http://localhost/api/borrower/repayments", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": `loan-overdue-${randomUUID()}` },
      body: JSON.stringify({ loanId: overdueSetup.context.loan.id, amountSatang: "1" }),
    }));
    await expectApiSuccess(partialResponse, 201);
    const overdueSchedule = await expectApiSuccess<{ installments: Array<{ id: string; status: string }> }>(
      await getSchedule(borrowerRequest(overdueSetup.borrower, `http://localhost/api/borrower/loans/${overdueSetup.context.loan.id}/schedule`), {
        params: Promise.resolve({ loanId: overdueSetup.context.loan.id }),
      }),
    );
    expect(overdueSchedule.installments.find((row) => row.id === overdueSetup.installment.id)?.status).toBe("OVERDUE");
  });

  it("API-03-12 returns a non-disclosing 404 for another borrower's loan", async () => {
    const { offerId } = await createApprovedOffer(otherBorrower);
    const acceptedResponse = await acceptOffer(borrowerRequest(otherBorrower, `http://localhost/api/borrower/offers/${offerId}/accept`, {
      method: "POST",
    }), { params: Promise.resolve({ offerId }) });
    const accepted = await expectApiSuccess<{ loanId: string }>(acceptedResponse, 201);
    createdLoanIds.push(accepted.loanId);
    await expectApiError(await getLoan(borrowerRequest(borrower, `http://localhost/api/borrower/loans/${accepted.loanId}`), {
      params: Promise.resolve({ loanId: accepted.loanId }),
    }), { status: 404, code: "NOT_FOUND" });
    await expectApiError(await getSchedule(borrowerRequest(borrower, `http://localhost/api/borrower/loans/${accepted.loanId}/schedule`), {
      params: Promise.resolve({ loanId: accepted.loanId }),
    }), { status: 404, code: "NOT_FOUND" });
  });

  it("API-03-13 returns the existing schedule for the authenticated borrower's loan", async () => {
    const setup = await createDueRepaymentContext();
    const response = await getSchedule(borrowerRequest(
      setup.borrower,
      `http://localhost/api/borrower/loans/${setup.context.loan.id}/schedule`,
    ), { params: Promise.resolve({ loanId: setup.context.loan.id }) });
    const schedule = await expectApiSuccess<{ installments: unknown[] }>(response);
    expect(schedule.installments.length).toBeGreaterThan(0);
  });

  it("API-03-19 returns the server-calculated payable amount for an owned loan", async () => {
    const setup = await createDueRepaymentContext();
    const response = await getPayableSummary(
      borrowerRequest(setup.borrower, `http://localhost/api/borrower/loans/${setup.context.loan.id}/payable`),
      { params: Promise.resolve({ loanId: setup.context.loan.id }) },
    );
    const data = await expectApiSuccess<{
      payableAmountSatang: string;
      installments: Array<{ installmentId: string; remainingBalanceSatang: string }>;
    }>(response);
    const schedule = await prisma.repaymentSchedule.findUniqueOrThrow({
      where: { loanId: setup.context.loan.id },
      select: { currentVersionId: true },
    });
    const persistedPayable = await prisma.installment.findMany({
      where: {
        scheduleVersionId: schedule.currentVersionId!,
        dueDate: { lte: new Date() },
        status: { in: ["PENDING", "PARTIALLY_PAID", "OVERDUE"] },
      },
      select: {
        id: true,
        principalDueSatang: true,
        paidPrincipalSatang: true,
        interestDueSatang: true,
        paidInterestSatang: true,
      },
    });
    const expectedPayable = persistedPayable.reduce(
      (sum, installment) => sum + installment.principalDueSatang - installment.paidPrincipalSatang + installment.interestDueSatang - installment.paidInterestSatang,
      0n,
    );
    expect(BigInt(data.payableAmountSatang)).toBeGreaterThan(0n);
    expect(BigInt(data.payableAmountSatang)).toBe(expectedPayable);
    expect(data.installments.map((item) => item.installmentId).sort()).toEqual(persistedPayable.map((item) => item.id).sort());
    expect(data.installments.reduce((sum, item) => sum + BigInt(item.remainingBalanceSatang), 0n)).toBe(expectedPayable);
  });

  it("API-03-20 returns only the authenticated borrower's wallet and posted ledger activity", async () => {
    const setup = await createDueRepaymentContext();
    const response = await getBorrowerWallet(borrowerRequest(setup.borrower, "http://localhost/api/borrower/wallet"));
    const data = await expectApiSuccess<{
      wallet: { ownerUserId: string; balanceSatang: string };
      transactions: Array<{ ledgerEntryId: string; status: string; amountSatang: string }>;
      pagination: { page: number; limit: number; total: number };
    }>(response);
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { ownerUserId: setup.context.borrowerUser.id } });
    const postedEntries = await prisma.ledgerEntry.findMany({
      where: { walletId: wallet.id, ledgerTransaction: { status: "POSTED", postedAt: { not: null } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
      select: { id: true, amountSatang: true },
    });
    expect(data.wallet).toMatchObject({
      ownerUserId: setup.context.borrowerUser.id,
      balanceSatang: wallet.balanceSatang.toString(),
    });
    expect(data.transactions.every((transaction) => transaction.status === "POSTED")).toBe(true);
    expect(data.transactions.every((transaction) => /^\d+$/.test(transaction.amountSatang))).toBe(true);
    expect(data.transactions.map((transaction) => transaction.ledgerEntryId)).toEqual(postedEntries.map((entry) => entry.id));
    expect(data.transactions.map((transaction) => BigInt(transaction.amountSatang))).toEqual(postedEntries.map((entry) => entry.amountSatang));
    expect(data.pagination.total).toBe(await prisma.ledgerEntry.count({ where: { walletId: wallet.id, ledgerTransaction: { status: "POSTED", postedAt: { not: null } } } }));
  });

  it("API-03-21 does not disclose another borrower's payable amount", async () => {
    const setup = await createDueRepaymentContext();
    await expectApiError(
      await getPayableSummary(
        borrowerRequest(otherBorrower, `http://localhost/api/borrower/loans/${setup.context.loan.id}/payable`),
        { params: Promise.resolve({ loanId: setup.context.loan.id }) },
      ),
      { status: 404, code: "NOT_FOUND" },
    );
  });

  it("API-03-14 submits a valid repayment through the existing service", async () => {
    const setup = await createDueRepaymentContext();
    const key = `api-repayment-${randomUUID()}`;
    const response = await submitRepayment(borrowerRequest(setup.borrower, "http://localhost/api/borrower/repayments", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify({ loanId: setup.context.loan.id, amountSatang: setup.amount.toString() }),
    }));
    const result = await expectApiSuccess<{ ledgerTransactionId: string; totalSatang: string }>(response, 201);
    expect(result.ledgerTransactionId).toBeTruthy();
    expect(result.totalSatang).toBe(setup.amount.toString());
  });

  it("API-03-15 rejects a repayment above the currently payable amount", async () => {
    const setup = await createDueRepaymentContext();
    const before = await prisma.wallet.findUniqueOrThrow({ where: { ownerUserId: setup.context.borrowerUser.id } });
    const response = await submitRepayment(borrowerRequest(setup.borrower, "http://localhost/api/borrower/repayments", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": `api-overpay-${randomUUID()}` },
      body: JSON.stringify({ loanId: setup.context.loan.id, amountSatang: "999999999999" }),
    }));
    await expectApiError(response, { status: 422, code: "BUSINESS_RULE_VIOLATION" });
    const after = await prisma.wallet.findUniqueOrThrow({ where: { id: before.id } });
    expect(after.balanceSatang).toBe(before.balanceSatang);
  });

  it("REP-FE-15 rejects a borrower attempting to repay another borrower's loan without posting", async () => {
    const setup = await createDueRepaymentContext();
    const loanOwnerWallet = await prisma.wallet.findUniqueOrThrow({ where: { ownerUserId: setup.context.borrowerUser.id } });
    const key = `repayment-foreign-loan-${randomUUID()}`;
    const beforeCount = await prisma.ledgerTransaction.count({ where: { idempotencyKey: key } });
    const repaymentCountBefore = await prisma.repayment.count({ where: { loanId: setup.context.loan.id } });
    const response = await submitRepayment(borrowerRequest(borrower, "http://localhost/api/borrower/repayments", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify({ loanId: setup.context.loan.id, amountSatang: "1" }),
    }));
    await expectApiError(response, { status: 403, code: "FORBIDDEN" });
    const afterWallet = await prisma.wallet.findUniqueOrThrow({ where: { id: loanOwnerWallet.id } });
    expect(afterWallet.balanceSatang).toBe(loanOwnerWallet.balanceSatang);
    await expect(prisma.ledgerTransaction.count({ where: { idempotencyKey: key } })).resolves.toBe(beforeCount);
    await expect(prisma.repayment.count({ where: { loanId: setup.context.loan.id } })).resolves.toBe(repaymentCountBefore);
  });

  it("API-03-16 reuses an idempotent repayment submission", async () => {
    const setup = await createDueRepaymentContext();
    const key = `api-duplicate-${randomUUID()}`;
    const path = "http://localhost/api/borrower/repayments";
    const init = {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify({ loanId: setup.context.loan.id, amountSatang: setup.amount.toString() }),
    };
    const first = await submitRepayment(borrowerRequest(setup.borrower, path, init));
    const firstResult = await expectApiSuccess<{ ledgerTransactionId: string }>(first, 201);
    const second = await submitRepayment(borrowerRequest(setup.borrower, path, init));
    const secondResult = await expectApiSuccess<{ ledgerTransactionId: string }>(second, 201);
    expect(secondResult.ledgerTransactionId).toBe(firstResult.ledgerTransactionId);
    await expect(prisma.ledgerTransaction.count({ where: { idempotencyKey: key } })).resolves.toBe(1);
  });

  it("REC-FE-04/05 returns receipt details assembled from persisted repayment and linked borrower records", async () => {
    const setup = await createDueRepaymentContext();
    const response = await submitRepayment(borrowerRequest(setup.borrower, "http://localhost/api/borrower/repayments", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": `api-receipt-${randomUUID()}` },
      body: JSON.stringify({ loanId: setup.context.loan.id, amountSatang: setup.amount.toString() }),
    }));
    const submission = await expectApiSuccess<{ ledgerTransactionId: string }>(response, 201);
    const repayment = await prisma.repayment.findFirstOrThrow({
      where: { ledgerTransactionId: submission.ledgerTransactionId }, select: { id: true },
    });
    const receipt = await getReceipt(borrowerRequest(
      setup.borrower,
      `http://localhost/api/borrower/repayments/${repayment.id}/receipt`,
    ), { params: Promise.resolve({ repaymentId: repayment.id }) });
    const data = await expectApiSuccess<{
      receiptId: string; borrower: { legalName: string }; loanId: string; ledgerTransactionId: string;
      status: string; repaymentDate: string; receiptTimestamp: string; totalReceivedSatang: string;
      principalSatang: string; interestSatang: string; repaymentIds: string[];
      repayments: Array<{ repaymentId: string; installmentNumber: number; principalSatang: string; interestSatang: string; totalSatang: string }>;
    }>(receipt);
    const persistedRows = await prisma.repayment.findMany({ where: { ledgerTransactionId: submission.ledgerTransactionId }, orderBy: { id: "asc" }, include: { loan: { select: { borrowerProfile: { select: { legalName: true } } } } } });
    expect(data).toMatchObject({
      receiptId: submission.ledgerTransactionId,
      borrower: { legalName: persistedRows[0].loan.borrowerProfile.legalName },
      loanId: setup.context.loan.id,
      ledgerTransactionId: submission.ledgerTransactionId,
      status: "POSTED",
      totalReceivedSatang: setup.amount.toString(),
      principalSatang: persistedRows.reduce((sum, row) => sum + row.principalSatang, 0n).toString(),
      interestSatang: persistedRows.reduce((sum, row) => sum + row.interestSatang, 0n).toString(),
    });
    expect(data.receiptTimestamp).toBeTruthy();
    expect(data.repaymentDate).toBe(data.receiptTimestamp);
    expect(data.repaymentIds.sort()).toEqual(persistedRows.map((row) => row.id).sort());
    expect(data.repayments).toHaveLength(persistedRows.length);
    expect(data.repayments[0]).toMatchObject({
      repaymentId: persistedRows[0].id,
      principalSatang: persistedRows[0].principalSatang.toString(),
      interestSatang: persistedRows[0].interestSatang.toString(),
      totalSatang: persistedRows[0].totalSatang.toString(),
    });
  });

  it("REC-FE-06 returns not found for an invalid repayment reference", async () => {
    const repaymentId = randomUUID();
    const response = await getReceipt(borrowerRequest(borrower, `http://localhost/api/borrower/repayments/${repaymentId}/receipt`), {
      params: Promise.resolve({ repaymentId }),
    });
    await expectApiError(response, { status: 404, code: "NOT_FOUND" });
  });

  it("REC-FE-07 denies another borrower access to a repayment receipt", async () => {
    const setup = await createDueRepaymentContext();
    const response = await submitRepayment(borrowerRequest(setup.borrower, "http://localhost/api/borrower/repayments", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": `api-private-receipt-${randomUUID()}` },
      body: JSON.stringify({ loanId: setup.context.loan.id, amountSatang: setup.amount.toString() }),
    }));
    const submission = await expectApiSuccess<{ ledgerTransactionId: string }>(response, 201);
    const repayment = await prisma.repayment.findFirstOrThrow({
      where: { ledgerTransactionId: submission.ledgerTransactionId }, select: { id: true },
    });
    await expectApiError(await getReceipt(borrowerRequest(
      borrower,
      `http://localhost/api/borrower/repayments/${repayment.id}/receipt`,
    ), { params: Promise.resolve({ repaymentId: repayment.id }) }), {
      status: 404, code: "NOT_FOUND",
    });
  });

  it("API-03-19 lists the borrower's persisted repayment history with references and pagination", async () => {
    const setup = await createDueRepaymentContext();
    const key = `api-history-${randomUUID()}`;
    const submission = await submitRepayment(borrowerRequest(setup.borrower, "http://localhost/api/borrower/repayments", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": key },
      body: JSON.stringify({ loanId: setup.context.loan.id, amountSatang: setup.amount.toString() }),
    }));
    const posted = await expectApiSuccess<{ ledgerTransactionId: string }>(submission, 201);
    const persisted = await prisma.repayment.findFirstOrThrow({
      where: { ledgerTransactionId: posted.ledgerTransactionId },
      orderBy: { receivedAt: "desc" },
    });

    const response = await listRepayments(borrowerRequest(
      setup.borrower,
      "http://localhost/api/borrower/repayments?page=1&limit=10&sortBy=receivedAt&sortOrder=desc",
    ));
    const envelope = await response.clone().json() as {
      pagination?: { page: number; limit: number; total: number; totalPages: number };
    };
    const rows = await expectApiSuccess<Array<{
      id: string;
      loanId: string;
      installmentId: string;
      ledgerTransactionId: string;
      principalSatang: string;
      interestSatang: string;
      feeSatang: string;
      totalSatang: string;
      status: string;
      receivedAt: string;
    }>>(response);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: persisted.id,
      loanId: setup.context.loan.id,
      installmentId: persisted.installmentId,
      ledgerTransactionId: posted.ledgerTransactionId,
      principalSatang: persisted.principalSatang.toString(),
      interestSatang: persisted.interestSatang.toString(),
      feeSatang: persisted.feeSatang.toString(),
      totalSatang: persisted.totalSatang.toString(),
      status: persisted.status,
      receivedAt: persisted.receivedAt.toISOString(),
    });
    expect(envelope.pagination).toMatchObject({ page: 1, limit: 10, total: 1, totalPages: 1 });
  });

  it("API-03-20 scopes repayment history to the authenticated borrower", async () => {
    const setup = await createDueRepaymentContext();
    const submission = await submitRepayment(borrowerRequest(setup.borrower, "http://localhost/api/borrower/repayments", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": `api-history-private-${randomUUID()}` },
      body: JSON.stringify({ loanId: setup.context.loan.id, amountSatang: setup.amount.toString() }),
    }));
    await expectApiSuccess(submission, 201);

    const response = await listRepayments(borrowerRequest(otherBorrower, "http://localhost/api/borrower/repayments"));
    const rows = await expectApiSuccess<Array<{ loanId: string }>>(response);
    expect(rows).toEqual([]);
  });

  it("API-03-21 requires an authenticated borrower for repayment history", async () => {
    await expectApiError(await listRepayments(new Request("http://localhost/api/borrower/repayments")), {
      status: 401,
      code: "UNAUTHENTICATED",
    });
  });
});
