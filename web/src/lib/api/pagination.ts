import { z } from "zod";
import { ApiError } from "./errors";

export interface PaginationResult {
  page: number;
  limit: number;
  offset: number;
  sortBy?: string;
  sortOrder: "asc" | "desc";
  filters?: Record<string, string>;
}

export interface PaginationOptions {
  defaultLimit?: number;
  maxLimit?: number;
  sortFields?: readonly string[];
  filterFields?: readonly string[];
}

export function parsePagination(
  params: URLSearchParams,
  options: PaginationOptions = {},
): PaginationResult {
  const defaultLimit = options.defaultLimit ?? 20;
  const maxLimit = options.maxLimit ?? 100;
  const allowed = new Set([
    "page", "limit", "sortBy", "sortOrder", ...(options.filterFields ?? []),
  ]);
  for (const key of params.keys()) {
    if (!allowed.has(key)) {
      throw new ApiError("VALIDATION_ERROR", `Unsupported query parameter: ${key}`, 400);
    }
    if (params.getAll(key).length !== 1) {
      throw new ApiError("VALIDATION_ERROR", `Query parameter ${key} must appear once.`, 400);
    }
  }

  const schema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
    sortBy: z.string().min(1).optional(),
    sortOrder: z.enum(["asc", "desc"]).default("desc"),
  }).strict();
  const raw = Object.fromEntries(
    [...params.entries()].filter(([key]) => ["page", "limit", "sortBy", "sortOrder"].includes(key)),
  );
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ApiError(
      "VALIDATION_ERROR", "Invalid pagination parameters", 400,
      parsed.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
    );
  }
  if (parsed.data.sortBy && (!options.sortFields || !options.sortFields.includes(parsed.data.sortBy))) {
    throw new ApiError("VALIDATION_ERROR", "Unsupported sort field.", 400);
  }

  const filters = Object.fromEntries(
    [...params.entries()].filter(([key]) => !["page", "limit", "sortBy", "sortOrder"].includes(key)),
  );

  return {
    ...parsed.data,
    offset: (parsed.data.page - 1) * parsed.data.limit,
    ...(Object.keys(filters).length > 0 ? { filters } : {}),
  };
}
