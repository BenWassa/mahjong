import type { BotController } from "../bots/index.js";
import { createSeededRandom } from "../engine/random.js";
import { projectPublicState } from "../engine/redaction.js";
import type { GameAction, RulesProfile, Seat } from "../engine/types.js";
import { simulateMatch, type ActionChooser, type SimulationResult } from "./driver.js";

const SEATS: readonly Seat[] = [0, 1, 2, 3];

/** A fresh controller per match and seat prevents RNG or memory leaking across games. */
export type BotFactory = (seat: Seat, botSeed: string) => BotController;

export interface BotBenchmarkOptions {
  readonly games: number;
  readonly seedPrefix?: string;
  readonly profile?: RulesProfile;
  readonly maxSteps?: number;
  readonly candidate: BotFactory;
  readonly opponent?: BotFactory;
}

export interface BotStrengthMetrics {
  readonly matches: number;
  readonly hands: number;
  readonly decisiveHands: number;
  readonly candidateWins: number;
  readonly opponentWins: number;
  readonly candidateWinShare: number;
  readonly candidatePoints: number;
  readonly averageCandidatePoints: number;
}

export interface BotBenchmarkMatch {
  readonly seed: string;
  readonly candidateSeat: Seat;
  readonly result: SimulationResult;
}

export interface BotBenchmark {
  readonly matches: readonly BotBenchmarkMatch[];
  readonly metrics: BotStrengthMetrics;
}

/** A legal-action baseline with no access to hidden engine state. */
export const randomBotFactory: BotFactory = (_seat, botSeed) => {
  const random = createSeededRandom(botSeed);
  return {
    chooseAction(_state, legalActions) {
      const action = legalActions[random.nextInt(legalActions.length)];
      if (action === undefined) throw new Error("Random bot received no legal action");
      return action;
    },
  };
};

/**
 * Adapts seat-scoped public bots to the simulation driver's trusted boundary.
 * Internal state is used only to project each acting seat's redacted view; it
 * is never passed to a controller.
 */
export function publicBotChooser(controllers: Readonly<Record<Seat, BotController>>): ActionChooser {
  return (actions, internal): GameAction => {
    const system = actions.find((action) => action.type === "continue");
    if (system !== undefined) return system;

    // Claim windows can have several outstanding responders. Fixed seat order
    // makes scheduling deterministic; engine claim priority stays authoritative.
    for (const seat of SEATS) {
      const legalForSeat = actions.filter(
        (action) => action.type !== "continue" && action.seat === seat,
      );
      if (legalForSeat.length === 0) continue;
      return controllers[seat].chooseAction(projectPublicState(internal, seat), legalForSeat);
    }
    throw new Error("No system or seat action was available");
  };
}

/** Rotates the candidate through every seat against three random opponents. */
export function benchmarkBotAgainstRandom(options: BotBenchmarkOptions): BotBenchmark {
  if (!Number.isInteger(options.games) || options.games <= 0) {
    throw new RangeError("games must be a positive integer");
  }
  const prefix = options.seedPrefix ?? "bot-benchmark";
  const opponent = options.opponent ?? randomBotFactory;
  const matches: BotBenchmarkMatch[] = [];

  for (let index = 0; index < options.games; index += 1) {
    const seed = `${prefix}-${String(index)}`;
    for (const candidateSeat of SEATS) {
      const controllers = Object.fromEntries(
        SEATS.map((seat) => [
          seat,
          seat === candidateSeat
            ? options.candidate(seat, `candidate:${seed}:seat-${String(seat)}`)
            : opponent(seat, `opponent:${seed}:seat-${String(seat)}`),
        ]),
      ) as unknown as Record<Seat, BotController>;
      const simulationOptions = {
        chooser: publicBotChooser(controllers),
        ...(options.profile === undefined ? {} : { profile: options.profile }),
        ...(options.maxSteps === undefined ? {} : { maxSteps: options.maxSteps }),
      };
      matches.push({
        seed,
        candidateSeat,
        result: simulateMatch(seed, simulationOptions),
      });
    }
  }
  return { matches, metrics: aggregate(matches) };
}

function aggregate(matches: readonly BotBenchmarkMatch[]): BotStrengthMetrics {
  let hands = 0;
  let candidateWins = 0;
  let opponentWins = 0;
  let candidatePoints = 0;
  for (const match of matches) {
    hands += match.result.hands;
    candidatePoints += match.result.finalScores[match.candidateSeat];
    for (const hand of match.result.record.hands) {
      if (hand.outcome !== "win") continue;
      if (hand.winner === match.candidateSeat) candidateWins += 1;
      else opponentWins += 1;
    }
  }
  const decisiveHands = candidateWins + opponentWins;
  return {
    matches: matches.length,
    hands,
    decisiveHands,
    candidateWins,
    opponentWins,
    candidateWinShare: decisiveHands === 0 ? 0 : candidateWins / decisiveHands,
    candidatePoints,
    averageCandidatePoints: candidatePoints / matches.length,
  };
}
