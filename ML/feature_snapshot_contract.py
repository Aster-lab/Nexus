"""Pydantic contract for the JSON document stored by FeatureSnapshot."""

from datetime import datetime
from typing import Annotated
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from feature_contract import FEATURE_NAMES, FEATURE_SCHEMA_VERSION
from main import LoanApplicationSchema


NonEmpty = Annotated[str, Field(min_length=1)]


class FeatureSnapshotContract(BaseModel):
    # Parse JSON timestamp/UUID strings while keeping feature_values strict
    # through its own LoanApplicationSchema validator.
    model_config = ConfigDict(extra="forbid", strict=False)

    schema_version: str
    feature_generation_version: NonEmpty
    source_application_version_id: UUID
    created_at: datetime
    feature_values: LoanApplicationSchema
    feature_units: dict[str, NonEmpty]
    source_mapping: dict[str, NonEmpty]

    @field_validator("schema_version")
    @classmethod
    def require_supported_schema(cls, value: str) -> str:
        if value != FEATURE_SCHEMA_VERSION:
            raise ValueError(f"schema_version must be {FEATURE_SCHEMA_VERSION}")
        return value

    @field_validator("created_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("created_at must include a timezone")
        return value

    @field_validator("feature_units", "source_mapping")
    @classmethod
    def require_all_features(cls, value: dict[str, str]) -> dict[str, str]:
        if set(value) != set(FEATURE_NAMES):
            raise ValueError("metadata must contain exactly the 11 canonical feature names")
        return value
