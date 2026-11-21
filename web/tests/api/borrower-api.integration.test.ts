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
import { POST as acceptOffer } from "../../src/app/api/borrower/offers/[offerId]/accept/route";
import { GET as getLoans } from "../../src/app/api/borrower/loans/route";
import { GET as getLoan } from "../../src/app/api/borrower/loans/[loanId]/route";
import { GET as getSchedule } from "../../src/app/api/borrower/loans/[loanId]/schedule/route";
import { GET as getPayableSummary } from "../../src/app/api/borrower/loans/[loanId]/payable/route";
import { GET as getBorrowerWallet } from "../../src/app/api/borrower/wallet/route";
import { POST as submitRepayment } from "../../src/app/api/borrower/repayments/route";
import { GET as getReceipt } from "../../src/app/api/borrower/repayments/[repaymentId]/receipt/route";
import { prisma } from "../../src/lib/prisma";
import { generateRepaymentSchedule } from "../../src/lib/services/repayment.service";
import { createRepaymentTestContext, type RepaymentTestContext } from "../fixtures/repayment.fixture";
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
    borrower = await createBorrower();
    otherBorrower = await createBorrower();
    approver = await prisma.user.create({
      data: { email: `${randomUUID()}@api-approver.test`, accountStatus: "ACTIVE" },
      select: { id: true },
    });
    await ensureActiveLoanOfferPolicy(approver.id);
  });

  afterEach(async () => {
    if (createdLoanIds.length) {
      await prisma.loanStatusHistory.deleteMany({ where: { loanId: { in: createdLoanIds } } });
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
    const result = await expectApiSuccess<{ status: string; submittedAt: string }>(response);
    expect(result.status).toBe("SUBMITTED");
    expect(result.submittedAt).toBeTruthy();
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
  });

  it("API-03-09 rejects an expired offer", async () => {
    const { offerId } = await createApprovedOffer(borrower, new Date(Date.now() - 1000));
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

  it("API-03-17 returns the persisted repayment receipt for its owner", async () => {
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
    const data = await expectApiSuccess<{ ledgerTransactionId: string; status: string }>(receipt);
    expect(data.ledgerTransactionId).toBe(submission.ledgerTransactionId);
    expect(data.status).toBe("POSTED");
  });

  it("API-03-18 denies another user access to a repayment receipt", async () => {
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
});
