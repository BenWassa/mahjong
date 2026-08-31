import { describe, expect, it } from "vitest";
import { createSeededRandom } from "../../src/engine/random.js";
import {
  assertNoHiddenInformation,
  simulateMatch,
  simulateSuite,
  winSeekingChooser,
} from "../../src/sim/driver.js";
import { reproductionHandle } from "../../src/sim/reproduction.js";
import { replayGame } from "../../src/engine/adapter.js";
import type { MinimumFaan, RulesProfile, TileSetSize } from "../../src/engine/types.js";

/**
 * The correctness gate for issue #5.
 *
 * The engine asserts its own invariants inside every transition, so a violation
 * throws where it happens; the harness re-throws it with the seed and full
 * action history attached. Set MAHJONG_GATE_GAMES to widen the run.
 */
const GAMES = Number(process.env["MAHJONG_GATE_GAMES"] ?? "250");

/** The gate deliberately runs long. Scaled so a widened run does not time out. */
const TIMEOUT_MS = Math.max(120_000, GAMES * 400);

function profile(
  tileSetSize: TileSetSize,
  minimumFaan: MinimumFaan,
  matchLength: RulesProfile["matchLength"] = "east-round",
): RulesProfile {
  return { tileSetSize, minimumFaan, matchLength };
}

describe("seeded simulation gate", () => {
  it(`completes ${String(GAMES)} random-action matches with no impossible state`, () => {
    const summary = simulateSuite({ games: GAMES, seedPrefix: "gate-random" });
    expect(summary.games).toBe(GAMES);
    expect(summary.hands).toBeGreaterThanOrEqual(GAMES * 4);
    expect(summary.steps).toBeGreaterThan(0);
  }, TIMEOUT_MS);

  it("completes matches on every rules profile the product ships", () => {
    const profiles: readonly RulesProfile[] = [
      profile(144, 0),
      profile(144, 1),
      profile(144, 3),
      profile(136, 1),
      profile(144, 1, "single-hand"),
      profile(144, 1, "four-rounds"),
    ];
    for (const config of profiles) {
      const summary = simulateSuite({
        games: 20,
        profile: config,
        seedPrefix: `gate-${String(config.tileSetSize)}-${String(config.minimumFaan)}-${config.matchLength}`,
      });
      expect(summary.games).toBe(20);
      expect(summary.hands).toBeGreaterThan(0);
    }
  }, TIMEOUT_MS);

  it("reaches real wins, so scoring and settlement are exercised in play", () => {
    let wins = 0;
    let hands = 0;
    for (let index = 0; index < 60; index += 1) {
      const seed = `gate-wins-${String(index)}`;
      const result = simulateMatch(seed, {
        chooser: winSeekingChooser(createSeededRandom(`choices:${seed}`)),
      });
      wins += result.wins;
      hands += result.hands;
    }
    // A uniform driver almost never completes a hand; this one must, or the
    // gate would be asserting nothing about the scoring path.
    expect(hands).toBeGreaterThan(0);
    expect(wins).toBeGreaterThan(20);
  }, TIMEOUT_MS);

  it("RULE-REDACT-1/2/3: no seat ever sees hidden information mid-match", () => {
    for (let index = 0; index < 25; index += 1) {
      const seed = `gate-redaction-${String(index)}`;
      expect(() =>
        simulateMatch(seed, {
          chooser: winSeekingChooser(createSeededRandom(`choices:${seed}`)),
          observer: assertNoHiddenInformation,
        }),
      ).not.toThrow();
    }
  }, TIMEOUT_MS);

  it("RULE-DET-1: every simulated match replays byte-identically from its record", () => {
    for (let index = 0; index < 25; index += 1) {
      const seed = `gate-replay-${String(index)}`;
      const result = simulateMatch(seed, {
        chooser: winSeekingChooser(createSeededRandom(`choices:${seed}`)),
      });
      // replayGame throws ReplayMismatchError unless seed + actions rebuild the
      // record exactly, so this is the determinism assertion.
      const replayed = replayGame(result.record);
      expect(replayed.gameRecord()).toEqual(result.record);
    }
  }, TIMEOUT_MS);

  it("RULE-DET-2: the action seed is independent of the deal", () => {
    const first = simulateMatch("independence", { actionSeed: "choices-a" });
    const second = simulateMatch("independence", { actionSeed: "choices-b" });
    // Same deal seed, different choices: the walls agree, the play does not.
    expect(second.record.seed).toBe(first.record.seed);
    expect(second.record.actions).not.toEqual(first.record.actions);

    const repeat = simulateMatch("independence", { actionSeed: "choices-a" });
    expect(repeat.record).toEqual(first.record);
  }, TIMEOUT_MS);

  it("RULE-PAY-6: every hand and every match settles to a zero sum", () => {
    for (let index = 0; index < 40; index += 1) {
      const seed = `gate-zero-${String(index)}`;
      const result = simulateMatch(seed, {
        chooser: winSeekingChooser(createSeededRandom(`choices:${seed}`)),
      });
      for (const hand of result.record.hands) {
        // A draw moves no points and carries no breakdown. RULE-DRAW-1
        const payments = hand.scoring?.payments ?? [0, 0, 0, 0];
        const total = payments.reduce((sum, payment) => sum + payment, 0);
        expect(total, `hand ${String(hand.handIndex)} of ${reproductionHandle(result.record)}`).toBe(0);
      }
      expect(result.finalScores.reduce((sum, score) => sum + score, 0)).toBe(0);
    }
  }, TIMEOUT_MS);

  it("a failure carries a reproduction handle naming the seed and actions", () => {
    const result = simulateMatch("handle-shape");
    const handle = reproductionHandle(result.record);
    expect(handle).toContain("seed=handle-shape");
    expect(handle).toContain("profile=144/1/east-round");
    expect(handle).toContain("actions=[");
  }, TIMEOUT_MS);
});
