# NEXUS Project References

Use these six documents as the supplied project documentation when continuing NEXUS work in Codex. They are currently stored in the user's Downloads folder; copy them into the code repository if Codex needs to read them from a future project session.

## Source of truth and document roles

1. **NEXUS_Design.docx** — Product and system design baseline (SDS v1.0): platform scope, roles, workflows, and architecture.
2. **NEXUS_database_design.docx** — Finalized database architecture (v1.0): PostgreSQL/Prisma domain decisions and data ownership principles.
3. **Nexus_erd.docx** — Consolidated field-level ERD review baseline (v1.1): use with the SDS to resolve model, field, relationship, and data-integrity questions.
4. **NEXUS TECHNICAL IMPLEMENTATION SPECIFICATION.docx** — Implementation contracts and technical requirements for the first release.
5. **Nexus_Database_Implementation_Report_Domains_1-13.docx** — Recorded implementation status as of 3 November 2026. It reports that thirteen Prisma schema domains and migrations succeeded; it does not claim the application workflows are complete.
6. **Nexus_Next_Implementation_Roadmap_Detailed.docx** — Recommended next phases and completion gates. The immediate action is to compare the actual Prisma schema with the SDS and field-level ERD, record discrepancies, and fix confirmed issues through additive migrations.

When documents differ, follow the SDS and field-level ERD for approved product and data-model decisions. Use the technical specification for implementation details, the database design for consolidated architecture decisions, the implementation report for what has been recorded as done, and the roadmap for sequencing remaining work. Verify all status claims against the actual repository before acting.

## Project facts and implementation guardrails

- NEXUS is a two-sided P2P micro-lending MVP with borrower applications, risk assessment, investor recommendations, fractional funding, escrow, repayments, payouts, and administration.
- MVP financial activity is simulated internally; it does not connect to real banking or payment infrastructure.
- Next.js/TypeScript owns business workflows and all core financial writes. PostgreSQL is the source of truth. FastAPI supplies prediction and recommendation inference and must not write core financial records.
- Use exact decimal or integer-satang arithmetic for money; never use binary floating point for financial calculations.
- Preserve successful migration history and existing data. Resolve schema changes with additive migrations; do not reset the database or delete migrations.
- Preserve auditable history such as application versions, model predictions, status history, ledger entries, and audit events. Correct historical errors with versioning or compensating records.
- Treat ML as decision support. It must not independently approve or reject borrowers outside the approved decision rules.
- The roadmap flags a schema review item: verify whether LoanStatusHistory has both previous_status and new_status as required by the ERD.
- The roadmap identifies Phase 1 as ERD-to-Prisma verification. Do not assume the local repository matches the last version discussed in ChatGPT; inspect the actual files first.

## Source files

- [NEXUS_Design.docx](<C:/Users/Lenovo/Downloads/NEXUS_Design.docx>)
- [NEXUS_database_design.docx](<C:/Users/Lenovo/Downloads/NEXUS_database_design.docx>)
- [Nexus_erd.docx](<C:/Users/Lenovo/Downloads/Nexus_erd.docx>)
- [NEXUS TECHNICAL IMPLEMENTATION SPECIFICATION.docx](<C:/Users/Lenovo/Downloads/NEXUS TECHNICAL IMPLEMENTATION SPECIFICATION.docx>)
- [Nexus_Database_Implementation_Report_Domains_1-13.docx](<C:/Users/Lenovo/Downloads/Nexus_Database_Implementation_Report_Domains_1-13.docx>)
- [Nexus_Next_Implementation_Roadmap_Detailed.docx](<C:/Users/Lenovo/Downloads/Nexus_Next_Implementation_Roadmap_Detailed.docx>)

