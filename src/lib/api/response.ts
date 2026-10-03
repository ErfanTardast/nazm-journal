import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AppError } from "./errors";

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function fail(code: string, message: string, status = 400, details?: unknown) {
  return NextResponse.json(
    {
      error: {
        code,
        message,
        details: details ?? {}
      }
    },
    { status }
  );
}

export async function routeHandler(handler: () => Promise<Response>) {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof AppError) {
      return fail(error.code, error.message, error.status, error.details);
    }

    if (error instanceof ZodError) {
      return fail("VALIDATION_ERROR", "Request validation failed", 422, error.flatten());
    }

    console.error(error);
    return fail("INTERNAL_SERVER_ERROR", "Unexpected server error", 500);
  }
}

const JSON_CONTENT_TYPE = /^application\/json\s*(;|$)/i;

type ReadJsonOptions = {
  /**
   * Refuse a body larger than this many bytes with 413. Off unless given (other routes keep reading any size). It is
   * checked on the content-length header first, then while reading, so a chunked body or a false header cannot get past.
   */
  maxBytes?: number;
};

const tooLarge = () => new AppError("PAYLOAD_TOO_LARGE", "Request body is too large", 413);

/** The body as text. With a limit: refuse by content-length, then stop reading as soon as the limit is passed. */
async function readBodyText(request: Request, maxBytes: number | undefined) {
  if (maxBytes === undefined) return request.text().catch(() => "");

  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw tooLarge();
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw tooLarge();
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } catch (error) {
    if (error instanceof AppError) throw error;
    return ""; // a body that cannot be read reads as empty, like request.text() failing above
  }
}

/**
 * Parse a JSON request body. A body sent as any other content type is refused (415): a cross-site HTML form can only
 * send text/plain, urlencoded or multipart bodies, so this keeps forms on other sites from reaching the handlers
 * (e.g. signing a victim into an attacker's account). An empty body reads as {}; malformed JSON fails validation.
 * `options.maxBytes` adds a size limit (413) for public routes; without it nothing changes.
 */
export async function readJson<T>(request: Request, schema: { parse: (value: unknown) => T }, options: ReadJsonOptions = {}) {
  const text = await readBodyText(request, options.maxBytes);
  if (!text.trim()) return schema.parse({});
  if (!JSON_CONTENT_TYPE.test(request.headers.get("content-type") ?? "")) {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Send the request body as application/json", 415);
  }
  let body: unknown = {};
  try {
    body = JSON.parse(text);
  } catch {
    body = {};
  }
  return schema.parse(body);
}

