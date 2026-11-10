from pathlib import Path

import pytest
from pydantic import ValidationError

from document_scan_contract import DocumentScanDetailsContract


def test_document_scan_details_accepts_normalized_findings_and_matches_zod():
    details = DocumentScanDetailsContract.model_validate({
        "schema_version": "document_scan_details.v1",
        "findings": [
            {"code": "MALWARE_SIGNATURE_MATCH", "severity": "CRITICAL"},
            {"code": "MACRO_PRESENT", "severity": "INFO"},
        ],
    })
    assert details.findings[0].severity == "CRITICAL"

    contract_path = Path(__file__).resolve().parents[3] / "web" / "src" / "lib" / "contracts" / "document-scan.ts"
    contract = contract_path.read_text(encoding="utf-8")
    for value in ("document_scan_details.v1", "findings", "code", "severity", "INFO", "LOW", "HIGH", "CRITICAL"):
        assert value in contract


def test_document_scan_details_rejects_raw_payloads_unknown_fields_and_versions():
    with pytest.raises(ValidationError):
        DocumentScanDetailsContract.model_validate({
            "schema_version": "document_scan_details.v1",
            "findings": [{"code": "X", "severity": "LOW", "vendor_blob": {"raw": "content"}}],
        })
    with pytest.raises(ValidationError):
        DocumentScanDetailsContract.model_validate({"schema_version": "document_scan_details.v2", "findings": []})
    with pytest.raises(ValidationError):
        DocumentScanDetailsContract.model_validate({
            "schema_version": "document_scan_details.v1",
            "findings": [{"code": "lowercase_code", "severity": "LOW"}],
        })


def test_document_scan_details_allows_no_findings():
    details = DocumentScanDetailsContract.model_validate({"schema_version": "document_scan_details.v1"})
    assert details.findings == []
