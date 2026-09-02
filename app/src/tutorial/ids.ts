/**
 * The five core lessons of Learn to Play (#30), in the order they are taught.
 *
 * Kept in their own module because two layers need the identifiers and neither
 * should have to import the other: the lesson catalogue defines the content,
 * and the persistence layer records which of them a player has finished.
 */
export const LESSON_IDS = ["shape", "turn", "improve", "claims", "win"] as const;

export type LessonId = (typeof LESSON_IDS)[number];

export function isLessonId(value: unknown): value is LessonId {
  return typeof value === "string" && (LESSON_IDS as readonly string[]).includes(value);
}
