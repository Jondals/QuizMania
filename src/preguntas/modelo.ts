/**
 * modelo.ts
 * Forma común de una pregunta, venga de la API que venga o del JSON local.
 */

/** Una de las respuestas posibles de una pregunta. */
export interface Respuesta {
    texto: string;
    esCorrecta: boolean;
}

/** Una pregunta con su enunciado y sus respuestas (ya barajadas). */
export interface Pregunta {
    enunciado: string;
    respuestas: Respuesta[];
}

/** Número de preguntas que se piden de cada vez (en los modos infinitos se piden más según hacen falta). */
export const PREGUNTAS_POR_LOTE = 10;
