/**
 * Finds English text left on a screen that was rendered in Persian.
 *
 * It reads every text node plus the placeholder, aria-label, title and alt attributes, drops the tokens a Persian page
 * legitimately keeps in Latin letters (platform and unit names, symbols) and reports every string that still holds an
 * English word. The product's own name is not one of them: a Persian page writes it «نظم», so a Latin "Nazm" there is a leak. Pass `allowed` for the Latin text that a test itself feeds into the page (symbols, names a trader typed).
 */
const ALWAYS_ALLOWED: Array<string | RegExp> = [
  /MT5/g,
  /\bUSD\b/g,
  /\bUTC\b/g,
  /\bJSON\b/g,
  /\bCSV\b/g,
  /\bAI\b/g,
  /\bBTCUSDT\b/g,
  /\bEURUSD\b/g
];

const LATIN_WORD = /[A-Za-z]{2,}/;

function stripAllowed(text: string, allowed: Array<string | RegExp>) {
  let rest = text;
  for (const item of [...ALWAYS_ALLOWED, ...allowed]) {
    rest = typeof item === "string" ? rest.split(item).join(" ") : rest.replace(item, " ");
  }
  return rest;
}

/** Every string a visitor can read inside `root`. */
export function visibleStrings(root: HTMLElement): string[] {
  const found: string[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const parent = node.parentElement?.tagName;
    if (parent === "SCRIPT" || parent === "STYLE") continue;
    const text = (node.textContent ?? "").replace(/\s+/g, " ").trim();
    if (text) found.push(text);
  }
  for (const element of Array.from(root.querySelectorAll("[placeholder],[aria-label],[title],[alt]"))) {
    for (const attribute of ["placeholder", "aria-label", "title", "alt"]) {
      const value = element.getAttribute(attribute)?.trim();
      if (value) found.push(value);
    }
  }
  return found;
}

export function englishLeaks(root: HTMLElement, allowed: Array<string | RegExp> = []): string[] {
  return visibleStrings(root).filter((text) => LATIN_WORD.test(stripAllowed(text, allowed)));
}
