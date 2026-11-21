import type { PaginationResult } from "./pagination";

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  message: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasPreviousPage: boolean;
    hasNextPage: boolean;
  };
}

export interface ApiErrorEnvelope {
  success: false;
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
}

export function apiSuccess<T>(data: T, message = "Request completed successfully"): ApiSuccessEnvelope<T> {
  return { success: true, data, message };
}

export function apiSuccessResponse<T>(
  data: T,
  options: { message?: string; status?: number } = {},
): Response {
  return Response.json(
    apiSuccess(data, options.message),
    { status: options.status ?? 200, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export function apiPaginatedSuccess<T>(
  data: T[],
  pagination: PaginationResult,
  total: number,
  message = "Request completed successfully",
): ApiSuccessEnvelope<T[]> {
  const totalPages = total === 0 ? 0 : Math.ceil(total / pagination.limit);
  return {
    success: true,
    data,
    message,
    pagination: {
      page: pagination.page,
      limit: pagination.limit,
      total,
      totalPages,
      hasPreviousPage: pagination.page > 1,
      hasNextPage: pagination.page < totalPages,
    },
  };
}

export function apiPaginatedResponse<T>(
  data: T[],
  pagination: PaginationResult,
  total: number,
  options: { message?: string; status?: number } = {},
): Response {
  return Response.json(
    apiPaginatedSuccess(data, pagination, total, options.message),
    { status: options.status ?? 200, headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}

export function apiError(
  code: string,
  message: string,
  details?: unknown[],
): ApiErrorEnvelope {
  return {
    success: false,
    error: {
      code,
      message,
      ...(details && details.length > 0 ? { details } : {}),
    },
  };
}

export function apiErrorResponse(
  code: string,
  message: string,
  status: number,
  details?: unknown[],
): Response {
  return Response.json(apiError(code, message, details), {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
