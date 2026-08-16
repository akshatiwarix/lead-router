/**
 * The real engine boundary.
 *
 * `eslint.config.mjs` carries a `no-restricted-imports` rule for this
 * directory, but a lint rule is a list of things somebody thought of, and it is
 * disabled by a comment. This test reads the source off disk and allows exactly
 * two things: `zod`, and relative imports inside the package. Anything else
 * fails, including whatever gets invented after this file was written.
 *
 * The reason it matters is not tidiness. An analyser that cannot reach a
 * network client, a database or a clock cannot emit a finding that is not a
 * consequence of its arguments — which is what entitles the UI to call the
 * output proofs.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ENGINE_DIR = join(process.cwd(), "lib", "routing");

const sourceFiles = readdirSync(ENGINE_DIR).filter(
  (name) => name.endsWith(".ts") && !name.endsWith(".test.ts"),
);

const IMPORT_PATTERN = /(?:^|\n)\s*import\s+(?:type\s+)?[\s\S]*?from\s+["']([^"']+)["']/g;

function importsOf(source: string): string[] {
  return [...source.matchAll(IMPORT_PATTERN)].map((match) => match[1] ?? "");
}

/**
 * Comments are stripped before the global check, because the modules here
 * explain *why* they avoid a given global and the explanation names it. A test
 * that cannot tell `btoa` in a comment from `btoa` in a call would punish the
 * documentation and reward silence.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("the engine is dependency-free and framework-free", () => {
  it("has source files to check", () => {
    // A glob that silently matches nothing would make every assertion below
    // pass while checking nothing at all.
    expect(sourceFiles.length).toBeGreaterThan(8);
  });

  it("imports only zod and its own relative modules", () => {
    for (const file of sourceFiles) {
      const source = readFileSync(join(ENGINE_DIR, file), "utf8");
      for (const specifier of importsOf(source)) {
        const allowed = specifier === "zod" || specifier.startsWith("./");
        expect(allowed, `${file} imports "${specifier}"`).toBe(true);
      }
    }
  });

  it("reaches for no host global", () => {
    // Not an exhaustive list of globals — an exhaustive list is impossible.
    // These are the ones whose presence would mean the engine had grown a way
    // to observe something that was not passed to it as an argument.
    const forbidden = [
      "window",
      "document",
      "localStorage",
      "sessionStorage",
      "fetch(",
      "XMLHttpRequest",
      "process.env",
      "require(",
      "globalThis",
      "btoa",
      "atob",
    ];
    for (const file of sourceFiles) {
      const source = code(readFileSync(join(ENGINE_DIR, file), "utf8"));
      for (const global of forbidden) {
        expect(source.includes(global), `${file} mentions ${global}`).toBe(false);
      }
    }
  });

  it("cannot read a clock", () => {
    // There is no clock in this repo at all — Day 029 owns SLAs and timers. A
    // date in the engine would be the first step back toward them, and it would
    // also make every finding non-reproducible.
    for (const file of sourceFiles) {
      const source = code(readFileSync(join(ENGINE_DIR, file), "utf8"));
      expect(source.includes("Date.now"), `${file} reads a clock`).toBe(false);
      expect(source.includes("new Date"), `${file} reads a clock`).toBe(false);
    }
  });

  it("cannot roll a die", () => {
    // Selection is stateful, which is bad enough and is confined to one module.
    // Randomness would make it unreproducible on top of that, and no strategy
    // here needs it.
    for (const file of sourceFiles) {
      const source = code(readFileSync(join(ENGINE_DIR, file), "utf8"));
      expect(source.includes("Math.random"), `${file} uses randomness`).toBe(false);
    }
  });
});
