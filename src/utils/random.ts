/**
 * random.ts
 * Randomness helpers: shuffling, picking items (also by weight) and waiting.
 */

/**
 * Returns a shuffled copy of a list (Fisher-Yates: every order is equally likely).
 * @param list Original list (not modified).
 */
export function shuffle<T>(list: readonly T[]): T[] {
    const copy = [...list];
    for (let position = copy.length - 1; position > 0; position--) {
        const other = Math.floor(Math.random() * (position + 1));
        [copy[position], copy[other]] = [copy[other], copy[position]];
    }
    return copy;
}

/**
 * Picks a random item from a non-empty list.
 * @param list List to pick from.
 */
export function pickRandom<T>(list: readonly T[]): T {
    return list[Math.floor(Math.random() * list.length)];
}

/**
 * Picks an item using its weight (an item with weight 4 is twice as likely as one with 2).
 * @param items Items with their weights.
 * @param roll Random number in [0, 1) (Math.random by default; tests pass their own).
 */
export function pickWeighted<T>(items: readonly { value: T; weight: number }[], roll = Math.random()): T {
    const total = items.reduce((sum, item) => sum + item.weight, 0);
    let target = roll * total;
    for (const item of items) {
        target -= item.weight;
        if (target < 0) return item.value;
    }
    return items[items.length - 1].value;
}

/**
 * Waits the given number of milliseconds.
 * @param milliseconds Time to wait.
 */
export function wait(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
