export interface ApiPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}

export interface ApiSuccessEnvelope<T> {
  success: true;
  data: T;
  message: string;
  pagination?: ApiPagination;
}

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown[],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ApiClientError";
  }
}

export interface ApiRequestOptions extends Omit<RequestInit, "headers"> {
  headers?: HeadersInit;
  fetcher?: typeof fetch;
}

export interface ApiPostOptions extends Omit<ApiRequestOptions, "method" | "body"> {
  idempotencyKey?: string;
}

function assertSameOriginApiPath(path: string): void {
  try {
    const parsed = new URL(path, "https://nexus.invalid");
    if (
      !path.startsWith("/") || path.startsWith("//") ||
      parsed.origin !== "https://nexus.invalid" ||
      !(parsed.pathname === "/api" || parsed.pathname.startsWith("/api/"))
    ) {
      throw new Error("invalid path");
    }
  } catch {
    throw new TypeError("API path must be a same-origin /api URL");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function invalidResponse(status: number): ApiClientError {
  return new ApiClientError(status, "INVALID_API_RESPONSE", "The server returned an invalid response.");
}

function toHeaderRecord(input?: HeadersInit): Record<string, string> {
  const headers = new Headers(input);
  const result: Record<string, string> = {};
  headers.forEach((value, name) => { result[name] = value; });
  return result;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<ApiSuccessEnvelope<T>> {
  assertSameOriginApiPath(path);
  const { fetcher = fetch, headers: suppliedHeaders, ...init } = options;
  const headers = toHeaderRecord(suppliedHeaders);
  if (init.body !== undefined && !Object.keys(headers).some((name) => name.toLowerCase() === "content-type")) {
    headers["content-type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetcher(path, {
      ...init,
      method: init.method ?? "GET",
      headers,
      credentials: "same-origin",
      cache: "no-store",
      redirect: "error",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiClientError(0, "NETWORK_ERROR", "Unable to reach the server.", undefined, { cause: error });
  }

  const payload: unknown = await response.json().catch(() => null);
  if (!isRecord(payload)) throw invalidResponse(response.status);

  if (payload.success === false) {
    if (!isRecord(payload.error) || typeof payload.error.code !== "string" || typeof payload.error.message !== "string") {
      throw invalidResponse(response.status);
    }
    throw new ApiClientError(
      response.status,
      payload.error.code,
      payload.error.message,
      Array.isArray(payload.error.details) ? payload.error.details : undefined,
    );
  }

  if (
    !response.ok || payload.success !== true || !("data" in payload) ||
    typeof payload.message !== "string"
  ) {
    throw invalidResponse(response.status);
  }

  if (payload.pagination !== undefined) {
    const pagination = payload.pagination;
    if (!isRecord(pagination) ||
      typeof pagination.page !== "number" || typeof pagination.limit !== "number" ||
      typeof pagination.total !== "number" || typeof pagination.totalPages !== "number" ||
      typeof pagination.hasPreviousPage !== "boolean" || typeof pagination.hasNextPage !== "boolean") {
      throw invalidResponse(response.status);
    }
  }

  return payload as unknown as ApiSuccessEnvelope<T>;
}

export function apiGet<T>(path: string, options: Omit<ApiRequestOptions, "method" | "body"> = {}) {
  return apiRequest<T>(path, { ...options, method: "GET" });
}

export function apiPost<T, TBody>(path: string, body: TBody, options: ApiPostOptions = {}) {
  const headers = toHeaderRecord(options.headers);
  if (options.idempotencyKey !== undefined) headers["Idempotency-Key"] = options.idempotencyKey;
  const { idempotencyKey: _idempotencyKey, ...requestOptions } = options;
  return apiRequest<T>(path, {
    ...requestOptions,
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
