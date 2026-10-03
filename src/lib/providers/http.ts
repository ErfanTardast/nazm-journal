export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body?: string
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Fetches JSON with an AbortController timeout. Throws HttpError on non-2xx and
 * a plain Error (name "TimeoutError") when the request exceeds `timeoutMs`.
 */
export async function fetchJson<T = unknown>(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const { timeoutMs = 10_000, ...requestInit } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...requestInit, signal: controller.signal });
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new HttpError(`Request to ${url} failed with ${response.status}`, response.status, body);
    }
    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      const timeout = new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
      timeout.name = "TimeoutError";
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
