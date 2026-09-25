/**
 * proveedor-local.ts
 * Lee las preguntas guardadas en public/preguntas/*.json (en español).
 * Es el respaldo cuando no hay conexión o las APIs fallan.
 *
 * Formato: una lista de preguntas, cada una
 *   ["¿Enunciado?", "Respuesta correcta", "Incorrecta", "Incorrecta", "Incorrecta"]
 */

import { barajar } from "../utilidades/aleatorio";
import { descargarJson } from "../utilidades/red";
import type { Pregunta } from "./modelo";

/** Pregunta tal como está en el JSON: enunciado, correcta e incorrectas. */
export type PreguntaCompacta = [string, string, ...string[]];

/**
 * Convierte una pregunta del JSON al formato del juego (respuestas barajadas).
 * @param compacta Pregunta del JSON.
 */
export function convertirPreguntaCompacta([enunciado, correcta, ...incorrectas]: PreguntaCompacta): Pregunta {
    return {
        enunciado,
        respuestas: barajar([
            { texto: correcta, esCorrecta: true },
            ...incorrectas.map((incorrecta) => ({ texto: incorrecta, esCorrecta: false })),
        ]),
    };
}

/** Archivos ya descargados (no se vuelven a pedir en la misma visita). */
const cache = new Map<string, Promise<PreguntaCompacta[]>>();

/**
 * Carga todas las preguntas de uno o varios archivos locales.
 * Los archivos que fallen se ignoran; si fallan todos, se lanza un error.
 * @param archivos Rutas de los JSON.
 * @returns Preguntas en español, con las respuestas barajadas.
 */
export async function cargarPreguntasLocales(archivos: readonly string[]): Promise<Pregunta[]> {
    const listas = await Promise.all(
        archivos.map((archivo) => {
            let promesa = cache.get(archivo);
            if (!promesa) {
                promesa = descargarJson<PreguntaCompacta[]>(archivo);
                promesa.catch(() => cache.delete(archivo));
                cache.set(archivo, promesa);
            }
            return promesa.catch(() => [] as PreguntaCompacta[]);
        }),
    );
    const preguntas = listas.flat().map(convertirPreguntaCompacta);
    if (preguntas.length === 0) {
        throw new Error("No se pudieron cargar las preguntas locales");
    }
    return preguntas;
}
