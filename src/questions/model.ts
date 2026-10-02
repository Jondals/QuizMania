/**
 * model.ts
 * Shared shape of a question, whichever API or local file it comes from.
 */

import type { Language } from "../i18n/texts";

/** Where a question comes from (shown as a small badge on the question card). */
export type QuestionSource = "opentdb" | "trivia-api" | "local";

/** One of the possible answers. */
export interface Answer {
    text: string;
    correct: boolean;
}

/** A question with its (already shuffled) answers. */
export interface Question {
    text: string;
    answers: Answer[];
    /** Language the texts are in right now. */
    language?: Language;
    /** API or file it was taken from. */
    source: QuestionSource;
    /**
     * The question as it arrived (untranslated). Kept so the language can be
     * changed mid-game always translating from the original, without losing
     * quality by translating translations.
     */
    original?: Question;
}

/** Questions requested at a time (endless modes ask for more as they go). */
export const BATCH_SIZE = 10;
