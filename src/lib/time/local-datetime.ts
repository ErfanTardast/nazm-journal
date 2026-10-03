const pad = (value: number) => String(value).padStart(2, "0");

/**
 * The value a datetime-local input expects (YYYY-MM-DDTHH:mm) for a moment, read in the browser's own time zone.
 * toISOString() would give UTC and put a Tehran user's "now" hours away from their wall clock.
 */
export function toLocalDateTimeValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * A datetime-local value carries no zone, so the server would read it in its own zone (UTC). Turn it into the
 * explicit instant the trader meant: empty stays null, unparseable text is passed through for the API to reject.
 */
export function localDateTimeToIso(value: FormDataEntryValue | null): string | null {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return null;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? text : date.toISOString();
}
