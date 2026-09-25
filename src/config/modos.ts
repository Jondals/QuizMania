/**
 * modos.ts
 * Los modos de juego: cuántas preguntas hay, cuántas vidas, y si hay tiempo
 * límite por pregunta o para toda la partida.
 */

import type { IdModo } from "../../api/_lib/compartido";
import type { Idioma } from "../i18n/textos";

export type { IdModo };

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
}

/** Todos los modos, en el orden en que se muestran. */
export const MODOS: readonly Modo[] = [
    {
        id: "clasico",
        icono: "🎯",
        nombre: { es: "Clásico", en: "Classic" },
        descripcion: { es: "10 preguntas sin prisa", en: "10 questions, no rush" },
        totalPreguntas: 10,
        vidas: null,
        segundosPorPregunta: null,
        segundosTotales: null,
        penalizacionPorFallo: 0,
    },
    {
        id: "relampago",
        icono: "⚡",
        nombre: { es: "Relámpago", en: "Lightning" },
        descripcion: { es: "10 preguntas, 10 s cada una", en: "10 questions, 10 s each" },
        totalPreguntas: 10,
        vidas: null,
        segundosPorPregunta: 10,
        segundosTotales: null,
        penalizacionPorFallo: 0,
    },
    {
        id: "contrarreloj",
        icono: "⏱️",
        nombre: { es: "Contrarreloj", en: "Time attack" },
        descripcion: { es: "60 s, cada fallo resta 3 s", en: "60 s, each miss costs 3 s" },
        totalPreguntas: null,
        vidas: null,
        segundosPorPregunta: null,
        segundosTotales: 60,
        penalizacionPorFallo: 3,
    },
    {
        id: "supervivencia",
        icono: "❤️",
        nombre: { es: "Supervivencia", en: "Survival" },
        descripcion: { es: "Infinitas hasta perder 3 vidas", en: "Endless until you lose 3 lives" },
        totalPreguntas: null,
        vidas: 3,
        segundosPorPregunta: null,
        segundosTotales: null,
        penalizacionPorFallo: 0,
    },
    {
        id: "muerte-subita",
        icono: "💀",
        nombre: { es: "Muerte súbita", en: "Sudden death" },
        descripcion: { es: "1 vida y 15 s por pregunta", en: "1 life, 15 s per question" },
        totalPreguntas: null,
        vidas: 1,
        segundosPorPregunta: 15,
        segundosTotales: null,
        penalizacionPorFallo: 0,
    },
];

/**
 * Busca un modo por id (si no existe, el clásico).
 * @param id Id del modo.
 */
export function buscarModo(id: string): Modo {
    return MODOS.find((modo) => modo.id === id) ?? MODOS[0];
}
