/**
 * /api/ranking
 * POST: { modo, puntos } guarda la puntuación si supera el récord del jugador.
 * GET:  ?modo=…&ambito=amigos|global devuelve la clasificación del modo:
 *       "amigos" = el jugador y todos sus amigos; "global" = los 50 mejores.
 */

import { esModoValido, esPuntuacionValida } from "./_lib/compartido.js";
import {
    autenticar,
    claveAmigos,
    claveRanking,
    ErrorHttp,
    leerCuerpo,
    leerPerfiles,
    redis,
    responder,
} from "./_lib/servidor.js";

/** Filas que se devuelven en la clasificación global. */
const TAMANO_GLOBAL = 50;

/** Una fila de la clasificación. */
interface Fila {
    id: string;
    nombre: string;
    avatar: string;
    color: string;
    puntos: number | null;
    posicion: number | null;
    soyYo: boolean;
}

/**
 * Convierte un valor de Redis (texto o null) en número o null.
 * @param valor Valor devuelto por Redis.
 */
function aNumero(valor: unknown): number | null {
    return valor === null || valor === undefined ? null : Number(valor);
}

export function POST(peticion: Request): Promise<Response> {
    return responder(async () => {
        const id = await autenticar(peticion);
        const { modo, puntos } = await leerCuerpo(peticion);
        if (!esModoValido(modo) || !esPuntuacionValida(puntos)) {
            throw new ErrorHttp(400, "puntuacion-no-valida");
        }
        // GT: solo se actualiza si la puntuación nueva es mayor que la guardada.
        const [, mejor, rango] = await redis([
            ["ZADD", claveRanking(modo), "GT", puntos, id],
            ["ZSCORE", claveRanking(modo), id],
            ["ZREVRANK", claveRanking(modo), id],
        ]);
        return { mejor: aNumero(mejor), posicionGlobal: rango === null ? null : Number(rango) + 1 };
    });
}

export function GET(peticion: Request): Promise<Response> {
    return responder(async () => {
        const id = await autenticar(peticion);
        const parametros = new URL(peticion.url).searchParams;
        const modo = parametros.get("modo");
        if (!esModoValido(modo)) {
            throw new ErrorHttp(400, "modo-no-valido");
        }
        const clave = claveRanking(modo);

        if (parametros.get("ambito") === "global") {
            const [plano, miPuntuacion, miRango] = await redis([
                ["ZREVRANGE", clave, 0, TAMANO_GLOBAL - 1, "WITHSCORES"],
                ["ZSCORE", clave, id],
                ["ZREVRANK", clave, id],
            ]);
            const lista = plano as string[];
            const ids: string[] = [];
            const puntos: number[] = [];
            for (let posicion = 0; posicion < lista.length; posicion += 2) {
                ids.push(lista[posicion]);
                puntos.push(Number(lista[posicion + 1]));
            }
            const perfiles = await leerPerfiles(ids);
            const filas: Fila[] = ids.flatMap((idFila, posicion) => {
                const perfil = perfiles.get(idFila);
                return perfil
                    ? [{ ...perfil, puntos: puntos[posicion], posicion: posicion + 1, soyYo: idFila === id }]
                    : [];
            });
            return {
                filas,
                misPuntos: aNumero(miPuntuacion),
                miPosicion: miRango === null ? null : Number(miRango) + 1,
            };
        }

        const [idsAmigos] = (await redis([["SMEMBERS", claveAmigos(id)]])) as string[][];
        const ids = [id, ...idsAmigos];
        const [puntuaciones] = (await redis([["ZMSCORE", clave, ...ids]])) as (string | null)[][];
        const perfiles = await leerPerfiles(ids);
        const filas: Fila[] = ids
            .flatMap((idFila, posicion) => {
                const perfil = perfiles.get(idFila);
                return perfil ? [{ ...perfil, puntos: aNumero(puntuaciones[posicion]), posicion: null, soyYo: idFila === id }] : [];
            })
            .sort((a, b) => (b.puntos ?? -1) - (a.puntos ?? -1));
        filas.forEach((fila, posicion) => {
            fila.posicion = fila.puntos === null ? null : posicion + 1;
        });
        const yo = filas.find((fila) => fila.soyYo);
        return { filas, misPuntos: yo?.puntos ?? null, miPosicion: yo?.posicion ?? null };
    });
}
