/**
 * rules.ts
 * Account rules. They must match supabase/schema.sql.
 */

/** Username: 3-20 lowercase letters without accents, digits or underscore. */
export const USERNAME_FORMAT = /^[a-z0-9_]{3,20}$/;
/** Minimum password length (Supabase's default). */
export const MIN_PASSWORD_LENGTH = 6;
/**
 * Domain of the internal e-mail: Supabase needs an e-mail, so the game uses
 * "<username>@quizmania.app". Nothing is ever sent to that address.
 */
export const INTERNAL_EMAIL_DOMAIN = "quizmania.app";

/**
 * Normalises what the player typed as a username (lowercase, no spaces around).
 * @param text Typed username.
 */
export function normalizeUsername(text: string): string {
    return text.trim().toLowerCase();
}

/**
 * Whether a username has the allowed format.
 * @param username Already normalised username.
 */
export function isValidUsername(username: string): boolean {
    return USERNAME_FORMAT.test(username);
}

/**
 * Internal e-mail of a username.
 * @param username Already normalised username.
 */
export function internalEmail(username: string): string {
    return `${username}@${INTERNAL_EMAIL_DOMAIN}`;
}
