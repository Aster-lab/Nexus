import { apiGet, apiPatch } from "./api-client";

export type AdminPolicyVersionStatus = "PROPOSED" | "APPROVED" | "SCHEDULED" | "ACTIVE" | "SUPERSEDED" | "FAILED";
export interface AdminPolicyVersion {
  id: string;
  versionNumber: number;
  policyValues: unknown;
  status: AdminPolicyVersionStatus;
  approvedByUserId: string | null;
  effectiveAt: string | null;
  createdAt: string;
}
export interface AdminPolicy {
  id: string;
  policyCode: string;
  name: string;
  description: string | null;
  versions: AdminPolicyVersion[];
}

export async function loadAdminPolicies() {
  return (await apiGet<AdminPolicy[]>("/api/admin/policies")).data;
}

export async function administerPolicyVersion(policyVersionId: string, action: "APPROVE" | "ACTIVATE") {
  return (await apiPatch<AdminPolicyVersion, { action: "APPROVE" | "ACTIVATE" }>(
    `/api/admin/policies/${encodeURIComponent(policyVersionId)}`,
    { action },
  )).data;
}
