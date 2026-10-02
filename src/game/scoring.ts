/**
 * scoring.ts
 * How many points each hit is worth:
 *   - 100 base points.
 *   - Streak: +20 for every consecutive hit from the second one (max +100).
 *   - Speed (only in modes with a per-question clock): up to +50 depending on
 *     the time left.
 *   - Everything is multiplied by the mode's multiplier (×2 in Double or
 *     nothing, up to ×2 for a long streak in Climb) and by the slot
 *     machine's multiplier (×1 to ×5), then rounded.
 * Most a hit can be worth: 250 × 2 × 5 = 2,500 (the database checks it too).
 * Misses don't take points away (but they break the streak).
 */

export const BASE_POINTS = 100;
export const STREAK_POINTS = 20;
export const MAX_STREAK_BONUS = 100;
export const MAX_SPEED_BONUS = 50;

/** Data of a hit to compute its points. */
export interface HitData {
    /** Consecutive hits including this one (1 = first hit of the streak). */
    streak: number;
    /** Seconds left when answering (if there is a per-question clock). */
    secondsLeft?: number;
    /** Seconds per question of the mode (if any). */
    secondsPerQuestion?: number | null;
    /** Total multiplier (mode × slot machine), 1 by default. */
    multiplier?: number;
}

/**
 * Computes the points of a hit.
 * @param data Streak, time and multiplier of the hit.
 */
export function hitPoints({ streak, secondsLeft = 0, secondsPerQuestion = null, multiplier = 1 }: HitData): number {
    const streakBonus = Math.min(Math.max(streak - 1, 0) * STREAK_POINTS, MAX_STREAK_BONUS);
    const speedBonus = secondsPerQuestion ? Math.round(MAX_SPEED_BONUS * Math.min(Math.max(secondsLeft / secondsPerQuestion, 0), 1)) : 0;
    return Math.round((BASE_POINTS + streakBonus + speedBonus) * multiplier);
}

/**
 * Formats a score with thousands separators (also with 4 digits, which
 * toLocaleString("es") leaves unseparated).
 * @param points Points.
 * @param language Interface language.
 */
export function formatPoints(points: number, language: "es" | "en"): string {
    return String(Math.round(points)).replace(/\B(?=(\d{3})+(?!\d))/g, language === "es" ? "." : ",");
}
