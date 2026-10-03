const unavailableCodes = new Set(["P1001", "P1002", "P1017", "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "ETIMEDOUT"]);

export function isDatabaseUnavailableError(error: unknown) {
  if (!error || typeof error !== "object") {
    return false;
  }

  const record = error as { code?: unknown; cause?: unknown; message?: unknown };
  if (typeof record.code === "string" && unavailableCodes.has(record.code)) {
    return true;
  }

  if (record.cause && isDatabaseUnavailableError(record.cause)) {
    return true;
  }

  const message = typeof record.message === "string" ? record.message.toLowerCase() : "";
  return [
    "can't reach database server",
    "cannot reach database server",
    "database server",
    "database is not reachable",
    "connect econnrefused",
    "connection refused",
    "connection terminated",
    "server closed the connection",
    "connection timeout",
    "timed out fetching a new connection"
  ].some((pattern) => message.includes(pattern));
}

export function databaseUnavailableMessage() {
  return [
    "Database is not reachable.",
    "PostgreSQL is not running or DATABASE_URL is pointing at the wrong host/port.",
    "Check .env and DATABASE_URL, start PostgreSQL or Docker, then run migration and seed again."
  ].join(" ");
}

/** A unique constraint rejected the write (Prisma P2002). */
export function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "P2002");
}
