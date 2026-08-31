import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const COVERAGE_ALIASES = {
  "RULE-FAAN-C1": {
    file: "tests/engine/scoring.test.ts",
    test: "RECON-9: concealed all-triplets self-draw is exactly A2 + C1 + C2, not a limit",
  },
  "RULE-FAAN-G4": {
    file: "tests/engine/scoring.test.ts",
    test: "RECON-6 and RULE-FAAN-G3/G4: All Honours is 10 and is not a flush or terminals pattern",
  },
  "RULE-FAAN-G8": {
    file: "tests/engine/scoring.test.ts",
    test: "RECON-3 and RULE-FAAN-G6/G8: Great Three Dragons is 8, excludes A5 and stacks with all B1",
  },
  "RULE-FAAN-G11": {
    file: "tests/engine/scoring.test.ts",
    test: "RULE-FAAN-G10/G11: discard/rob contexts never add self-draw or last-wall faan",
  },
  "RULE-PAY-3": {
    file: "tests/engine/scoring.test.ts",
    test: "RECON-16 and RULE-PAY-1/3: discard and robbed-kong wins use half-discarder settlement",
  },
  "RULE-PAY-4": {
    file: "tests/engine/scoring.test.ts",
    test: "RULE-PAY-2/4/5: self-draw and instant flower wins charge every loser equally with no dealer multiplier",
  },
  "RULE-PAY-5": {
    file: "tests/engine/scoring.test.ts",
    test: "RULE-PAY-2/4/5: self-draw and instant flower wins charge every loser equally with no dealer multiplier",
  },
  "RULE-PAY-6": {
    file: "tests/engine/scored-core.test.ts",
    test: "RULE-PAY-1/6 and RECON-16: a 0-faan discard win settles scores and records the itemized breakdown",
  },
} as const;

describe("Issue #4 compact-label coverage aliases", () => {
  for (const [identifier, target] of Object.entries(COVERAGE_ALIASES)) {
    it(`${identifier} maps to its merged focused scoring regression`, () => {
      const source = readFileSync(join(ROOT, target.file), "utf8");
      expect(source).toContain(target.test);
    });
  }
});
