/**
 * provider-opentdb.ts
 * Downloads questions from Open Trivia DB (https://opentdb.com), in English.
 * It uses a "session token" saved in the browser: while the token lives, the
 * API never returns a question twice. When a category runs out, the token
 * is reset and it starts again. The API allows one request every 5 seconds.
 */

import { removeSaved, readSaved, save } from "../utils/storage";
import { shuffle, wait } from "../utils/random";
import { fetchJson } from "../utils/network";
import type { Question } from "./model";

const API_URL = "https://opentdb.com";
const TOKEN_KEY = "opentdb.token";
const MAX_ATTEMPTS = 3;
/** The API only allows one request every 5 seconds per IP. */
const RATE_LIMIT_WAIT = 5200;

/** Documented response codes. */
const enum OpenTdbCode {
    Success = 0,
    NoResults = 1,
    InvalidParameter = 2,
    TokenNotFound = 3,
    TokenEmpty = 4,
    RateLimit = 5,
}

interface OpenTdbQuestions {
    response_code: number;
    results: { question: string; correct_answer: string; incorrect_answers: string[] }[];
}

interface OpenTdbToken {
    response_code: number;
    token: string;
}

/** Requests and stores a new session token. */
async function requestToken(): Promise<string> {
    const response = await fetchJson<OpenTdbToken>(`${API_URL}/api_token.php?command=request`);
    save(TOKEN_KEY, response.token);
    return response.token;
}

/**
 * Resets the token so it serves already-seen questions again (only when no
 * new ones are left).
 * @param token Token to reset.
 */
async function resetToken(token: string): Promise<void> {
    await fetchJson(`${API_URL}/api_token.php?command=reset&token=${encodeURIComponent(token)}`);
}

/**
 * Decodes a text the API sends URL-encoded (RFC 3986).
 * @param text Encoded text.
 */
function decode(text: string): string {
    return decodeURIComponent(text).trim();
}

/**
 * Downloads new questions (never seen with this token).
 * @param amount Number of questions.
 * @param category Open Trivia DB category id; undefined = any.
 * @returns English questions with shuffled answers.
 */
export async function downloadOpenTdb(amount: number, category?: number): Promise<Question[]> {
    let token = readSaved<string | null>(TOKEN_KEY, null) ?? (await requestToken());
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const params = new URLSearchParams({ amount: String(amount), type: "multiple", encode: "url3986", token });
        if (category !== undefined) params.set("category", String(category));
        const response = await fetchJson<OpenTdbQuestions>(`${API_URL}/api.php?${params}`);
        switch (response.response_code) {
            case OpenTdbCode.Success:
                return response.results.map((result) => ({
                    text: decode(result.question),
                    answers: shuffle([
                        { text: decode(result.correct_answer), correct: true },
                        ...result.incorrect_answers.map((wrong) => ({ text: decode(wrong), correct: false })),
                    ]),
                    language: "en",
                    source: "opentdb",
                }));
            case OpenTdbCode.NoResults:
            case OpenTdbCode.TokenEmpty:
                // Every question of the category was seen: start over.
                await resetToken(token);
                await wait(RATE_LIMIT_WAIT);
                break;
            case OpenTdbCode.TokenNotFound:
                // Tokens expire after 6 hours without use.
                removeSaved(TOKEN_KEY);
                token = await requestToken();
                break;
            case OpenTdbCode.RateLimit:
                await wait(RATE_LIMIT_WAIT);
                break;
            default:
                throw new Error(`Open Trivia DB answered code ${response.response_code}`);
        }
    }
    throw new Error("Open Trivia DB returned no questions after several attempts");
}
