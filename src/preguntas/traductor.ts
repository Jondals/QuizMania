/**
 * traductor.ts
 * Traduce textos entre español e inglés usando servicios gratuitos sin clave:
 *   1. Google Translate (endpoint público "gtx"), todos los textos en una
 *      sola petición separados por saltos de línea.
 *   2. MyMemory (https://mymemory.translated.net) como respaldo, texto a texto.
 * Si los dos fallan se devuelven los textos originales: el juego nunca se
 * queda sin preguntas por culpa de la traducción.
 */

import type { Idioma } from "../i18n/textos";
import { descargarJson } from "../utilidades/red";

const URL_GOOGLE = "https://translate.googleapis.com/translate_a/single";
const URL_MYMEMORY = "https://api.mymemory.translated.net/get";
/** Longitud máxima de URL segura para una petición GET. */
const LONGITUD_MAXIMA_URL = 7000;

/** Respuesta de Google: [[["traducción","original",…], …], …]. */
type RespuestaGoogle = [[string, string, ...unknown[]][], ...unknown[]];

interface RespuestaMyMemory {
    responseStatus: number;
    responseData: { translatedText: string };
}

/**
 * Traduce un bloque de texto con Google Translate.
 * @param bloque Texto (puede tener varias líneas).
 * @param origen Idioma original.
 * @param destino Idioma al que traducir.
 */
async function traducirConGoogle(bloque: string, origen: Idioma, destino: Idioma): Promise<string> {
    const parametros = new URLSearchParams({ client: "gtx", sl: origen, tl: destino, dt: "t", q: bloque });
    const respuesta = await descargarJson<RespuestaGoogle>(`${URL_GOOGLE}?${parametros}`);
    return respuesta[0].map((segmento) => segmento[0]).join("");
}

/**
 * Traduce un texto corto con MyMemory.
 * @param textoOriginal Texto a traducir.
 * @param origen Idioma original.
 * @param destino Idioma al que traducir.
 */
async function traducirConMyMemory(textoOriginal: string, origen: Idioma, destino: Idioma): Promise<string> {
    const parametros = new URLSearchParams({ q: textoOriginal, langpair: `${origen}|${destino}` });
    const respuesta = await descargarJson<RespuestaMyMemory>(`${URL_MYMEMORY}?${parametros}`);
    if (respuesta.responseStatus !== 200) {
        throw new Error(`MyMemory respondió ${respuesta.responseStatus}`);
    }
    return respuesta.responseData.translatedText;
}

/**
 * Divide la lista de textos en grupos cuya URL no sea demasiado larga.
 * @param textos Textos a agrupar.
 */
function agruparPorLongitud(textos: readonly string[]): string[][] {
    const grupos: string[][] = [];
    let grupoActual: string[] = [];
    let longitudActual = 0;
    for (const textoOriginal of textos) {
        const longitudCodificada = encodeURIComponent(textoOriginal).length + 3;
        if (grupoActual.length > 0 && longitudActual + longitudCodificada > LONGITUD_MAXIMA_URL) {
            grupos.push(grupoActual);
            grupoActual = [];
            longitudActual = 0;
        }
        grupoActual.push(textoOriginal);
        longitudActual += longitudCodificada;
    }
    if (grupoActual.length > 0) {
        grupos.push(grupoActual);
    }
    return grupos;
}

/**
 * Traduce un grupo de textos con Google en una sola petición.
 * Si el número de líneas devueltas no coincide, se traduce texto a texto.
 * @param grupo Textos (sin saltos de línea internos).
 * @param origen Idioma original.
 * @param destino Idioma al que traducir.
 */
async function traducirGrupoConGoogle(grupo: string[], origen: Idioma, destino: Idioma): Promise<string[]> {
    const lineasTraducidas = (await traducirConGoogle(grupo.join("\n"), origen, destino)).split("\n");
    if (lineasTraducidas.length === grupo.length) {
        return lineasTraducidas.map((linea) => linea.trim());
    }
    return Promise.all(grupo.map((textoOriginal) => traducirConGoogle(textoOriginal, origen, destino)));
}

/**
 * Traduce una lista de textos manteniendo el orden.
 * @param textos Textos a traducir.
 * @param origen Idioma original.
 * @param destino Idioma al que traducir.
 * @returns Textos traducidos (o los originales si no se pudo traducir).
 */
export async function traducirTextos(textos: readonly string[], origen: Idioma, destino: Idioma): Promise<string[]> {
    if (origen === destino || textos.length === 0) {
        return [...textos];
    }
    // Los saltos de línea se usan como separador, así que se quitan de los textos.
    const textosLimpios = textos.map((textoOriginal) => textoOriginal.replace(/\s*\n\s*/g, " "));

    try {
        const grupos = agruparPorLongitud(textosLimpios);
        const gruposTraducidos = await Promise.all(grupos.map((grupo) => traducirGrupoConGoogle(grupo, origen, destino)));
        return gruposTraducidos.flat();
    } catch {
        // Google no disponible: se prueba MyMemory texto a texto.
    }

    return Promise.all(
        textosLimpios.map((textoOriginal) =>
            traducirConMyMemory(textoOriginal, origen, destino).catch(() => textoOriginal),
        ),
    );
}
