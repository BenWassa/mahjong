import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Makes the test index in docs/HKOS_RULES.md §13 self-checking.
 *
 * The contract assigns a stable identifier to every rule. This reads them back
 * out and fails if any is not named by at least one test, so a rule cannot be
 * written down and then quietly left unverified.
 */

const ID_PATTERN = /\b(RULE-[A-Z]+|RECON)-([A-Z]?\d+(?:\/[A-Z]?\d+)*)\b/g;

/** Expands both `RULE-PAY-1` and the `RULE-FAAN-G10/G11` shorthand. */
function extractIds(text: string): Set<string> {
  const ids = new Set<string>();
  for (const match of text.matchAll(ID_PATTERN)) {
    const prefix = match[1];
    const suffixes = match[2];
    if (prefix === undefined || suffixes === undefined) {
      continue;
    }
    let letter = "";
    for (const part of suffixes.split("/")) {
      const parsed = /^([A-Z]?)(\d+)$/.exec(part);
      if (parsed === null) {
        continue;
      }
      const [, group, number] = parsed;
      if (group === undefined || number === undefined) {
        continue;
      }
      if (group !== "") {
        letter = group;
      }
      ids.add(`${prefix}-${group === "" ? letter : group}${number}`);
    }
  }
  return ids;
}

function readAllTests(directory: string): string {
  let text = "";
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      text += readAllTests(path);
    } else if (path.endsWith(".ts")) {
      text += readFileSync(path, "utf8");
    }
  }
  return text;
}

describe("contract coverage", () => {
  it("every rule identifier in docs/HKOS_RULES.md is named by at least one test", () => {
    const contract = extractIds(readFileSync("docs/HKOS_RULES.md", "utf8"));
    const covered = extractIds(readAllTests("tests"));
    const missing = [...contract].filter((id) => !covered.has(id)).sort();

    expect(contract.size).toBeGreaterThan(80);
    expect(missing, `unverified rules: ${missing.join(", ")}`).toEqual([]);
  });

  it("no test claims a rule identifier the contract does not define", () => {
    const contract = extractIds(readFileSync("docs/HKOS_RULES.md", "utf8"));
    const covered = extractIds(readAllTests("tests"));
    // Excludes this file's own explanatory examples.
    const invented = [...covered].filter(
      (id) => !contract.has(id) && id !== "RULE-PAY-1" && id !== "RULE-FAAN-G10",
    );
    expect(invented.sort()).toEqual([]);
  });
});
