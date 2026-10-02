/**
 * provider-local.ts
 * Reads the questions stored in public/questions/*.json (in Spanish). It is
 * only the backup for when the APIs can't be reached.
 *
 * Format: a list of questions, each one
 *   ["¿Question?", "Correct answer", "Wrong", "Wrong", "Wrong"]
 */

import { shuffle } from "../utils/random";
import { fetchJson } from "../utils/network";
import type { Question } from "./model";

/** A question as stored in the JSON: text, correct answer and wrong ones. */
export type CompactQuestion = [string, string, ...string[]];

/**
 * Converts a JSON question into the game format (shuffled answers).
 * @param compact Question from the JSON.
 */
export function fromCompact([text, correct, ...wrong]: CompactQuestion): Question {
    return {
        text,
        answers: shuffle([{ text: correct, correct: true }, ...wrong.map((answer) => ({ text: answer, correct: false }))]),
        language: "es",
        source: "local",
    };
}

/** Files already downloaded (not requested twice in the same visit). */
const cache = new Map<string, Promise<CompactQuestion[]>>();

/**
 * Loads every question of one or more local files. Files that fail are
 * ignored; if all of them fail, it throws.
 * @param files Paths of the JSON files.
 * @returns Spanish questions with shuffled answers.
 */
export async function loadLocalQuestions(files: readonly string[]): Promise<Question[]> {
    const lists = await Promise.all(
        files.map((file) => {
            let promise = cache.get(file);
            if (!promise) {
                promise = fetchJson<CompactQuestion[]>(file);
                promise.catch(() => cache.delete(file));
                cache.set(file, promise);
            }
            return promise.catch(() => [] as CompactQuestion[]);
        }),
    );
    const questions = lists.flat().map(fromCompact);
    if (questions.length === 0) throw new Error("Local questions could not be loaded");
    return questions;
}
