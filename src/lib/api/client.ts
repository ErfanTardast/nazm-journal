type ApiSuccess<T> = {
  data: T;
};

type ApiFailure = {
  error: {
    code: string;
    message: string;
    details: unknown;
  };
};

export class ApiClientError extends Error {
  status: number;
  code: string;
  details: unknown;

  constructor(message: string, status: number, code = "REQUEST_FAILED", details: unknown = {}) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isAuthError(error: unknown) {
  return error instanceof ApiClientError && error.status === 401;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {})
    }
  });
  const payload = (await response.json().catch(() => ({}))) as ApiSuccess<T> | ApiFailure;

  if (!response.ok || "error" in payload) {
    const apiError = "error" in payload ? payload.error : null;
    throw new ApiClientError(apiError?.message ?? "Request failed", response.status, apiError?.code, apiError?.details);
  }

  return payload.data;
}
