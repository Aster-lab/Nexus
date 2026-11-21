import { z, type ZodType } from "zod";
import { ApiError } from "./errors";

function validationError(error: z.ZodError): ApiError {
  return new ApiError(
    "VALIDATION_ERROR",
    "Invalid request data",
    400,
    error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
  );
}

export function validate<T>(value: unknown, schema: ZodType<T>): T {
  const result = schema.safeParse(value);
  if (!result.success) throw validationError(result.error);
  return result.data;
}

export async function parseJsonBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    throw new ApiError("INVALID_JSON", "Request body must contain valid JSON.", 400);
  }
  return validate(value, schema);
}

export function validateRouteParams<T>(params: unknown, schema: ZodType<T>): T {
  return validate(params, schema);
}

export function validateQuery<T>(
  source: string | URL | URLSearchParams,
  schema: ZodType<T>,
): T {
  const params = source instanceof URLSearchParams
    ? source
    : new URL(source.toString(), "http://localhost").searchParams;
  const query: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    query[key] = values.length === 1 ? values[0] : values;
  }
  return validate(query, schema);
}
