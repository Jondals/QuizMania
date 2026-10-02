/**
 * translator.ts
 * Translates texts between Spanish and English with free, key-less services:
 *   1. Google Translate (public "gtx" endpoint): every text in a single
 *      request separated by line breaks.
 *   2. MyMemory (https://mymemory.translated.net) as a backup, text by text.
 * If both fail the original texts are returned: the game never runs out of
 * questions because of the translation.
 */

import type { Language } from "../i18n/texts";
import { fetchJson } from "../utils/network";

const GOOGLE_URL = "https://translate.googleapis.com/translate_a/single";
const MYMEMORY_URL = "https://api.mymemory.translated.net/get";
/** Maximum safe length of a GET URL. */
const MAX_URL_LENGTH = 7000;

/** Google's answer: [[["translation","original",…], …], …]. */
type GoogleResponse = [[string, string, ...unknown[]][], ...unknown[]];

interface MyMemoryResponse {
    responseStatus: number;
    responseData: { translatedText: string };
}

/**
 * Translates a block of text with Google Translate.
 * @param block Text (may have several lines).
 * @param from Source language.
 * @param to Target language.
 */
async function translateWithGoogle(block: string, from: Language, to: Language): Promise<string> {
    const params = new URLSearchParams({ client: "gtx", sl: from, tl: to, dt: "t", q: block });
    const response = await fetchJson<GoogleResponse>(`${GOOGLE_URL}?${params}`);
    return response[0].map((segment) => segment[0]).join("");
}

/**
 * Translates a short text with MyMemory.
 * @param text Text to translate.
 * @param from Source language.
 * @param to Target language.
 */
async function translateWithMyMemory(text: string, from: Language, to: Language): Promise<string> {
    const params = new URLSearchParams({ q: text, langpair: `${from}|${to}` });
    const response = await fetchJson<MyMemoryResponse>(`${MYMEMORY_URL}?${params}`);
    if (response.responseStatus !== 200) throw new Error(`MyMemory answered ${response.responseStatus}`);
    // MyMemory escapes some characters as HTML entities.
    return response.responseData.translatedText.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
}

/**
 * Splits the texts into groups whose URL isn't too long.
 * @param texts Texts to group.
 */
function groupByLength(texts: readonly string[]): string[][] {
    const groups: string[][] = [];
    let group: string[] = [];
    let length = 0;
    for (const text of texts) {
        const encoded = encodeURIComponent(text).length + 3;
        if (group.length > 0 && length + encoded > MAX_URL_LENGTH) {
            groups.push(group);
            group = [];
            length = 0;
        }
        group.push(text);
        length += encoded;
    }
    if (group.length > 0) groups.push(group);
    return groups;
}

/**
 * Translates a group with Google in one request. If the number of returned
 * lines doesn't match, it translates text by text.
 * @param group Texts (without inner line breaks).
 * @param from Source language.
 * @param to Target language.
 */
async function translateGroupWithGoogle(group: string[], from: Language, to: Language): Promise<string[]> {
    const lines = (await translateWithGoogle(group.join("\n"), from, to)).split("\n");
    if (lines.length === group.length) return lines.map((line) => line.trim());
    return Promise.all(group.map((text) => translateWithGoogle(text, from, to)));
}

/**
 * Translates a list of texts keeping their order.
 * @param texts Texts to translate.
 * @param from Source language.
 * @param to Target language.
 * @returns Translated texts (or the originals if nothing worked).
 */
export async function translateTexts(texts: readonly string[], from: Language, to: Language): Promise<string[]> {
    if (from === to || texts.length === 0) return [...texts];
    // Line breaks are the separator, so they are removed from the texts.
    const clean = texts.map((text) => text.replace(/\s*\n\s*/g, " "));
    try {
        const groups = await Promise.all(groupByLength(clean).map((group) => translateGroupWithGoogle(group, from, to)));
        return groups.flat();
    } catch {
        // Google not available: try MyMemory text by text.
    }
    return Promise.all(clean.map((text) => translateWithMyMemory(text, from, to).catch(() => text)));
}
