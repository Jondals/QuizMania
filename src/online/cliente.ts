/**
 * cliente.ts
 * Comunicación con las funciones del servidor (/api/…) para amigos y
 * clasificaciones.
 *
 * Identidad: la primera vez el navegador genera un id y un secreto al azar
 * y los guarda. Con ellos se registra el jugador en el servidor; no hay
 * contraseñas ni correo. (Si se borran los datos del navegador, se pierde
 * la cuenta.)
 *
 * Si el servidor no existe (por ejemplo, con `npm run dev`) o no tiene base
 * de datos, todo lanza ErrorOnline("no-disponible") y el juego sigue offline.
 */

import type { IdModo } from "../config/modos";
import { guardarDato, leerDatoGuardado } from "../utilidades/almacenamiento";

const CLAVE_IDENTIDAD = "online.identidad";
/** Tiempo máximo de una petición al servidor (ms). */
const TIEMPO_LIMITE = 8000;

/** Error de una llamada al servidor, con un código corto (p. ej. "codigo-no-existe"). */
export class ErrorOnline extends Error {
    constructor(readonly codigo: string) {
        super(codigo);
    }
}

/** Perfil público de un jugador. */
export interface JugadorPublico {
    id: string;
    nombre: string;
    avatar: string;
    color: string;
    codigo: string;
}

/** Fila de una clasificación. */
export interface FilaRanking {
    id: string;
    nombre: string;
    avatar: string;
    color: string;
    puntos: number | null;
    posicion: number | null;
    soyYo: boolean;
}

/** Clasificación de un modo. */
export interface Ranking {
    filas: FilaRanking[];
    misPuntos: number | null;
    miPosicion: number | null;
}

/** Datos de perfil que se envían al registrarse. */
export interface DatosPerfil {
    nombre: string;
    avatar: string;
    color: string;
}

interface Identidad {
    id: string;
    secreto: string;
}

/**
 * Genera un texto hexadecimal al azar.
 * @param bytes Número de bytes aleatorios.
 */
function hexAleatorio(bytes: number): string {
    return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Devuelve la identidad guardada, o crea una nueva. */
function obtenerIdentidad(): Identidad {
    const guardada = leerDatoGuardado<Identidad | null>(CLAVE_IDENTIDAD, null);
    if (guardada && /^[0-9a-f]{32}$/.test(guardada.id) && /^[0-9a-f]{64}$/.test(guardada.secreto)) {
        return guardada;
    }
    const nueva = { id: hexAleatorio(16), secreto: hexAleatorio(32) };
    guardarDato(CLAVE_IDENTIDAD, nueva);
    return nueva;
}

/** Id del jugador en el servidor (para marcar "tú" en las listas). */
export function obtenerMiId(): string {
    return obtenerIdentidad().id;
}

/**
 * Llama a una función del servidor.
 * @param ruta Ruta tras /api/ (con parámetros si hace falta).
 * @param metodo Método HTTP.
 * @param cuerpo Cuerpo JSON (opcional).
 */
async function llamar<T>(ruta: string, metodo = "GET", cuerpo?: unknown): Promise<T> {
    const { id, secreto } = obtenerIdentidad();
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), TIEMPO_LIMITE);
    let respuesta: Response;
    try {
        respuesta = await fetch(`/api/${ruta}`, {
            method: metodo,
            headers: {
                "Content-Type": "application/json",
                "x-quizmania-id": id,
                "x-quizmania-secreto": secreto,
            },
            body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
            signal: controlador.signal,
        });
    } catch {
        throw new ErrorOnline("no-disponible");
    } finally {
        clearTimeout(temporizador);
    }

    // Sin servidor (desarrollo local) la respuesta es HTML o un 404.
    if (!(respuesta.headers.get("content-type") ?? "").includes("application/json")) {
        throw new ErrorOnline("no-disponible");
    }
    const datos = (await respuesta.json()) as T & { error?: string };
    if (!respuesta.ok) {
        const codigo = datos.error ?? "error-interno";
        throw new ErrorOnline(codigo === "sin-base-de-datos" ? "no-disponible" : codigo);
    }
    return datos;
}

/** Último perfil enviado y el registro en curso (se hace una vez por visita). */
let perfilPendiente: DatosPerfil | null = null;
let registro: Promise<JugadorPublico> | null = null;

/**
 * Registra o actualiza el perfil en el servidor.
 * @param perfil Nombre y avatar.
 * @returns El perfil público (con el código de amigo).
 */
export function sincronizarPerfil(perfil: DatosPerfil): Promise<JugadorPublico> {
    perfilPendiente = perfil;
    registro = llamar<JugadorPublico>("jugador", "POST", perfil);
    registro.catch(() => {
        registro = null;
    });
    return registro;
}

/**
 * Llama al servidor asegurándose antes de que el jugador está registrado.
 * Si el servidor dice que no lo está (base de datos nueva), se registra y se repite.
 */
async function llamarRegistrado<T>(ruta: string, metodo = "GET", cuerpo?: unknown): Promise<T> {
    if (!perfilPendiente) {
        throw new ErrorOnline("sin-perfil");
    }
    await (registro ?? sincronizarPerfil(perfilPendiente));
    try {
        return await llamar<T>(ruta, metodo, cuerpo);
    } catch (error) {
        if (error instanceof ErrorOnline && error.codigo === "no-registrado") {
            await sincronizarPerfil(perfilPendiente);
            return llamar<T>(ruta, metodo, cuerpo);
        }
        throw error;
    }
}

/** Indica el perfil con el que registrarse (sin llamar todavía al servidor). */
export function prepararPerfil(perfil: DatosPerfil): void {
    perfilPendiente = perfil;
}

/** Lista de amigos. */
export async function listarAmigos(): Promise<JugadorPublico[]> {
    return (await llamarRegistrado<{ amigos: JugadorPublico[] }>("amigos")).amigos;
}

/**
 * Añade un amigo por su código.
 * @param codigo Código de amigo.
 */
export async function anadirAmigo(codigo: string): Promise<JugadorPublico> {
    return (await llamarRegistrado<{ amigo: JugadorPublico }>("amigos", "POST", { codigo })).amigo;
}

/**
 * Quita un amigo.
 * @param id Id del amigo.
 */
export async function quitarAmigo(id: string): Promise<void> {
    await llamarRegistrado(`amigos?id=${encodeURIComponent(id)}`, "DELETE");
}

/**
 * Envía la puntuación de una partida (el servidor solo guarda el récord).
 * @param modo Modo jugado.
 * @param puntos Puntos conseguidos.
 */
export async function enviarPuntuacion(modo: IdModo, puntos: number): Promise<void> {
    await llamarRegistrado("ranking", "POST", { modo, puntos });
}

/**
 * Pide la clasificación de un modo.
 * @param modo Modo.
 * @param ambito "amigos" (tú y tus amigos) o "global" (los 50 mejores).
 */
export function obtenerRanking(modo: IdModo, ambito: "amigos" | "global"): Promise<Ranking> {
    return llamarRegistrado<Ranking>(`ranking?modo=${modo}&ambito=${ambito}`);
}
