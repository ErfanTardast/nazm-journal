import { visibleStrings } from "./english-leaks";

/**
 * Finds Latin (ASCII) digits left on a screen that was rendered in Persian, where every number is written with
 * Persian digits. It reads what `visibleStrings` reads (text and the placeholder, aria-label, title and alt
 * attributes), drops the text a Persian page legitimately keeps with Latin digits ("MT5", and what the test feeds in:
 * symbols like US30) and returns every string that still holds one.
 */
const ALWAYS_ALLOWED: Array<string | RegExp> = [/MT5/g];

const ASCII_DIGIT = /[0-9]/;

function stripAllowed(text: string, allowed: Array<string | RegExp>) {
  let rest = text;
  for (const item of [...ALWAYS_ALLOWED, ...allowed]) {
    rest = typeof item === "string" ? rest.split(item).join(" ") : rest.replace(item, " ");
  }
  return rest;
}

export function latinDigitStrings(root: HTMLElement, allowed: Array<string | RegExp> = []): string[] {
  return visibleStrings(root).filter((text) => ASCII_DIGIT.test(stripAllowed(text, allowed)));
}
