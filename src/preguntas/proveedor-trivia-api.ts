/**
 * proveedor-trivia-api.ts
 * Descarga preguntas de The Trivia API (https://the-trivia-api.com), en inglés.
 * Se usa para los temas que Open Trivia DB no tiene (por ejemplo, Comida).
 * Esta API no tiene tokens, así que se guardan en el navegador los ids de las
 * preguntas ya vistas y se descartan para no repetirlas.
 */

import { barajar } from "../utilidades/aleatorio";
import { guardarDato, leerDatoGuardado } from "../utilidades/almacenamiento";
import { descargarJson } from "../utilidades/red";
import type { Pregunta } from "./modelo";

const URL_API = "https://the-trivia-api.com/v2/questions";
/** Máximo de preguntas que la API devuelve por petición. */
const PREGUNTAS_POR_PETICION = 50;
const MAXIMO_INTENTOS = 3;
/** Límite de ids recordados para no llenar el almacenamiento. */
const MAXIMO_IDS_RECORDADOS = 5000;

interface PreguntaTriviaApi {
    id: string;
    question: { text: string };
    correctAnswer: string;
    incorrectAnswers: string[];
}

/**
 * Clave de almacenamiento de los ids vistos de una categoría.
 * @param categoria Categoría de la API.
 */
function claveIdsVistos(categoria: string): string {
    return `trivia-api.vistas.${categoria}`;
}

/**
 * Descarga preguntas que el jugador no haya visto antes.
 * Si tras varios intentos no quedan suficientes preguntas nuevas, se olvida
 * el historial de la categoría y se empieza de nuevo.
 * @param cantidad Número de preguntas.
 * @param categoria Categoría de The Trivia API (p. ej. "food_and_drink").
 * @returns Preguntas en inglés con las respuestas barajadas.
 */
export async function descargarPreguntasTriviaApi(cantidad: number, categoria: string): Promise<Pregunta[]> {
    const idsVistos = new Set(leerDatoGuardado<string[]>(claveIdsVistos(categoria), []));
    const elegidas = new Map<string, PreguntaTriviaApi>();

    for (let intento = 1; intento <= MAXIMO_INTENTOS && elegidas.size < cantidad; intento++) {
        const parametros = new URLSearchParams({ categories: categoria, limit: String(PREGUNTAS_POR_PETICION) });
        const lote = await descargarJson<PreguntaTriviaApi[]>(`${URL_API}?${parametros}`);
        for (const pregunta of lote) {
            if (elegidas.size < cantidad && !idsVistos.has(pregunta.id)) {
                elegidas.set(pregunta.id, pregunta);
            }
        }
    }

    let historial = [...idsVistos];
    if (elegidas.size < cantidad) {
        // Casi todo el banco ya se ha visto: se reinicia el historial.
        historial = [];
    }
    historial.push(...elegidas.keys());
    guardarDato(claveIdsVistos(categoria), historial.slice(-MAXIMO_IDS_RECORDADOS));

    if (elegidas.size === 0) {
        throw new Error("The Trivia API no devolvió preguntas");
    }

    return [...elegidas.values()].map((pregunta) => ({
        enunciado: pregunta.question.text.trim(),
        respuestas: barajar([
            { texto: pregunta.correctAnswer.trim(), esCorrecta: true },
            ...pregunta.incorrectAnswers.map((incorrecta) => ({ texto: incorrecta.trim(), esCorrecta: false })),
        ]),
    }));
}
