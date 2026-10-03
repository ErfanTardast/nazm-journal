import crypto from "node:crypto";
import { getSessionSecret } from "@/lib/env";

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function hmac(value: string) {
  return crypto.createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

export function signCookieValue(value: string) {
  return `${value}.${hmac(value)}`;
}

export function verifySignedCookieValue(signedValue?: string) {
  if (!signedValue) {
    return null;
  }

  const separator = signedValue.lastIndexOf(".");
  if (separator === -1) {
    return null;
  }

  const value = signedValue.slice(0, separator);
  const signature = signedValue.slice(separator + 1);
  const expected = hmac(value);

  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !crypto.timingSafeEqual(left, right)) {
    return null;
  }

  return value;
}

