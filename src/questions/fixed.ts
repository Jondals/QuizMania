/**
 * fixed.ts
 * Fixed questions for Versus: the ones the challenger played are stored in
 * the database (packed, in their original language) and the rival plays
 * exactly the same ones, in the same order.
 */

import type { Language } from "../i18n/texts";
import type { QuestionSupply } from "./feed";
import { adaptQuestionsToLanguage, normalizeQuestion } from "./feed";
import type { Question, QuestionSource } from "./model";

/** Packed question: text, answers, position of the correct one, language and source. */
export interface PackedQuestion {
    e: string;
    r: string[];
    c: number;
    i: Language;
    s?: QuestionSource;
}

/** Maximum questions of a challenge (same as the database). */
export const MAX_CHALLENGE_QUESTIONS = 15;
const MAX_TEXT_LENGTH = 400;
const MAX_ANSWER_LENGTH = 200;
const SOURCES: readonly QuestionSource[] = ["opentdb", "trivia-api", "local"];

/**
 * Packs questions for storage, always from their original text (so the
 * rival translates them to their language without losing quality).
 * @param questions Played questions.
 */
export function packQuestions(questions: readonly Question[]): PackedQuestion[] {
    return questions.slice(0, MAX_CHALLENGE_QUESTIONS).map((question) => {
        const original = question.original ?? question;
        return {
            e: original.text.slice(0, MAX_TEXT_LENGTH),
            r: original.answers.map((answer) => answer.text.slice(0, MAX_ANSWER_LENGTH)),
            c: original.answers.findIndex((answer) => answer.correct),
            i: original.language ?? question.language ?? "es",
            s: original.source,
        };
    });
}

/**
 * Turns what comes from the database into questions, dropping anything
 * without the right shape.
 * @param data Packed list.
 */
export function unpackQuestions(data: unknown): Question[] {
    if (!Array.isArray(data)) return [];
    return data.flatMap((item: Partial<PackedQuestion>) => {
        const valid =
            typeof item?.e === "string" &&
            Array.isArray(item.r) &&
            item.r.length >= 2 &&
            item.r.every((answer) => typeof answer === "string") &&
            Number.isInteger(item.c) &&
            (item.c as number) >= 0 &&
            (item.c as number) < item.r.length;
        if (!valid) return [];
        const question: Question = {
            text: item.e as string,
            answers: (item.r as string[]).map((text, position) => ({ text, correct: position === item.c })),
            language: item.i === "en" ? "en" : "es",
            source: SOURCES.includes(item.s as QuestionSource) ? (item.s as QuestionSource) : "local",
        };
        return [question];
    });
}

/** Serves the questions of a fixed list one after another, in the player's language. */
export class FixedQuestionFeed implements QuestionSupply {
    private readonly queue: Question[];
    private stopped = false;

    /**
     * @param questions Questions in order.
     * @param language Player's language.
     */
    constructor(
        questions: readonly Question[],
        private language: Language,
    ) {
        this.queue = [...questions];
    }

    /** Returns the next question in the player's language; throws if none are left. */
    async next(): Promise<Question> {
        const question = this.queue.shift();
        if (!question || this.stopped) throw new Error("No questions left");
        return question.language === this.language ? normalizeQuestion(question) : (await adaptQuestionsToLanguage([question], this.language))[0];
    }

    /** Stops requesting questions (the game ended or was abandoned). */
    stop(): void {
        this.stopped = true;
    }

    /**
     * Changes the language of the questions still to come.
     * @param language New language.
     */
    async setLanguage(language: Language): Promise<void> {
        this.language = language;
    }
}
