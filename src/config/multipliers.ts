/**
 * multipliers.ts
 * The slot machine's third reel: a points multiplier for the whole game,
 * from ×1 to ×5. Higher multipliers are rarer. The database accepts up to
 * 2,500 points per hit, which is the most a hit can be worth with ×5
 * (250 points × 2 in Double or nothing × 5).
 */

import { pickWeighted } from "../utils/random";

/** A multiplier with its reel colour and how often it comes up. */
export interface Multiplier {
    value: number;
    color: string;
    weight: number;
}

/** Every multiplier on the reel. */
export const MULTIPLIERS: readonly Multiplier[] = [
    { value: 1, color: "#a5a4bd", weight: 40 },
    { value: 2, color: "#19f5c8", weight: 26 },
    { value: 3, color: "#22e5ff", weight: 17 },
    { value: 4, color: "#ff2e7e", weight: 11 },
    { value: 5, color: "#ffd84d", weight: 6 },
];

/** Highest multiplier (used to validate scores). */
export const MAX_MULTIPLIER = 5;

/**
 * Draws a multiplier using the weights.
 * @param roll Random number in [0, 1) (tests pass their own).
 */
export function drawMultiplier(roll = Math.random()): number {
    return pickWeighted(
        MULTIPLIERS.map((multiplier) => ({ value: multiplier.value, weight: multiplier.weight })),
        roll,
    );
}

/**
 * Finds a multiplier's data.
 * @param value 1 to 5.
 */
export function findMultiplier(value: number): Multiplier {
    return MULTIPLIERS.find((multiplier) => multiplier.value === value) ?? MULTIPLIERS[0];
}
