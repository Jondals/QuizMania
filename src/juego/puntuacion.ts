/**
 * puntuacion.ts
 * Cuántos puntos da cada acierto:
 *   - 100 puntos base.
 *   - Racha: +20 por cada acierto seguido a partir del segundo (máximo +100).
 *   - Rapidez (solo en modos con tiempo por pregunta): hasta +50 según el
 *     tiempo que sobre.
 *   - Todo se multiplica por el multiplicador del modo (×2 en Experto).
 * Máximo por acierto: 250 × 2 = 500 (lo comprueba también la base de datos).
 * Los fallos no quitan puntos (pero cortan la racha).
 */

export const PUNTOS_BASE = 100;
export const PUNTOS_POR_RACHA = 20;
export const BONUS_RACHA_MAXIMO = 100;
export const BONUS_RAPIDEZ_MAXIMO = 50;

/** Datos del acierto para calcular sus puntos. */
export interface DatosAcierto {
    /** Aciertos seguidos contando este (1 = primer acierto de la racha). */
    racha: number;
    /** Segundos que quedaban al responder (si hay tiempo por pregunta). */
    segundosRestantes?: number;
    /** Segundos por pregunta del modo (si los hay). */
    segundosPorPregunta?: number | null;
    /** Multiplicador del modo (1 por defecto). */
    multiplicador?: number;
}

/**
 * Calcula los puntos de un acierto.
 * @param datos Racha y tiempo del acierto.
 */
export function calcularPuntosAcierto({
    racha,
    segundosRestantes = 0,
    segundosPorPregunta = null,
    multiplicador = 1,
}: DatosAcierto): number {
    const bonusRacha = Math.min(Math.max(racha - 1, 0) * PUNTOS_POR_RACHA, BONUS_RACHA_MAXIMO);
    const bonusRapidez = segundosPorPregunta
        ? Math.round(BONUS_RAPIDEZ_MAXIMO * Math.min(Math.max(segundosRestantes / segundosPorPregunta, 0), 1))
        : 0;
    return (PUNTOS_BASE + bonusRacha + bonusRapidez) * multiplicador;
}

/**
 * Formatea una puntuación con separador de miles (también con 4 cifras,
 * que toLocaleString("es") deja sin separar).
 * @param puntos Puntos.
 * @param idioma Idioma de la interfaz.
 */
export function formatearPuntos(puntos: number, idioma: "es" | "en"): string {
    return String(Math.round(puntos)).replace(/\B(?=(\d{3})+(?!\d))/g, idioma === "es" ? "." : ",");
}
