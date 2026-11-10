"""Normalized versioned JSON details for DocumentSecurityScan.details."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints


ScanCode = Annotated[
    str,
    StringConstraints(pattern=r"^[A-Z][A-Z0-9_]{0,99}$", strip_whitespace=True),
]


class DocumentScanFinding(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, str_strip_whitespace=True)

    code: ScanCode
    severity: Literal["INFO", "LOW", "HIGH", "CRITICAL"]


class DocumentScanDetailsContract(BaseModel):
    """Provider-neutral findings; scanner version and result stay relational."""
    model_config = ConfigDict(extra="forbid", strict=True)

    schema_version: Literal["document_scan_details.v1"]
    findings: list[DocumentScanFinding] = Field(default_factory=list)
