import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RULES_PATH = join(ROOT, "docs/HKOS_RULES.md");
const LEDGER_PATH = join(ROOT, "docs/ISSUE5_RULE_COVERAGE.md");
const TESTS_PATH = join(ROOT, "tests");

const IDENTIFIER_PATTERN = /\b(?:RULE-[A-Z]+(?:-[A-Z]+)*-?\d+|RECON-\d+)\b/g;

function numericSuffix(identifier: string): { readonly prefix: string; readonly number: number } {
  const match = /^(.*?)(\d+)$/.exec(identifier);
  if (match === null || match[1] === undefined || match[2] === undefined) {
    throw new Error(`Contract identifier has no numeric suffix: ${identifier}`);
  }
  return { prefix: match[1], number: Number(match[2]) };
}

function contractIdentifiers(source: string): readonly string[] {
  const identifiers = new Set(source.match(IDENTIFIER_PATTERN) ?? []);

  for (const match of source.matchAll(/`([^`\n]*\d+)`\s*…\s*`([^`\n]*\d+)`/g)) {
    const startId = match[1];
    const endId = match[2];
    if (startId === undefined || endId === undefined) {
      continue;
    }
    if (!startId.startsWith("RULE-") && !startId.startsWith("RECON-")) {
      continue;
    }
    const start = numericSuffix(startId);
    const end = numericSuffix(endId);
    if (start.prefix !== end.prefix || end.number < start.number) {
      throw new Error(`Invalid contract identifier range ${startId} … ${endId}`);
    }
    for (let number = start.number; number <= end.number; number += 1) {
      identifiers.add(`${start.prefix}${String(number)}`);
    }
  }

  return [...identifiers].sort((left, right) =>
    left.localeCompare(right, "en", { numeric: true }),
  );
}

function collectTestSources(directory: string): string {
  const chunks: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      chunks.push(collectTestSources(path));
    } else if (entry.isFile() && entry.name.endsWith(".test.ts")) {
      chunks.push(readFileSync(path, "utf8"));
    }
  }
  return chunks.join("\n");
}

describe("HKOS rules-contract coverage ledger", () => {
  it("enumerates all 84 RULE-* and RECON-* identifiers from docs/HKOS_RULES.md", () => {
    const rules = readFileSync(RULES_PATH, "utf8");
    const identifiers = contractIdentifiers(rules);

    expect(identifiers).toHaveLength(84);
    expect(new Set(identifiers).size).toBe(84);
  });

  it("maps every contract identifier into the committed Issue #5 coverage ledger", () => {
    const rules = readFileSync(RULES_PATH, "utf8");
    const ledger = readFileSync(LEDGER_PATH, "utf8");
    const identifiers = contractIdentifiers(rules);
    const ledgerIdentifiers = [...new Set(ledger.match(IDENTIFIER_PATTERN) ?? [])].sort(
      (left, right) => left.localeCompare(right, "en", { numeric: true }),
    );

    expect(ledgerIdentifiers).toEqual(identifiers);
  });

  it("requires every contract identifier to appear in executable test source", () => {
    const rules = readFileSync(RULES_PATH, "utf8");
    const testSources = collectTestSources(TESTS_PATH);
    const identifiers = contractIdentifiers(rules);
    const missing = identifiers.filter((identifier) => !testSources.includes(identifier));

    expect(missing, `Missing executable coverage markers: ${missing.join(", ")}`).toEqual([]);
  });
});
