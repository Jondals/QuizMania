/**
 * provider-trivia-api.ts
 * Downloads questions from The Trivia API (https://the-trivia-api.com), in
 * English, by category and/or tags. The API has no tokens, so the ids of the
 * questions already seen are kept in the browser and skipped to avoid
 * repeats. It has no strict rate limit and returns up to 50 per request,
 * which makes it the fastest source.
 */

import { readSaved, save } from "../utils/storage";
import { shuffle } from "../utils/random";
import { fetchJson } from "../utils/network";
import type { Question } from "./model";

const API_URL = "https://the-trivia-api.com/v2/questions";
/** Most questions the API returns per request. */
const PER_REQUEST = 50;
const MAX_ATTEMPTS = 3;
/** Limit of remembered ids, so storage doesn't fill up. */
const MAX_REMEMBERED_IDS = 5000;

interface TriviaApiQuestion {
    id: string;
    question: { text: string };
    correctAnswer: string;
    incorrectAnswers: string[];
}

/** What to ask the API for (nothing = any question). */
export interface TriviaApiFilter {
    categories?: string;
    tags?: string;
}

/**
 * Storage key of the seen ids of one filter.
 * @param filter Categories and tags.
 */
function seenKey(filter: TriviaApiFilter): string {
    return `trivia-api.seen.${filter.categories ?? ""}.${filter.tags ?? ""}`;
}

/**
 * Downloads questions the player hasn't seen before. If after a few attempts
 * there aren't enough new ones, the history of that filter is forgotten and
 * it starts again.
 * @param amount Number of questions.
 * @param filter Categories and/or tags.
 * @returns English questions with shuffled answers.
 */
export async function downloadTriviaApi(amount: number, filter: TriviaApiFilter = {}): Promise<Question[]> {
    const seen = new Set(readSaved<string[]>(seenKey(filter), []));
    const chosen = new Map<string, TriviaApiQuestion>();
    for (let attempt = 1; attempt <= MAX_ATTEMPTS && chosen.size < amount; attempt++) {
        const params = new URLSearchParams({ limit: String(PER_REQUEST) });
        if (filter.categories) params.set("categories", filter.categories);
        if (filter.tags) params.set("tags", filter.tags);
        const batch = await fetchJson<TriviaApiQuestion[]>(`${API_URL}?${params}`);
        for (const question of batch) {
            if (chosen.size < amount && !seen.has(question.id)) chosen.set(question.id, question);
        }
        if (batch.length < PER_REQUEST) break; // Small banks: asking again won't bring new ones.
    }
    // Almost the whole bank was seen: start the history again.
    const history = chosen.size < amount ? [] : [...seen];
    history.push(...chosen.keys());
    save(seenKey(filter), history.slice(-MAX_REMEMBERED_IDS));
    if (chosen.size === 0) throw new Error("The Trivia API returned no questions");

    return [...chosen.values()].map((question) => ({
        text: question.question.text.trim(),
        answers: shuffle([
            { text: question.correctAnswer.trim(), correct: true },
            ...question.incorrectAnswers.map((wrong) => ({ text: wrong.trim(), correct: false })),
        ]),
        language: "en",
        source: "trivia-api",
    }));
}
