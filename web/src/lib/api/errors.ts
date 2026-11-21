import { ZodError } from "zod";
import { apiError, apiErrorResponse, type ApiErrorEnvelope } from "./responses";

export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly status: number,
    readonly details?: unknown[],
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface MappedApiError {
  status: number;
  body: ApiErrorEnvelope;
}

function isErrorWithCode(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error &&
    typeof (error as { code?: unknown }).code === "string";
}

export function mapApiError(error: unknown): MappedApiError {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      body: apiError(error.code, error.message, error.details),
    };
  }

  if (error instanceof ZodError) {
    return {
      status: 400,
      body: apiError("VALIDATION_ERROR", "Invalid request data",
        error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }))),
    };
  }

  if (error instanceof Error) {
    const repaymentBusinessRules = new Set([
      "Repayment exceeds the payable outstanding amount.",
      "Repayment amount exceeds the currently payable outstanding amount.",
      "There are no currently payable installments.",
      "There is no outstanding amount to repay.",
    ]);
    if (repaymentBusinessRules.has(error.message)) {
      return {
        status: 422,
        body: apiError("BUSINESS_RULE_VIOLATION", "The repayment cannot be made against the current payable balance."),
      };
    }
    if (error.message === "Insufficient borrower wallet balance.") {
      return {
        status: 422,
        body: apiError("INSUFFICIENT_FUNDS", "The borrower wallet does not have sufficient available balance."),
      };
    }
    if (error.message === "Only the loan borrower can submit a repayment.") {
      return { status: 403, body: apiError("FORBIDDEN", "You are not authorized to repay this loan.") };
    }
    if (error.message === "Loan not found.") {
      return { status: 404, body: apiError("NOT_FOUND", "The requested loan was not found.") };
    }
    if (error.message === "Payout requires a POSTED repayment and POSTED ledger transaction." ||
      error.message === "Payout allocation must have a positive payable amount.") {
      return { status: 422, body: apiError("BUSINESS_RULE_VIOLATION", "The payout allocation is not eligible for processing.") };
    }
    const payoutErrors: Record<string, { status: number; code: string; message: string }> = {
      "Payout allocation was not found.": { status: 404, code: "NOT_FOUND", message: "The payout allocation was not found." },
      "This allocation already has an investor payout.": { status: 409, code: "ALLOCATION_ALREADY_PAID", message: "This allocation has already been paid." },
      "Payout idempotency key conflicts with a different allocation.": { status: 409, code: "IDEMPOTENCY_KEY_CONFLICT", message: "The idempotency key belongs to a different payout request." },
      "Payout idempotency key is already in use.": { status: 409, code: "IDEMPOTENCY_KEY_CONFLICT", message: "The idempotency key belongs to a different payout request." },
      "The original payout request has not completed.": { status: 409, code: "PAYOUT_NOT_COMPLETED", message: "The original payout request has not completed." },
    };
    const payoutError = payoutErrors[error.message];
    if (payoutError) return { status: payoutError.status, body: apiError(payoutError.code, payoutError.message) };
    if (error.message === "An administrator actor is required for payout processing.") {
      return { status: 403, body: apiError("FORBIDDEN", "You are not authorized to perform this action.") };
    }
    if (error.message.startsWith("Insufficient balance in the Repayment Clearing") ||
      error.message.includes("wallet must be active") || error.message.includes("wallet currency must be THB") ||
      error.message.includes("account is not active") || error.message.includes("profile is not active") ||
      error.message.includes("Recovery allocation requires")) {
      return { status: 422, body: apiError("BUSINESS_RULE_VIOLATION", "The payout cannot be processed in the current financial state.") };
    }
  }

  if (isErrorWithCode(error)) {
    const serviceErrors: Record<string, { status: number; code: string; message: string }> = {
      APPLICATION_POLICY_UNAVAILABLE: { status: 503, code: "SERVICE_UNAVAILABLE", message: "Loan application policy is not currently available." },
      APPLICATION_POLICY_VIOLATION: { status: 422, code: "BUSINESS_RULE_VIOLATION", message: "Requested amount or term is outside the permitted policy." },
      APPLICATION_NOT_FOUND: { status: 404, code: "NOT_FOUND", message: "The requested application was not found." },
      APPLICATION_NOT_REVIEWABLE: { status: 409, code: "APPLICATION_NOT_REVIEWABLE", message: "The application cannot receive a final decision in its current state." },
      APPLICATION_NOT_EDITABLE: { status: 409, code: "APPLICATION_NOT_EDITABLE", message: "The application can no longer be edited." },
      APPLICATION_NOT_SUBMITTABLE: { status: 409, code: "APPLICATION_NOT_SUBMITTABLE", message: "The application cannot be submitted in its current state." },
      OFFER_POLICY_UNAVAILABLE: { status: 503, code: "SERVICE_UNAVAILABLE", message: "Loan offer policy is not currently available." },
      OFFER_POLICY_VIOLATION: { status: 422, code: "BUSINESS_RULE_VIOLATION", message: "Offer terms are outside the permitted policy." },
      OFFER_APPLICATION_NOT_ELIGIBLE: { status: 409, code: "APPLICATION_NOT_ELIGIBLE", message: "Only an approved application can receive an offer." },
      OFFER_ALREADY_ISSUED: { status: 409, code: "OFFER_ALREADY_ISSUED", message: "An unexpired offer already exists for this application version." },
      OFFER_NOT_FOUND: { status: 404, code: "NOT_FOUND", message: "The requested offer was not found." },
      OFFER_EXPIRED: { status: 422, code: "BUSINESS_RULE_VIOLATION", message: "The offer has expired." },
      OFFER_NOT_AVAILABLE: { status: 409, code: "OFFER_NOT_AVAILABLE", message: "The offer is not available for acceptance." },
      OFFER_ALREADY_ACCEPTED: { status: 409, code: "OFFER_ALREADY_ACCEPTED", message: "The offer has already been accepted." },
      LOAN_NOT_FOUND: { status: 404, code: "NOT_FOUND", message: "The requested loan was not found." },
      INVALID_LOAN_STATUS: { status: 409, code: "LOAN_NOT_ELIGIBLE", message: "The loan is not eligible for this operation in its current state." },
      LOAN_NOT_FULLY_FUNDED: { status: 422, code: "BUSINESS_RULE_VIOLATION", message: "The loan must be fully funded before disbursement." },
      ALREADY_DISBURSED: { status: 409, code: "ALREADY_DISBURSED", message: "The loan has already been disbursed." },
      REQUEST_ALREADY_APPROVED: { status: 409, code: "REQUEST_ALREADY_APPROVED", message: "The disbursement request has already been approved." },
      INVALID_APPROVAL: { status: 409, code: "INVALID_APPROVAL", message: "A valid disbursement approval is required." },
      INVALID_REQUEST: { status: 409, code: "INVALID_REQUEST", message: "A valid disbursement request is required." },
      INVALID_DISBURSEMENT_REQUEST: { status: 409, code: "INVALID_DISBURSEMENT_REQUEST", message: "A valid disbursement request is required." },
      INVALID_REASON: { status: 400, code: "VALIDATION_ERROR", message: "A valid reason is required." },
      SELF_RESTRICTION_REJECTED: { status: 409, code: "SELF_RESTRICTION_REJECTED", message: "An administrator cannot restrict their own account." },
      REPAYMENT_NOT_FOUND: { status: 404, code: "NOT_FOUND", message: "The requested repayment was not found." },
    };
    const serviceError = Object.hasOwn(serviceErrors, error.code)
      ? serviceErrors[error.code]
      : undefined;
    if (serviceError) {
      return {
        status: serviceError.status,
        body: apiError(serviceError.code, serviceError.message),
      };
    }
    if (error.code === "FINANCIAL_ADMIN_REQUIRED") {
      return { status: 403, body: apiError("FORBIDDEN", "You are not authorized to perform this action.") };
    }
    if (error.code === "P2002" || error.code === "P2003" || error.code === "P2034") {
      return { status: 409, body: apiError("CONFLICT", "The request conflicts with the current resource state.") };
    }
    if (error.code === "P2025") {
      return { status: 404, body: apiError("NOT_FOUND", "The requested resource was not found.") };
    }
  }

  return {
    status: 500,
    body: apiError("INTERNAL_ERROR", "An unexpected error occurred."),
  };
}

export function apiErrorResponseFrom(error: unknown): Response {
  const mapped = mapApiError(error);
  return apiErrorResponse(
    mapped.body.error.code,
    mapped.body.error.message,
    mapped.status,
    mapped.body.error.details,
  );
}
