import { DEFAULT_RULES_PROFILE, type RulesProfile } from "@engine";

/**
 * The two tables this app offers.
 *
 * A mode is a presentation-and-profile bundle, not a second rule set: the
 * engine remains the only authority on legality. Beginner selects a rules
 * profile the engine already supports, sets the learning aids on, and reduces
 * what the interface draws and offers. Nothing here re-derives a rule.
 */
export type TableMode = "beginner" | "standard";

/**
 * The rules profile each mode deals under.
 *
 * Exactly one axis moves. Under the standard profile the engine withholds the
 * `win` action until the hand clears the minimum faan floor, which is the one
 * rule that most reliably strands a new player: the hand is visibly complete
 * and the game refuses to end it. At zero, any structurally complete hand can
 * be declared, and the core loop — four sets and a pair, then Win — becomes
 * learnable inside a single hand.
 *
 * `docs/HKOS_RULES.md` already names this profile "Beginner", and
 * `tests/gate/corpus.test.ts` already exercises it as PROFILE_144_OPEN, so
 * this is a ruleset the correctness gate proves rather than a new one.
 *
 * The other two axes deliberately do not move; `docs/DESIGN.md` §20 records
 * why. In short: a 136-tile set would make a beginner's hand score *lower*
 * than the same hand in standard mode, and a single-hand match would remove
 * the only trigger the dealer-rotation explain concept has.
 */
export const MODE_RULES: Record<TableMode, RulesProfile> = Object.freeze({
  standard: DEFAULT_RULES_PROFILE,
  beginner: Object.freeze({
    tileSetSize: 144,
    minimumFaan: 0,
    matchLength: "east-round",
  }),
});

export function isTableMode(value: unknown): value is TableMode {
  return value === "beginner" || value === "standard";
}
