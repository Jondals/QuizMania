/**
 * modelo.ts
 * Forma común de una pregunta, venga de la API que venga o del JSON local.
 */

import type { Idioma } from "../i18n/textos";

/** Una de las respuestas posibles de una pregunta. */
export interface Respuesta {
    texto: string;
    esCorrecta: boolean;
}

/** Una pregunta con su enunciado y sus respuestas (ya barajadas). */
export interface Pregunta {
    enunciado: string;
    respuestas: Respuesta[];
    /** Idioma en el que están los textos ahora mismo. */
    idioma?: Idioma;
    /**
     * La pregunta tal como llegó (sin traducir). Se guarda para poder
     * cambiar de idioma a mitad de partida traduciendo siempre desde el
     * original, sin ir perdiendo calidad al traducir traducciones.
     */
    original?: Pregunta;
}

/** Número de preguntas que se piden de cada vez (en los modos infinitos se piden más según hacen falta). */
export const PREGUNTAS_POR_LOTE = 10;
