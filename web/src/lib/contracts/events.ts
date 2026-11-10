import { z } from "zod";

const authMethod = z.enum(["PASSWORD", "OAUTH", "UNKNOWN"]);
const securityVersion = { schema_version: z.literal("security_event_metadata.v1") };

const authenticationSucceeded = z.object({ ...securityVersion, auth_method: authMethod }).strict();
const authenticationFailed = z.object({
  ...securityVersion,
  auth_method: authMethod,
  reason_code: z.enum(["INVALID_CREDENTIALS", "PROVIDER_ERROR", "ACCOUNT_LOCKED"]),
}).strict();
const mfaFailed = z.object({
  ...securityVersion,
  factor_type: z.enum(["TOTP", "EMAIL", "SMS", "RECOVERY"]),
  reason_code: z.enum(["INVALID_CODE", "EXPIRED_CODE", "REPLAYED"]),
}).strict();
const passwordResetRequested = z.object({
  ...securityVersion,
  delivery_channel: z.enum(["EMAIL", "SMS"]),
}).strict();
const passwordChanged = z.object({
  ...securityVersion,
  change_method: z.enum(["USER", "RESET", "ADMIN"]),
}).strict();
const sessionRevoked = z.object({
  ...securityVersion,
  reason_code: z.enum(["USER_REQUEST", "ADMIN_ACTION", "SECURITY_POLICY"]),
}).strict();
const accessDenied = z.object({
  ...securityVersion,
  resource_type: z.enum(["ACCOUNT", "WALLET", "LOAN", "APPLICATION", "ADMIN_RESOURCE"]),
  permission_code: z.string().trim().regex(/^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/),
}).strict();

export const SecurityEventContractSchema = z.object({
  event_type: z.enum([
    "AUTHENTICATION_SUCCEEDED", "AUTHENTICATION_FAILED", "MFA_FAILED",
    "PASSWORD_RESET_REQUESTED", "PASSWORD_CHANGED", "SESSION_REVOKED", "ACCESS_DENIED",
  ]),
  metadata: z.union([
    authenticationSucceeded, authenticationFailed, mfaFailed, passwordResetRequested,
    passwordChanged, sessionRevoked, accessDenied,
  ]),
}).strict().superRefine((event, ctx) => {
  const schemas = {
    AUTHENTICATION_SUCCEEDED: authenticationSucceeded,
    AUTHENTICATION_FAILED: authenticationFailed,
    MFA_FAILED: mfaFailed,
    PASSWORD_RESET_REQUESTED: passwordResetRequested,
    PASSWORD_CHANGED: passwordChanged,
    SESSION_REVOKED: sessionRevoked,
    ACCESS_DENIED: accessDenied,
  } as const;
  if (!schemas[event.event_type].safeParse(event.metadata).success) {
    ctx.addIssue({ code: "custom", path: ["metadata"], message: "metadata shape does not match event_type" });
  }
});

const systemVersion = { schema_version: z.literal("system_event_metadata.v1") };
const workerLifecycle = z.object({
  ...systemVersion,
  worker_name: z.string().trim().min(1),
  release_id: z.string().trim().min(1).nullable().optional(),
}).strict();
const jobFailed = z.object({
  ...systemVersion,
  job_name: z.string().trim().min(1),
  error_code: z.string().trim().min(1),
  attempt_number: z.number().int().positive().safe(),
}).strict();
const serviceHealthChanged = z.object({
  ...systemVersion,
  component: z.string().trim().min(1),
  previous_status: z.string().trim().min(1).nullable(),
}).strict();
const modelLoadFailed = z.object({
  ...systemVersion,
  model_name: z.string().trim().min(1),
  model_version: z.string().trim().min(1),
  error_code: z.string().trim().min(1),
}).strict();
const migrationApplied = z.object({
  ...systemVersion,
  migration_name: z.string().trim().min(1),
}).strict();

export const SystemEventContractSchema = z.object({
  event_type: z.enum([
    "WORKER_STARTED", "WORKER_STOPPED", "JOB_FAILED", "SERVICE_HEALTH_CHANGED",
    "MODEL_LOAD_FAILED", "DATABASE_MIGRATION_APPLIED",
  ]),
  metadata: z.union([workerLifecycle, jobFailed, serviceHealthChanged, modelLoadFailed, migrationApplied]),
}).strict().superRefine((event, ctx) => {
  const schemas = {
    WORKER_STARTED: workerLifecycle,
    WORKER_STOPPED: workerLifecycle,
    JOB_FAILED: jobFailed,
    SERVICE_HEALTH_CHANGED: serviceHealthChanged,
    MODEL_LOAD_FAILED: modelLoadFailed,
    DATABASE_MIGRATION_APPLIED: migrationApplied,
  } as const;
  if (!schemas[event.event_type].safeParse(event.metadata).success) {
    ctx.addIssue({ code: "custom", path: ["metadata"], message: "metadata shape does not match event_type" });
  }
});

export type SecurityEventContract = z.infer<typeof SecurityEventContractSchema>;
export type SystemEventContract = z.infer<typeof SystemEventContractSchema>;
