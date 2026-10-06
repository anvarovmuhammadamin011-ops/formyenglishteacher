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

function buildUrl(path: string, query?: RequestOptions["query"]) {
  const qs = new URLSearchParams();
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
    }
  }
  const suffix = qs.toString();
  return `/api${path}${suffix ? `?${suffix}` : ""}`;
}

async function toError(res: Response): Promise<ApiError> {
  let shape: ApiErrorShape = { message: res.statusText || "Request failed", code: "HTTP_ERROR" };
  try {
    const json = (await res.json()) as { error?: ApiErrorShape };
    if (json?.error?.message) shape = json.error;
  } catch {
    /* non-JSON error body */
  }
  return new ApiError(res.status, shape);
}

async function raw(path: string, opts: RequestOptions): Promise<Response> {
  const { method = "GET", body, query, signal } = opts;
  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;
  if (body instanceof FormData) {
    payload = body;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  return fetch(buildUrl(path, query), { method, headers, body: payload, credentials: "include", signal });
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res = await raw(path, opts);

  // Transparently refresh an expired access token once (cookie-based refresh).
  if (res.status === 401 && opts.retry !== false) {
    const refresh = await fetch("/api/auth/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      credentials: "include",
    });
    if (refresh.ok) {
      res = await raw(path, { ...opts, retry: false });
    }
  }

  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  const json = (await res.json()) as { success: boolean; data: T };
  return json.data;
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
  return buildUrl(path);
}
