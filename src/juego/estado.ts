/**
 * estado.ts
 * Estado de la partida en curso: modo, tema, preguntas respondidas,
 * puntos, racha, vidas, tiempo que queda y si se está en modo revisión.
 */

import type { Modo } from "../config/modos";
import { MODOS } from "../config/modos";
import type { Tema } from "../config/temas";
import type { Pregunta } from "../preguntas/modelo";

/** Una pregunta que ha salido en la partida y lo que pasó con ella. */
export interface RegistroPregunta {
    pregunta: Pregunta;
    /** Respuesta elegida (posición), o null si no respondió (se acabó el tiempo). */
    elegida: number | null;
    /** true cuando ya se ha respondido o se ha agotado su tiempo. */
    respondida: boolean;
    acertada: boolean;
    /** Puntos que dio (0 si se falló). */
    puntos: number;
}

/** Datos de la partida en curso. */
export interface EstadoPartida {
    modo: Modo;
    tema: Tema | null;
    /** Preguntas que han salido, en orden. La última es la que se está jugando. */
    historial: RegistroPregunta[];
    puntos: number;
    aciertos: number;
    racha: number;
    mejorRacha: number;
    /** Vidas que quedan; null si el modo no tiene vidas. */
    vidas: number | null;
    /** Segundos que quedan para la pregunta actual (si el modo tiene tiempo por pregunta). */
    segundosPregunta: number;
    /** Segundos que quedan de partida (si el modo tiene tiempo total). */
    segundosTotales: number;
    /** true mientras se juega (no en resultados ni en revisión). */
    enJuego: boolean;
    enRevision: boolean;
    /** Posición de la pregunta que se revisa. */
    indiceRevision: number;
    /** true si alguna pregunta viene del respaldo local (sin conexión). */
    preguntasLocales: boolean;
}

/** Estado único de la partida. */
export const estadoPartida: EstadoPartida = {
    modo: MODOS[0],
    tema: null,
    historial: [],
    puntos: 0,
    aciertos: 0,
    racha: 0,
    mejorRacha: 0,
    vidas: null,
    segundosPregunta: 0,
    segundosTotales: 0,
    enJuego: false,
    enRevision: false,
    indiceRevision: 0,
    preguntasLocales: false,
};

/**
 * Deja el estado listo para una partida nueva.
 * @param modo Modo de juego.
 * @param tema Tema elegido en la tragaperras.
 */
export function empezarPartida(modo: Modo, tema: Tema): void {
    Object.assign(estadoPartida, {
        modo,
        tema,
        historial: [],
        puntos: 0,
        aciertos: 0,
        racha: 0,
        mejorRacha: 0,
        vidas: modo.vidas,
        segundosPregunta: modo.segundosPorPregunta ?? 0,
        segundosTotales: modo.segundosTotales ?? 0,
        enJuego: true,
        enRevision: false,
        indiceRevision: 0,
        preguntasLocales: false,
    } satisfies EstadoPartida);
}

/** Devuelve la pregunta que se está jugando (la última del historial). */
export function obtenerRegistroActual(): RegistroPregunta | undefined {
    return estadoPartida.historial[estadoPartida.historial.length - 1];
}
