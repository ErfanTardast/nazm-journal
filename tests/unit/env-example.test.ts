// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// .env.example is the one place a person who runs Nazm learns what can be set ("Every setting is described in
// .env.example"). So it must list every variable the code reads, list nothing the code does not read, give each
// variable the value the code uses when it is missing, and be honest about what does nothing yet.

const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), "utf8").replace(/\r\n/g, "\n");
const example = read(".env.example");

/** Variables the code reads that are not settings for a person who runs the server. */
const INTERNAL = [
  "NEXT_PHASE", // set by Next.js while it builds
  "DEMO_SEED" // set by the container's entry point from the build's demo flag
];

function walk(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? walk(`${dir}/${entry.name}`) : [`${dir}/${entry.name}`]
  );
}

const sourceFiles = walk("src").filter((file) => /\.(ts|tsx)$/.test(file));
const sourceText = sourceFiles.map(read).join("\n");

/** Every variable the code reads: process.env.NAME, and env.NAME where a helper takes the environment as an argument. */
const readByCode = new Set([...sourceText.matchAll(/\b(?:process\.env|env)\.([A-Z][A-Z0-9_]+)\b/g)].map((match) => match[1]));

/** The variables .env.example sets, with the value and the comment lines directly above each one. */
function parseExample(text: string) {
  const entries = new Map<string, { value: string; comment: string }>();
  let comment: string[] = [];
  for (const line of text.split("\n")) {
    const variable = /^([A-Z][A-Z0-9_]+)=(.*)$/.exec(line);
    if (variable) {
      entries.set(variable[1], { value: variable[2].replace(/^"(.*)"$/, "$1"), comment: comment.join("\n") });
      comment = [];
    } else if (line.startsWith("#")) {
      comment.push(line);
    } else {
      comment = [];
    }
  }
  return entries;
}

const entries = parseExample(example);

describe(".env.example", () => {
  it("reads the example the way the checks below need (the checks can fail)", () => {
    const parsed = parseExample('# one\n# two\nA_B="x"\n\n# three\nCC=1\nnot a variable\n');
    expect(parsed.get("A_B")).toEqual({ value: "x", comment: "# one\n# two" });
    expect(parsed.get("CC")).toEqual({ value: "1", comment: "# three" });
    expect(readByCode.has("SESSION_SECRET")).toBe(true);
    expect(readByCode.has("ADMIN_EMAILS")).toBe(true); // read through a helper's `env` argument
    expect(entries.size).toBeGreaterThan(30);
  });

  it("lists every variable the code reads", () => {
    const missing = [...readByCode].filter((name) => !entries.has(name) && !INTERNAL.includes(name)).sort();
    expect(missing).toEqual([]);
  });

  it("lists only variables the code reads", () => {
    const unused = [...entries.keys()].filter((name) => !sourceText.includes(name)).sort();
    expect(unused).toEqual([]);
  });

  it("gives each variable the value the code uses when it is missing", () => {
    // `process.env.NAME ?? "default"` treats an empty string as a value, so an example that said "" would break the
    // setting for someone who copies the file as it is.
    const defaults = [...sourceText.matchAll(/process\.env\.([A-Z][A-Z0-9_]+) \?\? "([^"]*)"/g)];
    const checked = defaults.filter((match) => entries.has(match[1]) && match[2] !== "").map((match) => [match[1], match[2]]);
    expect(checked.map(([name]) => name)).toEqual(expect.arrayContaining(["APP_URL", "AI_PROVIDER", "OPENAI_MODEL", "OPENAI_BASE_URL"]));
    for (const [name, value] of checked) expect(entries.get(name)?.value, name).toBe(value);
  });

  it("describes the OpenAI-compatible server address in one line", () => {
    const entry = entries.get("OPENAI_BASE_URL");
    expect(entry?.value).toBe("https://api.openai.com/v1");
    expect(entry?.comment.split("\n")).toHaveLength(1);
  });

  it("speaks for any server, not for one hosted trial", () => {
    expect(example).not.toMatch(/\b(trial|owner|hosted)\b/i);
    expect(example).toContain("# Admin bootstrap:");
    expect(example).toContain("for an invite-only server");
  });

  it("keeps what the ADMIN_EMAILS instructions say: register first, sign in, list the address, sign in again, revoke", () => {
    const comment = entries.get("ADMIN_EMAILS")?.comment ?? "";
    for (const step of ["1. register", "2. sign in", "3. set ADMIN_EMAILS", "4. sign in again", "UserRole", "never grants"]) {
      expect(comment, step).toContain(step);
    }
  });

  it("puts the billing variables under a heading that says they are optional and tied to the payments flag", () => {
    const names = ["BILLING_CARD_NUMBER", "BILLING_CARD_HOLDER", "BILLING_BANK_NAME", "BILLING_USDT_TRC20_ADDRESS"];
    for (const name of names) expect(entries.has(name), name).toBe(true);
    const heading = example.slice(0, example.indexOf("BILLING_CARD_NUMBER="));
    const block = heading.slice(heading.lastIndexOf("\n\n") + 2);
    expect(block).toMatch(/optional/i);
    expect(block).toContain("NEXT_PUBLIC_PAYMENTS_ENABLED=true");
    expect(block).toMatch(/build/i);
  });

  it("marks the settings that do nothing yet as not implemented, and the code agrees", () => {
    for (const name of ["EMAIL_PROVIDER", "EMAIL_FROM", "MARKET_DATA_PROVIDER"]) {
      expect(entries.get(name)?.comment, name).toMatch(/not implemented yet/i);
    }
    // No mail is sent: the e-mail channel only logs, and nothing but the system options answer reads the two provider names.
    expect(read("src/lib/services/notifications/email.ts")).toContain("no SMTP transport is wired yet");
    for (const name of ["EMAIL_PROVIDER", "MARKET_DATA_PROVIDER"]) {
      const readers = sourceFiles.filter((file) => read(file).includes(name));
      expect(readers, name).toEqual(["src/lib/services/system-options.ts"]);
    }
  });

  it("keeps the secrets empty and the session secret a placeholder", () => {
    for (const name of ["OPENAI_API_KEY", "NEWS_API_KEY", "TELEGRAM_BOT_TOKEN", "DISCORD_WEBHOOK_URL", "REGISTRATION_INVITE_CODE", "ADMIN_EMAILS"]) {
      expect(entries.get(name)?.value, name).toBe("");
    }
    expect(entries.get("SESSION_SECRET")?.value).toBe("replace-with-at-least-32-random-characters");
  });
});
