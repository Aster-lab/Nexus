"""Strict event-specific contracts for security and system event metadata."""

from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field, StrictInt, StringConstraints, model_validator


NonEmpty = Annotated[str, StringConstraints(min_length=1, strip_whitespace=True)]
Code = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$", strip_whitespace=True)]


class StrictDocument(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)


class AuthSucceededMetadata(StrictDocument):
    schema_version: Literal["security_event_metadata.v1"]
    auth_method: Literal["PASSWORD", "OAUTH", "UNKNOWN"]


class AuthFailedMetadata(StrictDocument):
    schema_version: Literal["security_event_metadata.v1"]
    auth_method: Literal["PASSWORD", "OAUTH", "UNKNOWN"]
    reason_code: Literal["INVALID_CREDENTIALS", "PROVIDER_ERROR", "ACCOUNT_LOCKED"]


class MfaFailedMetadata(StrictDocument):
    schema_version: Literal["security_event_metadata.v1"]
    factor_type: Literal["TOTP", "EMAIL", "SMS", "RECOVERY"]
    reason_code: Literal["INVALID_CODE", "EXPIRED_CODE", "REPLAYED"]


class PasswordResetRequestedMetadata(StrictDocument):
    schema_version: Literal["security_event_metadata.v1"]
    delivery_channel: Literal["EMAIL", "SMS"]


class PasswordChangedMetadata(StrictDocument):
    schema_version: Literal["security_event_metadata.v1"]
    change_method: Literal["USER", "RESET", "ADMIN"]


class SessionRevokedMetadata(StrictDocument):
    schema_version: Literal["security_event_metadata.v1"]
    reason_code: Literal["USER_REQUEST", "ADMIN_ACTION", "SECURITY_POLICY"]


class AccessDeniedMetadata(StrictDocument):
    schema_version: Literal["security_event_metadata.v1"]
    resource_type: Literal["ACCOUNT", "WALLET", "LOAN", "APPLICATION", "ADMIN_RESOURCE"]
    permission_code: Code


SecurityMetadata = Union[
    AuthSucceededMetadata, AuthFailedMetadata, MfaFailedMetadata,
    PasswordResetRequestedMetadata, PasswordChangedMetadata,
    SessionRevokedMetadata, AccessDeniedMetadata,
]


class SecurityEventContract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    event_type: Literal[
        "AUTHENTICATION_SUCCEEDED", "AUTHENTICATION_FAILED", "MFA_FAILED",
        "PASSWORD_RESET_REQUESTED", "PASSWORD_CHANGED", "SESSION_REVOKED", "ACCESS_DENIED",
    ]
    metadata: SecurityMetadata

    @model_validator(mode="after")
    def match_event_type_and_metadata(self):
        expected = {
            "AUTHENTICATION_SUCCEEDED": AuthSucceededMetadata,
            "AUTHENTICATION_FAILED": AuthFailedMetadata,
            "MFA_FAILED": MfaFailedMetadata,
            "PASSWORD_RESET_REQUESTED": PasswordResetRequestedMetadata,
            "PASSWORD_CHANGED": PasswordChangedMetadata,
            "SESSION_REVOKED": SessionRevokedMetadata,
            "ACCESS_DENIED": AccessDeniedMetadata,
        }[self.event_type]
        if not isinstance(self.metadata, expected):
            raise ValueError("metadata shape does not match event_type")
        return self


class WorkerLifecycleMetadata(StrictDocument):
    schema_version: Literal["system_event_metadata.v1"]
    worker_name: NonEmpty
    release_id: NonEmpty | None = None


class JobFailedMetadata(StrictDocument):
    schema_version: Literal["system_event_metadata.v1"]
    job_name: NonEmpty
    error_code: NonEmpty
    attempt_number: StrictInt = Field(gt=0)


class ServiceHealthChangedMetadata(StrictDocument):
    schema_version: Literal["system_event_metadata.v1"]
    component: NonEmpty
    previous_status: NonEmpty | None


class ModelLoadFailedMetadata(StrictDocument):
    schema_version: Literal["system_event_metadata.v1"]
    model_name: NonEmpty
    model_version: NonEmpty
    error_code: NonEmpty


class MigrationAppliedMetadata(StrictDocument):
    schema_version: Literal["system_event_metadata.v1"]
    migration_name: NonEmpty


SystemMetadata = Union[
    WorkerLifecycleMetadata, JobFailedMetadata, ServiceHealthChangedMetadata,
    ModelLoadFailedMetadata, MigrationAppliedMetadata,
]


class SystemEventContract(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    event_type: Literal[
        "WORKER_STARTED", "WORKER_STOPPED", "JOB_FAILED", "SERVICE_HEALTH_CHANGED",
        "MODEL_LOAD_FAILED", "DATABASE_MIGRATION_APPLIED",
    ]
    metadata: SystemMetadata

    @model_validator(mode="after")
    def match_event_type_and_metadata(self):
        expected = {
            "WORKER_STARTED": WorkerLifecycleMetadata,
            "WORKER_STOPPED": WorkerLifecycleMetadata,
            "JOB_FAILED": JobFailedMetadata,
            "SERVICE_HEALTH_CHANGED": ServiceHealthChangedMetadata,
            "MODEL_LOAD_FAILED": ModelLoadFailedMetadata,
            "DATABASE_MIGRATION_APPLIED": MigrationAppliedMetadata,
        }[self.event_type]
        if not isinstance(self.metadata, expected):
            raise ValueError("metadata shape does not match event_type")
        return self
