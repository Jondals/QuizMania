/**
 * modos.ts
 * Los modos de juego: cuántas preguntas hay, cuántas vidas, si hay tiempo
 * límite por pregunta o para toda la partida, la dificultad y si los
 * puntos valen doble. Los ids deben coincidir con los que acepta la
 * función registrar_partida de supabase/schema.sql.
 */

import type { Idioma } from "../i18n/textos";

/** Identificador de un modo de juego. */
export type IdModo =
    | "clasico"
    | "relampago"
    | "contrarreloj"
    | "supervivencia"
    | "muerte-subita"
    | "experto"
    | "ruleta"
    | "maraton"
    | "racha"
    | "todo-o-nada";

/** Reglas de un modo de juego. */
export interface Modo {
    id: IdModo;
    icono: string;
    nombre: Record<Idioma, string>;
    descripcion: Record<Idioma, string>;
    /** Número de preguntas; null = infinitas (hasta perder o acabar el tiempo). */
    totalPreguntas: number | null;
    /** Vidas; null = los fallos no quitan vidas. */
    vidas: number | null;
    /** Segundos para responder cada pregunta; null = sin límite. */
    segundosPorPregunta: number | null;
    /** Segundos para toda la partida; null = sin límite. */
    segundosTotales: number | null;
    /** Segundos que se restan del tiempo total al fallar. */
    penalizacionPorFallo: number;
    /** Multiplicador de los puntos de cada acierto. */
    multiplicador: number;
    /** Dificultad de las preguntas online (null = cualquiera). */
    dificultad: "hard" | null;
    /** true = cada pregunta es de un tema distinto (la tragaperras no elige tema). */
    temasMezclados: boolean;
    /** true = al fallar se pierden todos los puntos de la partida. */
    perderTodoAlFallar: boolean;
}

/** Valores por defecto de un modo (cada modo cambia solo lo suyo). */
const BASE = {
    totalPreguntas: null,
    vidas: null,
    segundosPorPregunta: null,
    segundosTotales: null,
    penalizacionPorFallo: 0,
    multiplicador: 1,
    dificultad: null,
    temasMezclados: false,
    perderTodoAlFallar: false,
} as const;

/** Todos los modos, en el orden en que se muestran. */
export const MODOS: readonly Modo[] = [
    {
        ...BASE,
        id: "clasico",
        icono: "🎯",
        nombre: { es: "Clásico", en: "Classic" },
        descripcion: { es: "10 preguntas sin prisa", en: "10 questions, no rush" },
        totalPreguntas: 10,
    },
    {
        ...BASE,
        id: "relampago",
        icono: "⚡",
        nombre: { es: "Relámpago", en: "Lightning" },
        descripcion: { es: "10 preguntas, 10 s cada una", en: "10 questions, 10 s each" },
        totalPreguntas: 10,
        segundosPorPregunta: 10,
    },
    {
        ...BASE,
        id: "contrarreloj",
        icono: "⏱️",
        nombre: { es: "Contrarreloj", en: "Time attack" },
        descripcion: { es: "60 s en total, cada fallo resta 3 s", en: "60 s in total, each miss costs 3 s" },
        segundosTotales: 60,
        penalizacionPorFallo: 3,
    },
    {
        ...BASE,
        id: "supervivencia",
        icono: "❤️",
        nombre: { es: "Supervivencia", en: "Survival" },
        descripcion: { es: "Preguntas infinitas hasta perder 3 vidas", en: "Endless questions until you lose 3 lives" },
        vidas: 3,
    },
    {
        ...BASE,
        id: "muerte-subita",
        icono: "💀",
        nombre: { es: "Muerte súbita", en: "Sudden death" },
        descripcion: { es: "1 vida y 15 s por pregunta", en: "1 life, 15 s per question" },
        vidas: 1,
        segundosPorPregunta: 15,
    },
    {
        ...BASE,
        id: "experto",
        icono: "🧠",
        nombre: { es: "Experto", en: "Expert" },
        descripcion: { es: "10 preguntas difíciles, puntos ×2", en: "10 hard questions, double points" },
        totalPreguntas: 10,
        multiplicador: 2,
        dificultad: "hard",
    },
    {
        ...BASE,
        id: "ruleta",
        icono: "🌀",
        nombre: { es: "Ruleta", en: "Roulette" },
        descripcion: { es: "15 preguntas de temas mezclados", en: "15 questions from mixed topics" },
        totalPreguntas: 15,
        temasMezclados: true,
    },
    {
        ...BASE,
        id: "maraton",
        icono: "🏃",
        nombre: { es: "Maratón", en: "Marathon" },
        descripcion: { es: "30 preguntas, 20 s cada una y 5 vidas", en: "30 questions, 20 s each, 5 lives" },
        totalPreguntas: 30,
        vidas: 5,
        segundosPorPregunta: 20,
    },
    {
        ...BASE,
        id: "racha",
        icono: "🔥",
        nombre: { es: "Racha", en: "Streak" },
        descripcion: { es: "Sin tiempo, pero el primer fallo termina", en: "No timer, but the first miss ends it" },
        vidas: 1,
    },
    {
        ...BASE,
        id: "todo-o-nada",
        icono: "🎰",
        nombre: { es: "Todo o nada", en: "All or nothing" },
        descripcion: {
            es: "10 preguntas con puntos ×2, pero un fallo y lo pierdes todo",
            en: "10 questions, double points, but one miss and you lose it all",
        },
        totalPreguntas: 10,
        vidas: 1,
        multiplicador: 2,
        perderTodoAlFallar: true,
    },
];

/**
 * Busca un modo por id (si no existe, el clásico).
 * @param id Id del modo.
 */
export function buscarModo(id: string): Modo {
    return MODOS.find((modo) => modo.id === id) ?? MODOS[0];
}
