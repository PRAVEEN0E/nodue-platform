const BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1";

interface RequestOptions extends RequestInit {
  data?: unknown;
  /**
   * Skip the silent-refresh attempt on 401 and surface the error directly.
   * Used for entry points (e.g. /login) where no session context exists, so
   * an anonymous first visit does not produce refresh-attempt console noise.
   */
  skipRefresh?: boolean;
  /**
   * Internal chain marker: once a request has been retried after a refresh
   * attempt, a second 401 must surface as an error instead of triggering
   * another refresh. Bounds every call chain to at most one refresh attempt.
   */
  _refreshAttempted?: boolean;
}

export class ApiError extends Error {
  public code: string;
  public status: number;
  public details?: unknown;

  constructor(message: string, status: number, code: string = "API_ERROR", details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

let isRefreshing = false;
let failedQueue: Array<{
  resolve: (value?: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

const processQueue = (error: Error | null) => {
  failedQueue.forEach((promise) => {
    if (error) {
      promise.reject(error);
    } else {
      promise.resolve();
    }
  });
  failedQueue = [];
};

const refreshSession = async (): Promise<void> => {
  const refreshRes = await fetch(`${BASE_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });

  if (!refreshRes.ok) {
    throw new ApiError("Session expired", 401, "UNAUTHORIZED");
  }
};

export async function apiClient<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const url = `${BASE_URL}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

  const hasBody = !!options.data || !!options.body;

  const headers: Record<string, string> = {};

  if (options.headers) {
    const h = options.headers;
    if (h instanceof Headers) {
      h.forEach((v, k) => { headers[k] = v; });
    } else if (Array.isArray(h)) {
      h.forEach(([k, v]) => { headers[k] = v; });
    } else {
      Object.entries(h).forEach(([k, v]) => { if (v) headers[k] = String(v); });
    }
  }

  const isFormData = typeof FormData !== "undefined" && options.body instanceof FormData;
  if (hasBody && !headers["Content-Type"] && !isFormData) {
    headers["Content-Type"] = "application/json";
  }

  const config: RequestInit = {
    ...options,
    headers,
    credentials: "include",
    body: options.data ? JSON.stringify(options.data) : options.body,
  };

  try {
    const response = await fetch(url, config);

    // If 401 Unauthorized, attempt exactly one silent refresh per call chain,
    // then surface the error. Never refresh-then-retry-then-refresh again:
    // a retry that still 401s means the session is unrecoverable (revoked,
    // deactivated, or logged out) and must go to /login, not loop.
    if (
      response.status === 401 &&
      !endpoint.includes("/auth/login") &&
      !endpoint.includes("/auth/refresh") &&
      !options._refreshAttempted &&
      !options.skipRefresh
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(() => apiClient<T>(endpoint, { ...options, _refreshAttempted: true }));
      }

      isRefreshing = true;
      try {
        await refreshSession();
        processQueue(null);
        return apiClient<T>(endpoint, { ...options, _refreshAttempted: true });
      } catch (refreshErr) {
        processQueue(refreshErr as Error);
        throw refreshErr;
      } finally {
        isRefreshing = false;
      }
    }

    const text = await response.text();
    const data = text ? JSON.parse(text) : ({} as T);

    if (!response.ok) {
      throw new ApiError(
        data.error?.message || "An unexpected error occurred",
        response.status,
        data.error?.code || "API_ERROR",
        data.error?.details
      );
    }

    return data as T;
  } catch (err) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError((err as Error).message || "Network error", 500, "NETWORK_ERROR");
  }
}
