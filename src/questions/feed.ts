/**
 * feed.ts
 * Endless supply of questions for a game. It works for 10-question games
 * and for the endless modes alike:
 *   1. Downloads batches from the online APIs (The Trivia API and Open
 *      Trivia DB, in English), trying the topic's sources in turns, and asks
 *      for the next batch before the queue runs out so the player never waits.
 *   2. If every API fails or is too slow, that batch comes from the local
 *      JSON files (Spanish). The next batch tries the APIs again: one failure
 *      never turns the rest of the game into local questions.
 *   3. Translates each batch to the player's language (and again if the
 *      player switches language mid-game) and tidies the texts (capitals and
 *      punctuation, see normalize.ts).
 * A question is never repeated within a game while new ones are available.
 */

import type { OnlineSource, Topic } from "../config/topics";
import { ALL_LOCAL_FILES } from "../config/topics";
import type { Language } from "../i18n/texts";
import { shuffle } from "../utils/random";
import { withTimeout } from "../utils/network";
import type { Question } from "./model";
import { BATCH_SIZE } from "./model";
import { normalizeAnswerText, normalizeQuestionText } from "./normalize";
import { downloadOpenTdb } from "./provider-opentdb";
import { loadLocalQuestions } from "./provider-local";
import { downloadTriviaApi } from "./provider-trivia-api";
import { translateTexts } from "./translator";

/** When the queue has this many questions or fewer, the next batch is requested. */
const PREFETCH_THRESHOLD = 4;
/** Attempts to get a batch with unseen questions. */
const ATTEMPTS_PER_BATCH = 3;
/** Total time for the online APIs on the first batch (the player is waiting) (ms). */
const FIRST_BATCH_ONLINE_LIMIT = 6000;
/** Total time for the online APIs on later batches (requested in advance) (ms). */
const ONLINE_LIMIT = 15000;
/** Maximum time of a translation (ms). */
const TRANSLATION_LIMIT = 7000;

/** What a game needs to keep getting questions. */
export interface QuestionSupply {
    /** Returns the next question; throws if none are left. */
    next(): Promise<Question>;
    /** Stops requesting questions (when the game ends or is abandoned). */
    stop(): void;
    /** Changes the language of the questions still to come. */
    setLanguage(language: Language): Promise<void>;
}

/**
 * Tidies a question's texts for its language.
 * @param question Question.
 * @param fixTitleCase Lower-case "Title Case" texts (only before translating).
 */
export function normalizeQuestion(question: Question, fixTitleCase = false): Question {
    const language = question.language ?? "es";
    return {
        ...question,
        text: normalizeQuestionText(question.text, language, fixTitleCase),
        answers: question.answers.map((answer) => ({ ...answer, text: normalizeAnswerText(answer.text) })),
    };
}

/**
 * Untranslated version of a question, with its language.
 * @param question Question (translated or not).
 */
function originalOf(question: Question): Question & { language: Language } {
    const original = question.original ?? question;
    return { ...original, language: original.language ?? "es" };
}

/**
 * Puts questions in the requested language, always translating from the
 * original. If the translation fails or takes too long they stay as they were.
 * @param questions Questions to adapt.
 * @param target Player's language.
 */
export async function adaptQuestionsToLanguage(questions: readonly Question[], target: Language): Promise<Question[]> {
    const result = [...questions];
    const pending: { position: number; original: Question & { language: Language } }[] = [];

    questions.forEach((question, position) => {
        if (question.language === target) return;
        const original = originalOf(question);
        if (original.language === target) result[position] = normalizeQuestion({ ...original, original: undefined });
        else pending.push({ position, original });
    });

    // Grouped by source language to translate each group at once.
    for (const from of ["es", "en"] as const) {
        const group = pending.filter((item) => item.original.language === from);
        if (group.length === 0) continue;
        // "Title Case" sources are lowered first: the translator brings proper names back.
        const prepared = group.map(({ original }) => normalizeQuestion(original, true));
        const texts = prepared.flatMap((question) => [question.text, ...question.answers.map((answer) => answer.text)]);
        let translated: string[];
        try {
            translated = await withTimeout(translateTexts(texts, from, target), TRANSLATION_LIMIT);
        } catch {
            continue; // No translation: they stay in their language.
        }
        let index = 0;
        group.forEach(({ position, original }, groupPosition) => {
            const source = prepared[groupPosition];
            result[position] = normalizeQuestion({
                text: translated[index++],
                answers: source.answers.map((answer) => ({ ...answer, text: translated[index++] })),
                language: target,
                source: original.source,
                original,
            });
        });
    }
    return result;
}

/**
 * Downloads one batch from one online source.
 * @param source API and category or tags.
 */
function downloadFrom(source: OnlineSource): Promise<Question[]> {
    return source.api === "opentdb"
        ? downloadOpenTdb(BATCH_SIZE, source.category)
        : downloadTriviaApi(BATCH_SIZE, { categories: source.categories, tags: source.tags });
}

/** Questions of a game, in order and without repeats. */
export class QuestionFeed implements QuestionSupply {
    private readonly queue: Question[] = [];
    /** Original texts already used (before translating). */
    private readonly seen = new Set<string>();
    private loading: Promise<void> | null = null;
    /** Local questions waiting to be used. */
    private localPool: Question[] = [];
    /** The topic's own local file ran out and the mix of every topic is used. */
    private usingMix = false;
    private stopped = false;
    /** true until the first batch arrives (the player is waiting for it). */
    private firstBatch = true;
    /** Batches requested so far (the online sources take turns). */
    private batchNumber = 0;

    /**
     * @param topic Game topic ("Random" mixes every topic).
     * @param language Player's language.
     * @param onTranslate Called before translating a batch (to show it on screen).
     */
    constructor(
        private readonly topic: Topic,
        private language: Language,
        private readonly onTranslate: () => void = () => {},
    ) {}

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
        const pending = this.queue.splice(0);
        this.queue.unshift(...(await adaptQuestionsToLanguage(pending, language)));
    }

    /** Returns the next question in the player's language; throws if none are left. */
    async next(): Promise<Question> {
        if (this.queue.length === 0) await this.refill();
        const question = this.queue.shift();
        if (!question) throw new Error("No questions left");
        if (this.queue.length <= PREFETCH_THRESHOLD) this.refill().catch(() => {});
        return question.language === this.language ? question : (await adaptQuestionsToLanguage([question], this.language))[0];
    }

    /** Requests a new batch (if one is already on its way, waits for that one). */
    private refill(): Promise<void> {
        this.loading ??= this.loadBatch().finally(() => {
            this.loading = null;
        });
        return this.loading;
    }

    /** Gets a batch of new questions, translates it and appends it to the queue. */
    private async loadBatch(): Promise<void> {
        for (let attempt = 0; attempt < ATTEMPTS_PER_BATCH && !this.stopped; attempt++) {
            const batch = (await this.downloadOnline()) ?? (await this.takeLocalBatch());
            if (this.stopped) return;

            const fresh = batch.filter((question) => !this.seen.has(question.text.toLowerCase()));
            fresh.forEach((question) => this.seen.add(question.text.toLowerCase()));
            if (fresh.length === 0) continue;
            if (fresh.some((question) => question.language !== this.language)) this.onTranslate();
            // Translated questions come back tidied; the rest are tidied here.
            const ready = (await adaptQuestionsToLanguage(fresh, this.language)).map((question) =>
                question.original ? question : normalizeQuestion(question),
            );
            if (this.stopped) return;
            this.queue.push(...ready);
            this.firstBatch = false;
            return;
        }
        if (!this.stopped) throw new Error("No new questions could be found");
    }

    /**
     * Tries the topic's online sources, starting with a different one each
     * batch, within a total time limit.
     * @returns The batch, or null if every source failed.
     */
    private async downloadOnline(): Promise<Question[] | null> {
        const sources = this.topic.sources;
        if (sources.length === 0) return null;
        const deadline = Date.now() + (this.firstBatch ? FIRST_BATCH_ONLINE_LIMIT : ONLINE_LIMIT);
        const start = this.batchNumber++ % sources.length;
        const order = [...sources.slice(start), ...sources.slice(0, start)];
        for (const source of order) {
            const timeLeft = deadline - Date.now();
            if (timeLeft < 400 || this.stopped) break;
            try {
                const batch = await withTimeout(downloadFrom(source), timeLeft);
                if (batch.length > 0) return batch;
            } catch {
                // This source failed or was too slow: try the next one.
            }
        }
        return null;
    }

    /**
     * Takes a batch from the local backup: first the topic's file, then the
     * mix of every topic and, when even that is exhausted, repeats are allowed.
     */
    private async takeLocalBatch(): Promise<Question[]> {
        if (this.localPool.length === 0) {
            const useMix = this.usingMix || this.topic.localFile === null;
            const files = useMix ? ALL_LOCAL_FILES : [this.topic.localFile as string];
            let available = (await loadLocalQuestions(files)).filter((question) => !this.seen.has(question.text.toLowerCase()));
            if (available.length === 0) {
                if (!useMix) {
                    this.usingMix = true;
                    return this.takeLocalBatch();
                }
                this.seen.clear();
                available = await loadLocalQuestions(files);
            }
            this.localPool = shuffle(available);
            if (!useMix) this.usingMix = true;
        }
        return this.localPool.splice(0, BATCH_SIZE);
    }
}
