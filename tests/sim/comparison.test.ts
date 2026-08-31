import { describe, expect, it } from "vitest";
import { createHeuristicBot } from "../../src/bots/index.js";
import { benchmarkBotAgainstRandom, randomBotFactory } from "../../src/sim/comparison.js";
import type { Seat } from "../../src/engine/types.js";

const heuristicFactory = (seat: Seat, seed: string) => createHeuristicBot({ seat, seed });

describe("rotated deterministic bot benchmark", () => {
  it("rotates through every seat on identical deal seeds and reproduces exactly", () => {
    const options = { games: 2, seedPrefix: "paired-repeat", candidate: heuristicFactory };
    const first = benchmarkBotAgainstRandom(options);
    const repeat = benchmarkBotAgainstRandom(options);

    expect(first).toEqual(repeat);
    expect(first.matches.map(({ seed, candidateSeat }) => `${seed}:${String(candidateSeat)}`)).toEqual([
      "paired-repeat-0:0", "paired-repeat-0:1", "paired-repeat-0:2", "paired-repeat-0:3",
      "paired-repeat-1:0", "paired-repeat-1:1", "paired-repeat-1:2", "paired-repeat-1:3",
    ]);
    expect(first.matches.every(({ result }) => result.finished)).toBe(true);
  }, 60_000);

  it("runs a random-candidate control against identical public-state opponents", () => {
    const benchmark = benchmarkBotAgainstRandom({
      games: 2,
      seedPrefix: "random-control",
      candidate: randomBotFactory,
    });
    expect(benchmark.metrics.matches).toBe(8);
    expect(Number.isFinite(benchmark.metrics.averageCandidatePoints)).toBe(true);
  }, 60_000);

  it("is materially stronger than random-action play over seeded East rounds", () => {
    const benchmark = benchmarkBotAgainstRandom({
      games: 12,
      seedPrefix: "heuristic-strength",
      candidate: heuristicFactory,
    });
    expect(benchmark.metrics.decisiveHands).toBeGreaterThan(20);
    expect(benchmark.metrics.candidateWinShare).toBeGreaterThan(0.6);
    expect(benchmark.metrics.averageCandidatePoints).toBeGreaterThan(0);
  }, 120_000);

  it("rejects an empty or fractional benchmark", () => {
    expect(() => benchmarkBotAgainstRandom({ games: 0, candidate: heuristicFactory })).toThrow(
      "games must be a positive integer",
    );
    expect(() => benchmarkBotAgainstRandom({ games: 1.5, candidate: heuristicFactory })).toThrow(
      "games must be a positive integer",
    );
  });
});
