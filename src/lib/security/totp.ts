import crypto from "node:crypto";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(length = 20) {
  const bytes = crypto.randomBytes(length);
  let output = "";
  for (const byte of bytes) {
    output += alphabet[byte % alphabet.length];
  }
  return output;
}

function base32Decode(secret: string) {
  const clean = secret.replace(/=+$/g, "").replace(/\s/g, "").toUpperCase();
  let bits = "";
  for (const char of clean) {
    const value = alphabet.indexOf(char);
    if (value === -1) {
      throw new Error("Invalid base32 secret");
    }
    bits += value.toString(2).padStart(5, "0");
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(Number.parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotpCode(secret: string, timestamp = Date.now()) {
  const counter = Math.floor(timestamp / 1000 / 30);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = crypto.createHmac("sha1", base32Decode(secret)).update(buffer).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    (((hmac[offset] & 0x7f) << 24) |
      ((hmac[offset + 1] & 0xff) << 16) |
      ((hmac[offset + 2] & 0xff) << 8) |
      (hmac[offset + 3] & 0xff)) %
    1_000_000;
  return code.toString().padStart(6, "0");
}

export function verifyTotpCode(secret: string, code: string) {
  if (!/^\d{6}$/.test(code)) {
    return false;
  }

  const now = Date.now();
  return [-30_000, 0, 30_000].some((offset) => generateTotpCode(secret, now + offset) === code);
}

export function makeOtpAuthUrl(email: string, secret: string) {
  const label = encodeURIComponent(`Nazm:${email}`);
  const issuer = encodeURIComponent("Nazm");
  return `otpauth://totp/${label}?secret=${secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=30`;
}

