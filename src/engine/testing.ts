import type { InternalGameState } from "./types.js";

/** Test-only canonical snapshot. This module is not part of the package entry point. */
export function serializeInternalState(state: InternalGameState): string {
  return JSON.stringify(state);
}
