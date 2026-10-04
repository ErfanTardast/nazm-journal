// @vitest-environment node
import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// The documents a stranger reads first must describe the code that is here: the files they name exist, the npm scripts
// they tell people to run exist, and the lists they give (models, feature folders, library folders) are complete.
// docs/API.md has its own, stricter test (api-docs.test.ts), and .env.example has env-example.test.ts.

const root = process.cwd();

/** Documents that are published and read by people who have never seen the project. */
const PUBLIC_DOCS = ["docs/API.md", "docs/ARCHITECTURE.md", "docs/PRD.md", "docs/ROADMAP.md", "docs/RELEASE.md"];

/** Folders that are not part of the documented product, so the documents do not name them. */
const NOT_DOCUMENTED: string[] = [];

const read = (file: string) => readFileSync(join(root, file), "utf8").replace(/\r\n/g, "\n");
const folders = (dir: string) =>
  readdirSync(join(root, dir), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !NOT_DOCUMENTED.includes(name));

/** The text between `## heading` and the next `## ` heading. */
function section(text: string, heading: string) {
  return text.split(/^## /m).find((part) => part.startsWith(`${heading}\n`)) ?? "";
}

/** Whether the document names the folder `name` of `parent` in a code span: `name`, `name/` or a path that starts with it. */
function names(spans: string[], parent: string, name: string) {
  return spans.some((span) => span === name || span === `${name}/` || span.startsWith(`${parent}/${name}`));
}

/** Every `code span` in the document. */
const codeSpans = (text: string) => [...text.matchAll(/`([^`\n]+)`/g)].map((match) => match[1]);

const REPO_FOLDER = /^(src|prisma|scripts|tests|docs|public|\.github)\//;
const ROOT_FILE = /^[A-Za-z0-9._-]+\.(md|json|ts|mjs|yml|yaml|example)$|^Dockerfile$/;

/** The code spans that name a file or folder of the repository (a path with a placeholder or a glob is not one). */
function namedPaths(text: string) {
  return codeSpans(text)
    .filter((span) => !/[\s*<>{}$:]/.test(span))
    .filter((span) => REPO_FOLDER.test(span) || ROOT_FILE.test(span));
}

/** The names of all files under the folders the documents describe, for a bare file name such as `route.ts`. */
function fileNames(dir: string): string[] {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? fileNames(`${dir}/${entry.name}`) : [entry.name]
  );
}
const KNOWN_FILE_NAMES = new Set(["src", "prisma", "scripts", "tests", "docs", "public", ".github"].flatMap((dir) => fileNames(dir)));

/** A path exists when it is there, or, for a bare file name, when a file of that name is somewhere in the repository. */
function exists(path: string) {
  return existsSync(join(root, path.replace(/\/$/, ""))) || (!path.includes("/") && KNOWN_FILE_NAMES.has(path));
}

describe("the published documents", () => {
  it("recognises a repository path in a code span (the check below can fail)", () => {
    expect(namedPaths("see `src/lib/env.ts`, `package.json` and `Dockerfile`")).toEqual(["src/lib/env.ts", "package.json", "Dockerfile"]);
    expect(namedPaths("`/api/trades` `src/app/[locale]` `docs/*.md` `<root>/src` `npm run test`")).toEqual(["src/app/[locale]"]);
    expect(exists("src/lib/does-not-exist.ts")).toBe(false);
    expect(exists("route.ts")).toBe(true);
    expect(exists("no-such-file.ts")).toBe(false);
  });

  for (const file of PUBLIC_DOCS) {
    describe(file, () => {
      const text = read(file);

      it("names only files and folders that exist", () => {
        const missing = namedPaths(text).filter((path) => !exists(path));
        expect(missing).toEqual([]);
      });

      it("tells people to run only npm scripts that exist", () => {
        const scripts = Object.keys(JSON.parse(read("package.json")).scripts as Record<string, string>);
        const unknown = [...text.matchAll(/npm run ([a-z0-9:-]+)/g)].map((match) => match[1]).filter((name) => !scripts.includes(name));
        expect(unknown).toEqual([]);
      });

      it("keeps the conference wording out", () => {
        expect(text).not.toMatch(/conference/i);
      });

      it("does not describe the folders it leaves out", () => {
        for (const name of NOT_DOCUMENTED) expect(text.toLowerCase()).not.toContain(name.replace("_", "-"));
      });
    });
  }
});

describe("docs/ARCHITECTURE.md", () => {
  const text = read("docs/ARCHITECTURE.md");

  it("names only database models that the schema has", () => {
    const schema = read("prisma/schema.prisma");
    const models = new Set([...schema.matchAll(/^model (\w+) \{/gm)].map((match) => match[1]));
    expect(models.has("User")).toBe(true);
    expect(models.has("WeeklyReview")).toBe(false); // dropped by migration 20260620120000_drop_weekly_review
    const named = codeSpans(section(text, "Data")).filter((span) => /^[A-Z][A-Za-z]+$/.test(span));
    expect(named.length).toBeGreaterThan(10);
    expect(named.filter((name) => !models.has(name))).toEqual([]);
  });

  it("names every database model the schema has, so the list cannot fall behind it", () => {
    const schema = read("prisma/schema.prisma");
    const models = [...schema.matchAll(/^model (\w+) \{/gm)].map((match) => match[1]);
    expect(models.length).toBeGreaterThan(40);
    const named = new Set(codeSpans(section(text, "Data")));
    expect(models.filter((name) => !named.has(name))).toEqual([]);
  });

  it("does not use 'plans' for pricing tiers where the product means trade plans", () => {
    expect(section(text, "Data")).not.toMatch(/First run and plans/);
  });

  it("does not say that mt5-report.ts merges ladder legs: it tags them with a shared key", () => {
    expect(text).not.toMatch(/merges the legs/);
    const converter = read("src/lib/import/mt5-report.ts");
    expect(converter).toContain("ladderKey");
    expect(section(text, "Importing trades")).toMatch(/tags the legs[^.]*shared key/);
  });

  it("does not say that a dropped model still exists", () => {
    expect(text).not.toContain("WeeklyReview");
  });

  it("names every feature folder under src/features", () => {
    const listed = folders("src/features");
    expect(listed.length).toBeGreaterThan(15);
    expect(listed.filter((name) => !names(codeSpans(text), "src/features", name))).toEqual([]);
  });

  it("names every library folder under src/lib", () => {
    const listed = folders("src/lib");
    expect(listed.length).toBeGreaterThan(15);
    expect(listed.filter((name) => !names(codeSpans(text), "src/lib", name))).toEqual([]);
  });

  it("covers the parts a developer needs: request flow, sessions, rate limits, providers, languages, payments, migrations", () => {
    for (const topic of [
      "src/app",
      "src/features",
      "prisma",
      "tests",
      "zod",
      "service",
      "Prisma",
      "Redis",
      "memory",
      "nazm_session",
      "RTL",
      "src/lib/import/mt5-report.ts",
      "NEXT_PUBLIC_PAYMENTS_ENABLED",
      "prisma migrate deploy"
    ]) {
      expect(text, topic).toContain(topic);
    }
  });
});

describe("docs/PRD.md", () => {
  const text = read("docs/PRD.md");

  it("describes today's product: import, journal, plans, risk, reviews, the coach, first run, sample data, two languages", () => {
    for (const topic of ["MT5", "CSV", "journal", "plan", "strategy", "risk", "review", "coach", "first-run", "sample data", "Persian", "English"]) {
      expect(text.toLowerCase(), topic).toContain(topic.toLowerCase());
    }
  });

  it("names the three markets the code accepts", () => {
    expect(read("src/lib/validation/trading.ts")).toContain('marketSchema = z.enum(["crypto", "forex", "stocks"])');
    for (const market of ["crypto", "forex", "stocks"]) expect(text.toLowerCase(), market).toContain(market);
  });

  it("says that payments exist and are off by default", () => {
    expect(text).toMatch(/payments[^\n]*off by default/i);
    expect(text).toContain("NEXT_PUBLIC_PAYMENTS_ENABLED");
  });

  it("says what Nazm will not do", () => {
    expect(text).toMatch(/order/i);
    expect(text).toMatch(/broker/i);
    expect(text).toMatch(/signal/i);
    expect(text).toMatch(/advice/i);
  });

  it("carries the one-line description in both languages", () => {
    expect(text).toContain("- **One-liner (EN):** Plan, journal, review, and improve your trading discipline.");
    expect(text).toContain("- **One-liner (FA):**");
  });
});

describe("docs/ROADMAP.md", () => {
  const text = read("docs/ROADMAP.md");

  it("has no dates and says it is not a schedule or a promise", () => {
    expect(text).not.toMatch(/\b(20\d\d|Q[1-4])\b/);
    expect(text).not.toMatch(/\b(soon|this year|next year|next month|ETA)\b/i);
    expect(text).toMatch(/not a (schedule|promise|commitment)/i);
  });

  it("no longer lists pricing as the next step", () => {
    expect(text).not.toMatch(/pricing/i);
  });

  it("lists what is shipped, what is next and what is later, in that order", () => {
    const headings = [...text.matchAll(/^## (.+)$/gm)].map((match) => match[1]);
    expect(headings.slice(0, 3)).toEqual(["Shipped", "Next", "Later"]);
  });

  it("puts performance analytics and an action-oriented dashboard next", () => {
    const next = section(text, "Next").toLowerCase();
    expect(next).toContain("performance analytics");
    expect(next).toContain("dashboard");
  });

  it("puts forgot-password by e-mail, strategy versioning, more alert types and real backtesting later", () => {
    const later = section(text, "Later").toLowerCase();
    for (const topic of ["forgot-password", "e-mail", "strategy versioning", "alert types", "backtesting"]) {
      expect(later, topic).toContain(topic);
    }
  });
});

describe("docs/RELEASE.md", () => {
  const text = read("docs/RELEASE.md");

  it("is about releasing Nazm, not about an app store", () => {
    expect(text.startsWith("# Releasing Nazm\n")).toBe(true);
    expect(text).not.toMatch(/\b(TWA|Trusted Web Activity|bubblewrap|Play Console|Play Store|assetlinks|\.aab|store listing|store metadata)\b/i);
    expect(text).not.toMatch(/release candidate/i);
  });

  it("tells a maintainer how a version is cut: changelog, package version, the checks CI runs, a tag, a GitHub release", () => {
    for (const step of ["CHANGELOG.md", "package.json", "vX.Y.Z", "git tag", "GitHub release"]) expect(text, step).toContain(step);
    // The checks are the steps CI runs, so the two cannot drift apart.
    const ci = read(".github/workflows/ci.yml");
    const steps = [...ci.matchAll(/run: (npm run [a-z:-]+)/g)].map((match) => match[1]);
    expect(steps).toEqual(["npm run typecheck", "npm run lint", "npm run test", "npm run build"]);
    for (const step of steps) expect(text, step).toContain(step);
  });

  it("keeps the version in package.json and the newest changelog section in step, as the document tells a maintainer to", () => {
    const newest = /^## \[(\d+\.\d+\.\d+)\]/m.exec(read("CHANGELOG.md"))?.[1];
    expect(newest).toBe(JSON.parse(read("package.json")).version);
    expect(JSON.parse(read("package-lock.json")).version).toBe(newest);
  });

  it("tells a self-hoster how to upgrade: back up, pull, rebuild, migrations on start, check", () => {
    for (const step of ["back up", "git pull", "docker", "prisma migrate deploy", "/api/health"]) {
      expect(text.toLowerCase(), step).toContain(step.toLowerCase());
    }
    // The entry point really applies migrations, and the build arguments the document warns about really exist.
    expect(read("scripts/docker-entrypoint.sh")).toContain("npm run prisma:deploy");
    expect(JSON.parse(read("package.json")).scripts["prisma:deploy"]).toBe("prisma migrate deploy");
    const buildArgs = [...read("Dockerfile").matchAll(/^ARG ([A-Z_]+)=/gm)].map((match) => match[1]);
    expect(buildArgs).toContain("NEXT_PUBLIC_PAYMENTS_ENABLED");
    for (const name of buildArgs) expect(text, name).toContain(name);
  });

  it("keeps the PWA facts: manifest, icons that exist, service worker, offline page", () => {
    expect(text).toContain("/manifest.webmanifest");
    expect(text).toContain("/offline");
    expect(text).toContain("public/sw.js");
    expect(text).toContain("public/icons");
    expect(existsSync(join(root, "src/app/offline/page.tsx"))).toBe(true);
    for (const icon of ["icon-192.png", "icon-256.png", "icon-384.png", "icon-512.png", "icon-512-maskable.png"]) {
      expect(existsSync(join(root, "public/icons", icon)), icon).toBe(true);
    }
  });
});
