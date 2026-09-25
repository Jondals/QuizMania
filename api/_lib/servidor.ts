/**
 * servidor.ts
 * Utilidades de las funciones del servidor (Vercel):
 *   - redis(): envía comandos a Upstash Redis por su API REST (sin dependencias).
 *   - responder(): envuelve cada función y convierte los errores en JSON.
 *   - autenticar(): comprueba el id y el secreto del jugador.
 *
 * La base de datos se configura en Vercel → Storage → Upstash Redis, que
 * crea solas las variables KV_REST_API_URL y KV_REST_API_TOKEN.
 */

/** Error con código HTTP y un código corto que entiende el navegador. */
export class ErrorHttp extends Error {
    constructor(
        readonly estado: number,
        readonly codigo: string,
    ) {
        super(codigo);
    }
}

const URL_REDIS = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const TOKEN_REDIS = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

/** Un comando de Redis, por ejemplo ["SET", "clave", "valor"]. */
export type ComandoRedis = (string | number)[];

/**
 * Ejecuta varios comandos de Redis en una sola petición (pipeline).
 * @param comandos Comandos a ejecutar en orden.
 * @returns El resultado de cada comando.
 */
export async function redis(comandos: ComandoRedis[]): Promise<unknown[]> {
    if (!URL_REDIS || !TOKEN_REDIS) {
        throw new ErrorHttp(503, "sin-base-de-datos");
    }
    if (comandos.length === 0) {
        return [];
    }
    const respuesta = await fetch(`${URL_REDIS}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TOKEN_REDIS}`, "Content-Type": "application/json" },
        body: JSON.stringify(comandos),
    });
    if (!respuesta.ok) {
        throw new Error(`Redis respondió HTTP ${respuesta.status}`);
    }
    const resultados = (await respuesta.json()) as { result?: unknown; error?: string }[];
    return resultados.map((resultado) => {
        if (resultado.error) {
            throw new Error(`Redis: ${resultado.error}`);
        }
        return resultado.result;
    });
}

/**
 * Crea una respuesta JSON.
 * @param datos Cuerpo.
 * @param estado Código HTTP.
 */
export function json(datos: unknown, estado = 200): Response {
    return new Response(JSON.stringify(datos), {
        status: estado,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
    });
}

/**
 * Ejecuta el manejador y convierte cualquier error en una respuesta JSON
 * con { error: "codigo" }.
 * @param manejador Lógica de la función.
 */
export async function responder(manejador: () => Promise<unknown>): Promise<Response> {
    try {
        return json(await manejador());
    } catch (error) {
        if (error instanceof ErrorHttp) {
            return json({ error: error.codigo }, error.estado);
        }
        console.error(error);
        return json({ error: "error-interno" }, 500);
    }
}

/**
 * Lee el cuerpo JSON de la petición.
 * @param peticion Petición recibida.
 */
export async function leerCuerpo(peticion: Request): Promise<Record<string, unknown>> {
    try {
        const cuerpo: unknown = await peticion.json();
        if (cuerpo && typeof cuerpo === "object") {
            return cuerpo as Record<string, unknown>;
        }
    } catch {
        // Cuerpo vacío o mal formado.
    }
    throw new ErrorHttp(400, "cuerpo-no-valido");
}

/**
 * Calcula el SHA-256 de un texto en hexadecimal.
 * @param texto Texto a resumir.
 */
async function sha256(texto: string): Promise<string> {
    const resumen = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
    return [...new Uint8Array(resumen)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Credenciales que manda el navegador en las cabeceras. */
export interface Credenciales {
    id: string;
    resumenSecreto: string;
}

/**
 * Lee y valida las cabeceras de identidad (no comprueba si el jugador existe).
 * El secreto nunca se guarda: solo su resumen SHA-256.
 * @param peticion Petición recibida.
 */
export async function leerCredenciales(peticion: Request): Promise<Credenciales> {
    const id = peticion.headers.get("x-quizmania-id") ?? "";
    const secreto = peticion.headers.get("x-quizmania-secreto") ?? "";
    if (!/^[0-9a-f]{32}$/.test(id) || !/^[0-9a-f]{64}$/.test(secreto)) {
        throw new ErrorHttp(401, "sin-credenciales");
    }
    return { id, resumenSecreto: await sha256(secreto) };
}

/**
 * Comprueba que el jugador existe y que su secreto es el correcto.
 * @param peticion Petición recibida.
 * @returns El id del jugador.
 */
export async function autenticar(peticion: Request): Promise<string> {
    const { id, resumenSecreto } = await leerCredenciales(peticion);
    const [guardado] = await redis([["HGET", claveJugador(id), "secreto"]]);
    if (guardado === null) {
        throw new ErrorHttp(401, "no-registrado");
    }
    if (guardado !== resumenSecreto) {
        throw new ErrorHttp(403, "secreto-incorrecto");
    }
    return id;
}

/** Clave del perfil de un jugador. */
export const claveJugador = (id: string) => `jugador:${id}`;
/** Clave que traduce un código de amigo a un id. */
export const claveCodigo = (codigo: string) => `codigo:${codigo}`;
/** Clave del conjunto de amigos de un jugador. */
export const claveAmigos = (id: string) => `amigos:${id}`;
/** Clave de la clasificación de un modo. */
export const claveRanking = (modo: string) => `ranking:${modo}`;

/** Datos públicos de un jugador. */
export interface PerfilPublico {
    id: string;
    nombre: string;
    avatar: string;
    color: string;
    codigo: string;
}

/**
 * Lee los perfiles públicos de varios jugadores (los que no existan se omiten).
 * @param ids Ids de los jugadores.
 */
export async function leerPerfiles(ids: readonly string[]): Promise<Map<string, PerfilPublico>> {
    const resultados = await redis(ids.map((id) => ["HMGET", claveJugador(id), "nombre", "avatar", "color", "codigo"]));
    const perfiles = new Map<string, PerfilPublico>();
    resultados.forEach((resultado, posicion) => {
        const [nombre, avatar, color, codigo] = resultado as (string | null)[];
        if (nombre && codigo) {
            perfiles.set(ids[posicion], { id: ids[posicion], nombre, avatar: avatar ?? "🦊", color: color ?? "#ff2e7e", codigo });
        }
    });
    return perfiles;
}
