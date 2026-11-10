import { z } from "zod";

export const DocumentScanDetailsSchema = z.object({
  schema_version: z.literal("document_scan_details.v1"),
  findings: z.array(z.object({
    code: z.string().trim().regex(/^[A-Z][A-Z0-9_]{0,99}$/),
    severity: z.enum(["INFO", "LOW", "HIGH", "CRITICAL"]),
  }).strict()).default([]),
}).strict();
export const NullableDocumentScanDetailsSchema = DocumentScanDetailsSchema.nullable();

export type DocumentScanDetails = z.infer<typeof DocumentScanDetailsSchema>;
