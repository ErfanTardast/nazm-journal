/**
 * Comma-separated list input (tags, mistakes) as trimmed, non-empty items. Splits on the ASCII comma and the
 * Persian comma "،" (U+060C), which a Persian keyboard types for ",".
 */
export function splitListInput(value: FormDataEntryValue | string | null | undefined): string[] {
  if (typeof value !== "string") return [];
  return value
    .split(/[,\u060c]/)
    .map((item) => item.trim())
    .filter(Boolean);
}
