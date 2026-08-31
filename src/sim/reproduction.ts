import type { GameRecord, RulesProfile } from "../engine/types.js";

/**
 * A one-line handle that reproduces a game exactly. Anything the harness
 * reports carries this, so a failure is pasted straight back into a test
 * instead of being hunted for.
 */
export function reproductionHandle(record: GameRecord): string {
  const actions = record.actions.map((recorded) => shortAction(recorded.action)).join(" ");
  return `seed=${record.seed} profile=${describeProfile(record.config)} actions=[${actions}]`;
}

export function describeProfile(profile: RulesProfile): string {
  return `${String(profile.tileSetSize)}/${String(profile.minimumFaan)}/${profile.matchLength}`;
}

function shortAction(action: GameRecord["actions"][number]["action"]): string {
  switch (action.type) {
    case "discard":
      return `d${String(action.seat)}:${action.tileId}`;
    case "claim-chow":
      return `c${String(action.seat)}:${action.tileIds.join("+")}`;
    case "claim-pung":
      return `p${String(action.seat)}:${action.tileIds.join("+")}`;
    case "claim-kong":
      return `k${String(action.seat)}:${action.tileIds.join("+")}`;
    case "declare-concealed-kong":
      return `K${String(action.seat)}:${action.tileIds.join("+")}`;
    case "declare-added-kong":
      return `A${String(action.seat)}:${action.tileId}@${String(action.meldIndex)}`;
    case "win":
      return `W${String(action.seat)}`;
    case "pass":
      return `-${String(action.seat)}`;
    case "continue":
      return "n";
  }
}
