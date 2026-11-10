"""Versioned contracts for audit values and user-requested corrections."""

import math
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictStr, StringConstraints, field_validator, model_validator


FieldCode = Annotated[str, StringConstraints(pattern=r"^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$", strip_whitespace=True)]


def validate_json_value(value: Any, path: str = "value") -> None:
    if value is None or isinstance(value, (str, bool, int)):
        return
    if isinstance(value, float):
        if not math.isfinite(value):
            raise ValueError(f"{path} must not contain NaN or infinity")
        return
    if isinstance(value, list):
        for index, item in enumerate(value):
            validate_json_value(item, f"{path}[{index}]")
        return
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                raise ValueError(f"{path} object keys must be strings")
            validate_json_value(item, f"{path}.{key}")
        return
    raise ValueError(f"{path} must contain JSON-compatible values only")


class StrictDocument(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)


class AuditFieldValue(StrictDocument):
    field_code: FieldCode
    value: Any

    @field_validator("value")
    @classmethod
    def require_json_value(cls, value: Any) -> Any:
        validate_json_value(value)
        return value


class AuditValuesContract(StrictDocument):
    schema_version: Literal["audit_values.v1"]
    fields: list[AuditFieldValue] = Field(min_length=1)

    @model_validator(mode="after")
    def unique_field_codes(self):
        codes = [item.field_code for item in self.fields]
        if len(codes) != len(set(codes)):
            raise ValueError("field_code values must be unique")
        return self


class AuditLogValuesPairContract(BaseModel):
    """Validates both nullable audit JSON columns as a related before/after pair."""
    model_config = ConfigDict(extra="forbid", strict=True)

    old_values: AuditValuesContract | None
    new_values: AuditValuesContract | None

    @model_validator(mode="after")
    def matching_field_codes(self):
        if self.old_values is not None and self.new_values is not None:
            old_codes = {item.field_code for item in self.old_values.fields}
            new_codes = {item.field_code for item in self.new_values.fields}
            if old_codes != new_codes:
                raise ValueError("old_values and new_values must use the same field_code set")
        return self


class HistoryValuesPairContract(BaseModel):
    """Before/after JSON pair for alert and support history columns."""
    model_config = ConfigDict(extra="forbid", strict=True)

    old_value: AuditValuesContract | None
    new_value: AuditValuesContract | None

    @model_validator(mode="after")
    def matching_field_codes(self):
        if self.old_value is not None and self.new_value is not None:
            old_codes = {item.field_code for item in self.old_value.fields}
            new_codes = {item.field_code for item in self.new_value.fields}
            if old_codes != new_codes:
                raise ValueError("old_value and new_value must use the same field_code set")
        return self


class RequestedChange(StrictDocument):
    field_code: FieldCode
    proposed_value: Any

    @field_validator("proposed_value")
    @classmethod
    def require_json_value(cls, value: Any) -> Any:
        validate_json_value(value, "proposed_value")
        return value


class DataCorrectionRequestContract(StrictDocument):
    schema_version: Literal["data_correction_request.v1"]
    changes: list[RequestedChange] = Field(min_length=1)

    @model_validator(mode="after")
    def unique_field_codes(self):
        codes = [item.field_code for item in self.changes]
        if len(codes) != len(set(codes)):
            raise ValueError("field_code values must be unique")
        return self
