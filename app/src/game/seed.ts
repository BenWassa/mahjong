/**
 * Seeds a fresh match. Time-based, so back-to-back matches never collide —
 * used both for the app's very first table and, after #10, whenever a
 * finished match is followed by a new one.
 */
export function newMatchSeed(): string {
  return `hand-${String(Date.now())}`;
}
