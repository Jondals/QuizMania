/**
 * modes.ts
 * Game modes. There are ten of them and each one really changes how you play:
 *   🎯 Classic       10 questions, no clock.
 *   ⏱️ Time attack   60 s: every hit adds time and every miss takes it away.
 *   ❤️ Survival      Endless, 3 lives and 20 s per question.
 *   💣 Bomb          One life; the per-question clock gets shorter with every hit.
 *   🎰 Double        Double points, endless: cash out in time, one miss loses it all.
 *   ⚡ Blitz         10 questions with only 6 s each.
 *   ☠️ Sudden death  Endless and without a clock, but the first miss ends it.
 *   🌓 50/50         Only two answers per question, 8 s to pick one.
 *   🏃 Marathon      25 questions and 3 lives to reach the finish line.
 *   📈 Climb         Every hit in a row is worth 25 % more (up to ×2).
 * Plus ⚔️ Versus (VERSUS_MODE), which the slot machine never picks: it's
 * played when challenging a friend (see online/versus.ts).
 *
 * The ids are stored in the database, so they keep their original Spanish
 * values and must match the list accepted by registrar_partida in
 * supabase/schema.sql (a test checks it).
 */

import type { Language } from "../i18n/texts";

/** Game mode identifier (stored in the database). */
export type ModeId =
    | "clasico"
    | "contrarreloj"
    | "supervivencia"
    | "bomba"
    | "doble-o-nada"
    | "relampago"
    | "muerte-subita"
    | "cincuenta"
    | "maraton"
    | "escalada"
    | "versus";

/** Rules of a game mode. */
export interface Mode {
    id: ModeId;
    icon: string;
    /** Colour of its plate on the reel. */
    color: string;
    name: Record<Language, string>;
    /** Short name printed on the reel plate. */
    short: Record<Language, string>;
    description: Record<Language, string>;
    /** Number of questions; null = endless (until you lose or the time runs out). */
    totalQuestions: number | null;
    /** Lives; null = misses don't cost lives. */
    lives: number | null;
    /** Seconds to answer each question; null = no limit. */
    secondsPerQuestion: number | null;
    /** Seconds taken off each question's clock per hit (Bomb). */
    reductionPerHit: number;
    /** Minimum time per question even after reductions (s). */
    minimumSeconds: number;
    /** Seconds for the whole game; null = no limit. */
    totalSeconds: number | null;
    /** Seconds added to the total time on a hit. */
    bonusPerHit: number;
    /** Seconds taken from the total time on a miss. */
    penaltyPerMiss: number;
    /** Points multiplier of the mode itself (the reel multiplier is applied on top). */
    multiplier: number;
    /** true = every question comes from a different topic. */
    mixedTopics: boolean;
    /** true = a miss loses every point of the game (you can cash out before). */
    loseAllOnMiss: boolean;
    /** Answers shown per question (the rest are removed); null = all of them. */
    answersShown: number | null;
    /** Extra points share per hit in a row (Climb); 0 = no climb. */
    climbPerHit: number;
}

/** Default values (each mode only changes what it needs). */
const BASE = {
    totalQuestions: null,
    lives: null,
    secondsPerQuestion: null,
    reductionPerHit: 0,
    minimumSeconds: 0,
    totalSeconds: null,
    bonusPerHit: 0,
    penaltyPerMiss: 0,
    multiplier: 1,
    mixedTopics: false,
    loseAllOnMiss: false,
    answersShown: null,
    climbPerHit: 0,
} as const;

/** Highest factor Climb can reach (keeps a hit under the database's 2,500 cap). */
export const MAX_CLIMB = 2;

/** The modes on the slot machine's second reel, in reel order. */
export const MODES: readonly Mode[] = [
    {
        ...BASE,
        id: "clasico",
        icon: "🎯",
        color: "#19f5c8",
        name: { es: "Clásico", en: "Classic" },
        short: { es: "Clásico", en: "Classic" },
        description: { es: "10 preguntas, sin reloj ni prisas", en: "10 questions, no clock, no rush" },
        totalQuestions: 10,
    },
    {
        ...BASE,
        id: "contrarreloj",
        icon: "⏱️",
        color: "#22e5ff",
        name: { es: "Contrarreloj", en: "Time attack" },
        short: { es: "Reloj", en: "Clock" },
        description: { es: "60 s: acertar suma 3 s, fallar resta 5 s", en: "60 s: a hit adds 3 s, a miss costs 5 s" },
        totalSeconds: 60,
        bonusPerHit: 3,
        penaltyPerMiss: 5,
    },
    {
        ...BASE,
        id: "supervivencia",
        icon: "❤️",
        color: "#ff2e7e",
        name: { es: "Supervivencia", en: "Survival" },
        short: { es: "Vidas", en: "Lives" },
        description: { es: "Sin fin: 3 vidas y 20 s por pregunta", en: "Endless: 3 lives, 20 s per question" },
        lives: 3,
        secondsPerQuestion: 20,
    },
    {
        ...BASE,
        id: "bomba",
        icon: "💣",
        color: "#ff8a3d",
        name: { es: "Bomba", en: "Bomb" },
        short: { es: "Bomba", en: "Bomb" },
        description: { es: "Cada acierto acorta la mecha 1 s. Un fallo y ¡bum!", en: "Every hit burns 1 s off the fuse. One miss and boom!" },
        lives: 1,
        secondsPerQuestion: 15,
        reductionPerHit: 1,
        minimumSeconds: 4,
    },
    {
        ...BASE,
        id: "doble-o-nada",
        icon: "🎰",
        color: "#ffd84d",
        name: { es: "Doble o nada", en: "Double or nothing" },
        short: { es: "Doble", en: "Double" },
        description: { es: "Puntos ×2. Plántate a tiempo: un fallo y lo pierdes todo", en: "Double points. Cash out in time: one miss and you lose it all" },
        lives: 1,
        secondsPerQuestion: 20,
        multiplier: 2,
        loseAllOnMiss: true,
    },
    {
        ...BASE,
        id: "relampago",
        icon: "⚡",
        color: "#b4f34d",
        name: { es: "Relámpago", en: "Blitz" },
        short: { es: "Rayo", en: "Blitz" },
        description: { es: "10 preguntas a toda pastilla: solo 6 s para cada una", en: "10 questions at full speed: just 6 s each" },
        totalQuestions: 10,
        secondsPerQuestion: 6,
    },
    {
        ...BASE,
        id: "muerte-subita",
        icon: "☠️",
        color: "#a78bfa",
        name: { es: "Muerte súbita", en: "Sudden death" },
        short: { es: "Súbita", en: "Sudden" },
        description: { es: "Sin fin y sin reloj, pero el primer fallo acaba la partida", en: "Endless and no clock, but your first miss ends it" },
        lives: 1,
    },
    {
        ...BASE,
        id: "cincuenta",
        icon: "🌓",
        color: "#6c8cff",
        name: { es: "50/50", en: "50/50" },
        short: { es: "50/50", en: "50/50" },
        description: { es: "Solo dos respuestas por pregunta, pero 8 s para elegir", en: "Only two answers per question, but just 8 s to pick" },
        totalQuestions: 10,
        secondsPerQuestion: 8,
        answersShown: 2,
    },
    {
        ...BASE,
        id: "maraton",
        icon: "🏃",
        color: "#ff6b6b",
        name: { es: "Maratón", en: "Marathon" },
        short: { es: "Maratón", en: "Marathon" },
        description: { es: "25 preguntas y 3 vidas para llegar a la meta", en: "25 questions and 3 lives to reach the finish line" },
        totalQuestions: 25,
        lives: 3,
        secondsPerQuestion: 25,
    },
    {
        ...BASE,
        id: "escalada",
        icon: "📈",
        color: "#e879f9",
        name: { es: "Escalada", en: "Climb" },
        short: { es: "Escalada", en: "Climb" },
        description: { es: "12 preguntas: cada acierto seguido vale un 25 % más (hasta ×2)", en: "12 questions: every hit in a row is worth 25 % more (up to ×2)" },
        totalQuestions: 12,
        climbPerHit: 0.25,
    },
];

/** Versus: 10 mixed-topic questions, 15 s each. The same ones for both players. */
export const VERSUS_MODE: Mode = {
    ...BASE,
    id: "versus",
    icon: "⚔️",
    color: "#a78bfa",
    name: { es: "Versus", en: "Versus" },
    short: { es: "Versus", en: "Versus" },
    description: { es: "Las mismas 10 preguntas para los dos", en: "The same 10 questions for both" },
    totalQuestions: 10,
    secondsPerQuestion: 15,
    mixedTopics: true,
};

/**
 * Finds a mode by id (falls back to Classic).
 * @param id Mode id.
 */
export function findMode(id: string): Mode {
    if (id === VERSUS_MODE.id) return VERSUS_MODE;
    return MODES.find((mode) => mode.id === id) ?? MODES[0];
}

/**
 * Seconds for the next question, given the hits so far (Bomb shortens it).
 * @param mode Game mode.
 * @param hits Correct answers so far.
 * @returns Seconds, or null if the mode has no per-question clock.
 */
export function secondsForQuestion(mode: Mode, hits: number): number | null {
    if (mode.secondsPerQuestion === null) return null;
    return Math.max(mode.minimumSeconds, mode.secondsPerQuestion - hits * mode.reductionPerHit);
}

/**
 * Points factor of the next hit in Climb: +climbPerHit for every hit in a
 * row before it, capped at MAX_CLIMB. Other modes always return 1.
 * @param mode Game mode.
 * @param streak Consecutive hits including the one being scored (1 = first).
 */
export function climbFactor(mode: Mode, streak: number): number {
    if (mode.climbPerHit <= 0) return 1;
    return Math.min(MAX_CLIMB, 1 + Math.max(streak - 1, 0) * mode.climbPerHit);
}
