/**
 * Minimal fetch wrapper for calling the simulationAPI backend.
 *
 * Auth is BFF-style: the session lives in an httpOnly `be_session` cookie
 * scoped to the parent domain, so every request is sent with
 * `credentials: "include"` and the browser never handles a token. The API
 * origin comes from VITE_API_BASE_URL; when unset, requests are same-origin
 * relative (which targets the gateway, where authed data routes won't work).
 */

export class ApiError extends Error {
  constructor(
    /** HTTP status, or 0 when the request never got a response. */
    readonly status: number,
    /** Parsed JSON body, raw text, or null when there was none. */
    readonly body: unknown,
    message?: string,
  ) {
    super(message ?? `request failed with status ${status}`);
    this.name = "ApiError";
  }
}

// 401 gets its own class so callers can catch it and send the user to
// /auth/login — an app-origin relative path; the api.* host can't serve it.
export class UnauthorizedError extends ApiError {
  constructor(body: unknown) {
    super(401, body, "not authenticated");
    this.name = "UnauthorizedError";
  }
}

export interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  /** Override the API origin; pass "" for same-origin gateway routes like /auth/me. */
  baseUrl?: string;
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
  opts: RequestOptions = {},
): Promise<T> {
  // Read the env at call time so tests can stub it per-case.
  const base = opts.baseUrl ?? import.meta.env.VITE_API_BASE_URL ?? "";

  let url = `${base}${path}`;
  if (opts.query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(opts.query)) {
      if (value !== undefined) {
        params.set(key, String(value));
      }
    }
    const qs = params.toString();
    if (qs) {
      url += `?${qs}`;
    }
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  const init: RequestInit = {
    method,
    headers,
    credentials: "include",
    signal: opts.signal,
  };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err) {
    if (err instanceof TypeError) {
      // Network failure or CORS rejection — no response to report.
      throw new ApiError(0, null, `network error: ${err.message}`);
    }
    throw err; // AbortError and friends pass through untouched
  }

  let responseBody: unknown;
  if (response.status !== 204) {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      responseBody = await response.json();
    } else {
      const text = await response.text();
      responseBody = text === "" ? null : text;
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      throw new UnauthorizedError(responseBody ?? null);
    }
    throw new ApiError(response.status, responseBody ?? null);
  }

  return responseBody as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) =>
    request<T>("GET", path, undefined, opts),
  post: <T>(path: string, body: unknown, opts?: RequestOptions) =>
    request<T>("POST", path, body, opts),
  put: <T>(path: string, body: unknown, opts?: RequestOptions) =>
    request<T>("PUT", path, body, opts),
  del: (path: string, opts?: RequestOptions) =>
    request<void>("DELETE", path, undefined, opts),
};
