/**
 * storage.ts
 * Safe wrapper around localStorage. In private mode, with cookies blocked or
 * in some embedded browsers localStorage throws; errors are swallowed here
 * so the game keeps working (it just doesn't remember anything).
 */

/** Prefix shared by every key so we never clash with other sites on the same domain. */
const KEY_PREFIX = "quizmania.";

/**
 * Reads a saved JSON value.
 * @param key Key name (without prefix).
 * @param fallback Value returned when nothing is saved or it can't be read.
 */
export function readSaved<T>(key: string, fallback: T): T {
    try {
        const raw = window.localStorage.getItem(KEY_PREFIX + key);
        return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
        return fallback;
    }
}

/**
 * Saves a value as JSON. Failures are ignored.
 * @param key Key name (without prefix).
 * @param value Value to save.
 */
export function save<T>(key: string, value: T): void {
    try {
        window.localStorage.setItem(KEY_PREFIX + key, JSON.stringify(value));
    } catch {
        // No storage available: the game keeps working without remembering.
    }
}

/**
 * Deletes a saved value.
 * @param key Key name (without prefix).
 */
export function removeSaved(key: string): void {
    try {
        window.localStorage.removeItem(KEY_PREFIX + key);
    } catch {
        // Nothing to do without storage.
    }
}
