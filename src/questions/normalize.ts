/**
 * normalize.ts
 * Tidies up question and answer texts, both from the APIs and after machine
 * translation, so they always look the same:
 *   - Spaces collapsed and trimmed, no space before punctuation.
 *   - TEXT IN CAPITALS turned into normal sentence case.
 *   - "Title Case Questions" turned into sentence case before translating.
 *   - First letter in upper case (also after "¿", "¡" or quotes).
 *   - Questions end with "?" (Spanish ones also open with "¿") and
 *     statements end with ".".
 *   - Answers start with an upper-case letter (unless they are like "iPhone").
 * Pure functions with no browser dependencies, so they are unit-tested.
 */

import type { Language } from "../i18n/texts";

/** Words that open a question in each language (used when the "?" is missing). */
const INTERROGATIVES: Record<Language, RegExp> = {
    es: /^(qué|que|cuál|cuáles|cual|quién|quiénes|quien|cómo|cuándo|dónde|cuánto|cuánta|cuántos|cuántas|por qué|en qué|de qué|a qué|con qué|para qué)\b/i,
    en: /^(what|which|who|whom|whose|how|when|where|why|in what|in which|is|are|was|were|do|does|did|can|could|will|would|has|have|had)\b/i,
};

/**
 * Whether almost every letter is upper case (e.g. "WHAT IS THE CAPITAL").
 * Short texts (acronyms like "NASA") don't count.
 * @param text Text to check.
 */
export function isAllCaps(text: string): boolean {
    const letters = text.match(/\p{L}/gu) ?? [];
    if (letters.length < 6 || !/\s/.test(text.trim())) return false;
    const upper = letters.filter((letter) => letter !== letter.toLowerCase() && letter === letter.toUpperCase()).length;
    return upper / letters.length > 0.85;
}

/**
 * Whether the text Capitalises Almost Every Word.
 * @param text Text to check.
 */
export function isTitleCase(text: string): boolean {
    const words = text.split(/\s+/).filter((word) => /^\p{L}{2,}/u.test(word));
    if (words.length < 4) return false;
    const capitalised = words.filter((word) => /^\p{Lu}\p{Ll}/u.test(word)).length;
    return capitalised / words.length >= 0.75;
}

/**
 * Upper-cases the first letter (skipping opening marks like "¿", "¡", quotes or brackets).
 * @param text Text.
 */
export function capitalizeFirst(text: string): string {
    return text.replace(/^([\s¿¡"'“‘«(\[]*)(\p{L})/u, (_, prefix: string, letter: string) => prefix + letter.toUpperCase());
}

/**
 * Collapses spaces and removes the space before punctuation (and after ¿ ¡).
 * @param text Text.
 */
function tidySpaces(text: string): string {
    return text
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\s+([?!.,:;])/g, "$1")
        .replace(/([¿¡])\s+/g, "$1");
}

/**
 * Makes sure a Spanish question has its opening "¿", placed at the start of
 * the last sentence (so "En 1990… ¿Quién…?" stays correct).
 * @param text Text ending in "?".
 */
function addSpanishOpeningMark(text: string): string {
    if (text.includes("¿")) return text;
    const body = text.slice(0, -1);
    const boundary = Math.max(body.lastIndexOf(". "), body.lastIndexOf(": "), body.lastIndexOf("; "));
    if (boundary === -1) return capitalizeFirst(`¿${text}`);
    const before = body.slice(0, boundary + 2);
    return `${before}${capitalizeFirst(`¿${text.slice(boundary + 2)}`)}`;
}

/**
 * Normalises a question text.
 * @param text Raw text.
 * @param language Language the text is in.
 * @param fixTitleCase Also lower-case "Title Case" texts (only before translating:
 *   the translator brings back the capitals of names; in English, proper names would be lost).
 */
export function normalizeQuestionText(text: string, language: Language, fixTitleCase = false): string {
    let result = tidySpaces(text);
    if (!result) return result;
    if (isAllCaps(result)) {
        result = result.toLowerCase();
    } else if (fixTitleCase && isTitleCase(result)) {
        // Only words like "Capital" are lowered; "USA", "iPhone" or "McDonald" stay.
        result = result.replace(/\p{L}+/gu, (word) => (/^\p{Lu}\p{Ll}+$/u.test(word) ? word.toLowerCase() : word));
    }
    result = capitalizeFirst(result);

    const looksLikeQuestion = /\?["'”»)]*$/.test(result) || result.startsWith("¿") || INTERROGATIVES[language].test(result);
    if (!/[.?!…:"'”»)\]]$/.test(result)) {
        result += looksLikeQuestion ? "?" : ".";
    }
    if (language === "es") {
        if (result.endsWith("?")) result = addSpanishOpeningMark(result);
        // A "¿" without its closing "?" (the translator sometimes drops it).
        if (result.includes("¿") && !result.includes("?")) result = result.replace(/[.…]?$/, "?");
    }
    return result;
}

/**
 * Normalises an answer: tidy spaces, no SHOUTING, first letter in upper case
 * (unless it's a word like "iPhone" or "eBay").
 * @param text Raw answer.
 */
export function normalizeAnswerText(text: string): string {
    let result = tidySpaces(text);
    if (isAllCaps(result)) result = result.toLowerCase();
    if (/^\p{Ll}\p{Lu}/u.test(result)) return result;
    return capitalizeFirst(result);
}
