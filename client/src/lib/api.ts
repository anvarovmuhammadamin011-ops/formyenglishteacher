import { handleLocal } from "@/lib/localApi";

export interface ApiErrorShape {
  message: string;
  code: string;
  details?: unknown;
}

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(status: number, shape: ApiErrorShape) {
    super(shape.message);
    this.name = "ApiError";
    this.status = status;
    this.code = shape.code;
    this.details = shape.details;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  retry?: boolean;
};

// The app is fully client-side: every "API" call is handled in-process by
// lib/localApi.ts against localStorage. API_BASE only prefixes absolute media
// URLs for the rare externally hosted asset.
export const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

function toQuery(query?: RequestOptions["query"]): Record<string, string> {
  const out: Record<string, string> = {};
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") out[k] = String(v);
    }
  }
  return out;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query } = opts;
  const res = await handleLocal({ method, path, query: toQuery(query), body });

  if (res.status >= 400) {
    throw new ApiError(
      res.status,
      res.error ?? { message: "Request failed", code: "HTTP_ERROR" },
    );
  }
  if (res.status === 204) return undefined as T;
  return res.data as T;
}

export const api = {
  get: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "POST", body }),
  patch: <T>(path: string, body?: unknown, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "PATCH", body }),
  del: <T>(path: string, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "DELETE" }),
  upload: <T>(path: string, form: FormData, opts?: Omit<RequestOptions, "method" | "body">) =>
    request<T>(path, { ...opts, method: "POST", body: form }),
};

export function downloadUrl(path: string) {
  return `${API_BASE}/api${path}`;
}

// Avatars are stored as data: URLs, external assets keep their origin.
export function mediaUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^(https?:)?\/\//i.test(path) || path.startsWith("data:")) return path;
  return `${API_BASE}${path}`;
}
