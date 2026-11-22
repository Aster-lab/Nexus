import { ApplicationSnapshotSchema, BORROWER_COMPANY_TYPES } from "../contracts/application";

export interface InvestorBorrowerOverview {
  loanPurpose: string;
  employmentCategory: string;
  roleTenureBand: string | null;
  companyName: string | null;
  companyType: string | null;
}

const COMPANY_TYPE_LABELS: Record<typeof BORROWER_COMPANY_TYPES[number], string> = {
  SOLE_PROPRIETORSHIP: "Sole proprietorship",
  PARTNERSHIP: "Partnership",
  PRIVATE_LIMITED_COMPANY: "Private limited company",
  PUBLIC_LIMITED_COMPANY: "Public limited company",
  COOPERATIVE: "Cooperative or community enterprise",
  OTHER: "Other",
};

function employmentCategory(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (/^(employed|employee|full[- ]?time|part[- ]?time)$/.test(normalized)) return "Employed (self-reported)";
  if (/^(self[- ]?employed|business owner)$/.test(normalized)) return "Self-employed (self-reported)";
  if (/^(student|studying)$/.test(normalized)) return "Student (self-reported)";
  if (/^(unemployed|not employed)$/.test(normalized)) return "Not currently employed (self-reported)";
  if (/^retired$/.test(normalized)) return "Retired (self-reported)";
  return "Employment details provided";
}

function roleTenureBand(months: number | null): string | null {
  if (months === null) return null;
  if (months < 12) return "Under 1 year";
  if (months < 36) return "1–2 years";
  return "3+ years";
}

export function toInvestorBorrowerOverview(value: unknown): InvestorBorrowerOverview | null {
  const snapshot = ApplicationSnapshotSchema.safeParse(value);
  if (!snapshot.success) return null;

  const purpose = snapshot.data.requested_loan.purpose.trim().toLowerCase();
  const allowedPurposes = new Set(["business", "education", "medical", "personal", "home", "other"]);

  return {
    loanPurpose: allowedPurposes.has(purpose) ? purpose[0].toUpperCase() + purpose.slice(1) : "Other",
    employmentCategory: employmentCategory(snapshot.data.employment.employment_status),
    roleTenureBand: roleTenureBand(snapshot.data.employment.months_in_role),
    companyName: snapshot.data.employment.company_name?.trim() || null,
    companyType: snapshot.data.employment.company_type ? COMPANY_TYPE_LABELS[snapshot.data.employment.company_type] : null,
  };
}
