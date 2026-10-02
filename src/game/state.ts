/**
 * state.ts
 * State of the game in progress: mode, topic, slot multiplier, answered
 * questions, points, streak, lives, time left and whether answers are being
 * reviewed.
 */

import type { Mode } from "../config/modes";
import { MODES } from "../config/modes";
import type { Topic } from "../config/topics";
import type { Question } from "../questions/model";

/** A question that came up in the game and what happened with it. */
export interface QuestionRecord {
    question: Question;
    /** Chosen answer (position), or null if unanswered (time ran out). */
    chosen: number | null;
    /** true once answered or once its time ran out. */
    answered: boolean;
    correct: boolean;
    /** Points it gave (0 when missed). */
    points: number;
}

/** Data of the game in progress. */
export interface GameState {
    mode: Mode;
    topic: Topic | null;
    /** Slot machine multiplier (×1 to ×5) applied to every hit. */
    multiplier: number;
    /** Questions that came up, in order. The last one is being played. */
    history: QuestionRecord[];
    points: number;
    hits: number;
    streak: number;
    bestStreak: number;
    /** Lives left; null when the mode has no lives. */
    lives: number | null;
    /** Seconds left for the current question (per-question clock). */
    questionSeconds: number;
    /** Seconds the current question started with (Bomb keeps shortening it). */
    questionSecondsMax: number;
    /** Seconds left in the game (whole-game clock). */
    totalSeconds: number;
    /** true while playing (not in results or review). */
    playing: boolean;
    reviewing: boolean;
    /** Position of the reviewed question. */
    reviewIndex: number;
}

/** The single game state. */
export const gameState: GameState = {
    mode: MODES[0],
    topic: null,
    multiplier: 1,
    history: [],
    points: 0,
    hits: 0,
    streak: 0,
    bestStreak: 0,
    lives: null,
    questionSeconds: 0,
    questionSecondsMax: 0,
    totalSeconds: 0,
    playing: false,
    reviewing: false,
    reviewIndex: 0,
};

/**
 * Resets the state for a new game.
 * @param mode Game mode.
 * @param topic Topic picked by the slot machine.
 * @param multiplier Slot machine multiplier.
 */
export function startGameState(mode: Mode, topic: Topic, multiplier: number): void {
    Object.assign(gameState, {
        mode,
        topic,
        multiplier,
        history: [],
        points: 0,
        hits: 0,
        streak: 0,
        bestStreak: 0,
        lives: mode.lives,
        questionSeconds: mode.secondsPerQuestion ?? 0,
        questionSecondsMax: mode.secondsPerQuestion ?? 0,
        totalSeconds: mode.totalSeconds ?? 0,
        playing: true,
        reviewing: false,
        reviewIndex: 0,
    } satisfies GameState);
}

/** The question being played (the last of the history). */
export function currentRecord(): QuestionRecord | undefined {
    return gameState.history[gameState.history.length - 1];
}
