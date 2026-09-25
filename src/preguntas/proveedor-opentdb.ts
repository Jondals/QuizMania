/**
 * proveedor-opentdb.ts
 * Descarga preguntas de Open Trivia DB (https://opentdb.com), en inglés.
 * Usa un "token de sesión" guardado en el navegador: mientras el token viva,
 * la API no devuelve nunca una pregunta repetida. Cuando se agotan las
 * preguntas de una categoría, se reinicia el token y se vuelve a empezar.
 */

import { barajar, esperar } from "../utilidades/aleatorio";
import { borrarDato, guardarDato, leerDatoGuardado } from "../utilidades/almacenamiento";
import { descargarJson } from "../utilidades/red";
import type { Pregunta } from "./modelo";

const URL_API = "https://opentdb.com";
const CLAVE_TOKEN = "opentdb.token";
const MAXIMO_INTENTOS = 4;
/** La API solo permite una petición cada 5 segundos por IP. */
const ESPERA_POR_LIMITE_DE_PETICIONES = 5200;

/** Códigos de respuesta documentados de la API. */
const enum CodigoOpenTdb {
    Correcto = 0,
    SinResultados = 1,
    ParametroInvalido = 2,
    TokenNoEncontrado = 3,
    TokenAgotado = 4,
    DemasiadasPeticiones = 5,
}

interface RespuestaPreguntasOpenTdb {
    response_code: number;
    results: {
        question: string;
        correct_answer: string;
        incorrect_answers: string[];
    }[];
}

interface RespuestaTokenOpenTdb {
    response_code: number;
    token: string;
}

/**
 * Pide un token de sesión nuevo y lo guarda.
 * @returns El token nuevo.
 */
async function pedirTokenNuevo(): Promise<string> {
    const respuesta = await descargarJson<RespuestaTokenOpenTdb>(`${URL_API}/api_token.php?command=request`);
    guardarDato(CLAVE_TOKEN, respuesta.token);
    return respuesta.token;
}

/**
 * Reinicia el token actual para que vuelva a dar preguntas ya vistas
 * (solo se hace cuando no quedan preguntas nuevas).
 * @param token Token a reiniciar.
 */
async function reiniciarToken(token: string): Promise<void> {
    await descargarJson(`${URL_API}/api_token.php?command=reset&token=${encodeURIComponent(token)}`);
}

/**
 * Decodifica un texto que la API envía en formato URL (RFC 3986).
 * @param textoCodificado Texto codificado.
 */
function decodificar(textoCodificado: string): string {
    return decodeURIComponent(textoCodificado).trim();
}

/**
 * Descarga preguntas nuevas (nunca vistas con este token) de Open Trivia DB.
 * @param cantidad Número de preguntas.
 * @param categoria Id de categoría de Open Trivia DB; sin categoría = cualquiera.
 * @param dificultad "hard" para pedir solo preguntas difíciles; null = cualquiera.
 * @returns Preguntas en inglés con las respuestas barajadas.
 */
export async function descargarPreguntasOpenTdb(
    cantidad: number,
    categoria?: number,
    dificultad: "hard" | null = null,
): Promise<Pregunta[]> {
    let token = leerDatoGuardado<string | null>(CLAVE_TOKEN, null) ?? (await pedirTokenNuevo());

    for (let intento = 1; intento <= MAXIMO_INTENTOS; intento++) {
        const parametros = new URLSearchParams({
            amount: String(cantidad),
            type: "multiple",
            encode: "url3986",
            token,
        });
        if (categoria !== undefined) {
            parametros.set("category", String(categoria));
        }
        if (dificultad) {
            parametros.set("difficulty", dificultad);
        }

        const respuesta = await descargarJson<RespuestaPreguntasOpenTdb>(`${URL_API}/api.php?${parametros}`);

        switch (respuesta.response_code) {
            case CodigoOpenTdb.Correcto:
                return respuesta.results.map((resultado) => ({
                    enunciado: decodificar(resultado.question),
                    respuestas: barajar([
                        { texto: decodificar(resultado.correct_answer), esCorrecta: true },
                        ...resultado.incorrect_answers.map((incorrecta) => ({
                            texto: decodificar(incorrecta),
                            esCorrecta: false,
                        })),
                    ]),
                }));

            case CodigoOpenTdb.SinResultados:
            case CodigoOpenTdb.TokenAgotado:
                // Ya se han visto todas las preguntas de la categoría: se empieza de nuevo.
                await reiniciarToken(token);
                await esperar(ESPERA_POR_LIMITE_DE_PETICIONES);
                break;

            case CodigoOpenTdb.TokenNoEncontrado:
                // El token caduca tras 6 horas sin uso.
                borrarDato(CLAVE_TOKEN);
                token = await pedirTokenNuevo();
                break;

            case CodigoOpenTdb.DemasiadasPeticiones:
                await esperar(ESPERA_POR_LIMITE_DE_PETICIONES);
                break;

            default:
                throw new Error(`Open Trivia DB respondió con el código ${respuesta.response_code}`);
        }
    }
    throw new Error("Open Trivia DB no devolvió preguntas tras varios intentos");
}
