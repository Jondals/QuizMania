/**
 * sesion.ts
 * Cuenta del jugador con Supabase: registro y entrada con usuario y
 * contraseña (sin correo), salir, cambiar la contraseña, foto de perfil,
 * puntos acumulados y récords de cada modo.
 *
 * Supabase pide un correo, así que se usa uno interno "<usuario>@quizmania.app"
 * (ver config/reglas.ts). Hay que desactivar "Confirm email" en Supabase.
 *
 * Cada cambio de sesión o de perfil lanza EVENTO_SESION en document para
 * que la interfaz se repinte.
 */

import type { IdModo } from "../config/modos";
import {
    correoInterno,
    esUsuarioValido,
    LONGITUD_MINIMA_CONTRASENA,
    normalizarUsuario,
} from "../config/reglas";
import { BUCKET_AVATARES, supabase, URL_SUPABASE } from "./supabase";

/** Evento que se lanza en document al entrar, salir o cambiar el perfil. */
export const EVENTO_SESION = "quizmania:sesion";

/** Lado de la foto de perfil que se sube (px). */
const LADO_AVATAR = 256;
/** Tamaño máximo de la imagen que elige el jugador (antes de reducirla). */
const TAMANO_MAXIMO_IMAGEN = 15 * 1024 * 1024;

/** Datos del jugador con sesión iniciada. */
export interface Perfil {
    id: string;
    usuario: string;
    /** Nombre visible elegido por el jugador (null = se enseña el usuario). */
    nombre: string | null;
    avatarVersion: number | null;
    puntosTotales: number;
    partidas: number;
    aciertos: number;
    preguntas: number;
}

/** Resultado de guardar una partida en el servidor. */
export interface ResultadoPartidaOnline {
    anterior: number;
    mejor: number;
    nuevoRecord: boolean;
    puntosTotales: number;
}

/** Error de cuenta con un código corto que la interfaz traduce. */
export class ErrorCuenta extends Error {
    constructor(readonly codigo: string) {
        super(codigo);
    }
}

let perfil: Perfil | null = null;
/** Récords del jugador en el servidor, por modo. */
let recordsOnline = new Map<string, { mejor: number; partidas: number }>();

/** Longitud máxima del nombre visible (igual que en la base de datos). */
export const LONGITUD_MAXIMA_NOMBRE = 24;

/**
 * Nombre que se enseña de un jugador: su nombre visible o, si no tiene, su usuario.
 * @param jugador Usuario y nombre.
 */
export function nombreVisible(jugador: { usuario: string; nombre?: string | null }): string {
    return jugador.nombre?.trim() || jugador.usuario;
}

/** Indica si el juego tiene Supabase configurado. */
export function hayOnline(): boolean {
    return supabase !== null;
}

/** Perfil del jugador con sesión iniciada, o null si juega como invitado. */
export function obtenerPerfil(): Perfil | null {
    return perfil;
}

/** Récord en el servidor de un modo (solo con sesión iniciada). */
export function obtenerRecordOnline(modo: IdModo | "total"): { mejor: number; partidas: number } {
    return recordsOnline.get(modo) ?? { mejor: 0, partidas: 0 };
}

/**
 * URL pública de la foto de un jugador.
 * @param id Id del jugador.
 * @param version Versión de la foto (null = no tiene).
 */
export function urlAvatar(id: string, version: number | null): string | null {
    return version === null || !URL_SUPABASE
        ? null
        : `${URL_SUPABASE}/storage/v1/object/public/${BUCKET_AVATARES}/${id}/avatar?v=${version}`;
}

/** Avisa a la interfaz de que la sesión o el perfil han cambiado. */
function avisarCambio(): void {
    document.dispatchEvent(new CustomEvent(EVENTO_SESION));
}

/** Devuelve el cliente o lanza un error si no hay Supabase. */
function cliente() {
    if (!supabase) {
        throw new ErrorCuenta("sin-servidor");
    }
    return supabase;
}

/**
 * Convierte un error de Supabase en un ErrorCuenta con código conocido.
 * @param error Error recibido.
 */
function traducirError(error: { message?: string; code?: string } | null): ErrorCuenta {
    const mensaje = (error?.message ?? "").toLowerCase();
    const codigo = error?.code ?? "";
    if (mensaje.includes("invalid login credentials") || codigo === "invalid_credentials") return new ErrorCuenta("credenciales");
    if (mensaje.includes("already registered") || codigo === "user_already_exists") return new ErrorCuenta("usuario-ocupado");
    if (mensaje.includes("password") && (mensaje.includes("short") || mensaje.includes("weak") || mensaje.includes("least"))) {
        return new ErrorCuenta("contrasena-corta");
    }
    if (mensaje.includes("email not confirmed")) return new ErrorCuenta("confirmacion-activada");
    if (codigo === "over_email_send_rate_limit" || mensaje.includes("email rate limit") || mensaje.includes("sending confirmation")) {
        // Supabase intenta enviar el correo de confirmación: hay que desactivar "Confirm email".
        return new ErrorCuenta("confirmacion-activada");
    }
    if (mensaje.includes("rate limit") || codigo === "over_request_rate_limit") return new ErrorCuenta("demasiados-intentos");
    if (mensaje.includes("failed to fetch") || mensaje.includes("network")) return new ErrorCuenta("sin-conexion");
    // Las funciones de la base de datos lanzan códigos cortos como "usuario-no-existe".
    const codigoPropio = mensaje.match(/^[a-z-]+$/)?.[0];
    return new ErrorCuenta(codigoPropio ?? "desconocido");
}

/** Descarga el perfil y los récords del jugador con sesión. */
async function cargarPerfil(id: string): Promise<void> {
    const db = cliente();
    const [respuestaPerfil, respuestaRecords] = await Promise.all([
        db
            .from("perfiles")
            .select("id, usuario, nombre, avatar_version, puntos_totales, partidas, aciertos, preguntas")
            .eq("id", id)
            .single(),
        db.from("records").select("modo, mejor, partidas").eq("usuario_id", id),
    ]);
    if (respuestaPerfil.error || !respuestaPerfil.data) {
        throw traducirError(respuestaPerfil.error);
    }
    const datos = respuestaPerfil.data;
    perfil = {
        id: datos.id,
        usuario: datos.usuario,
        nombre: datos.nombre ?? null,
        avatarVersion: datos.avatar_version,
        puntosTotales: Number(datos.puntos_totales),
        partidas: datos.partidas,
        aciertos: datos.aciertos,
        preguntas: datos.preguntas,
    };
    recordsOnline = new Map(
        (respuestaRecords.data ?? []).map((fila) => [fila.modo, { mejor: fila.mejor, partidas: fila.partidas }]),
    );
    avisarCambio();
}

/** Recupera la sesión guardada en el navegador (si la hay). */
export async function recuperarSesion(): Promise<void> {
    if (!supabase) {
        return;
    }
    const { data } = await supabase.auth.getSession();
    if (data.session) {
        try {
            await cargarPerfil(data.session.user.id);
        } catch {
            // Sesión caducada o perfil borrado: se juega como invitado.
            await supabase.auth.signOut().catch(() => {});
            perfil = null;
            avisarCambio();
        }
    }
}

/**
 * Comprueba usuario y contraseña antes de enviarlos.
 * @returns El usuario normalizado.
 */
function validarCredenciales(usuarioEscrito: string, contrasena: string): string {
    const usuario = normalizarUsuario(usuarioEscrito);
    if (!esUsuarioValido(usuario)) throw new ErrorCuenta("usuario-no-valido");
    if (contrasena.length < LONGITUD_MINIMA_CONTRASENA) throw new ErrorCuenta("contrasena-corta");
    return usuario;
}

/**
 * Entra con usuario y contraseña.
 * @param usuarioEscrito Usuario tal como lo escribió el jugador.
 * @param contrasena Contraseña.
 */
export async function entrar(usuarioEscrito: string, contrasena: string): Promise<void> {
    const usuario = validarCredenciales(usuarioEscrito, contrasena);
    const { data, error } = await cliente().auth.signInWithPassword({ email: correoInterno(usuario), password: contrasena });
    if (error || !data.user) {
        throw traducirError(error);
    }
    await cargarPerfil(data.user.id);
}

/**
 * Crea una cuenta nueva y entra con ella.
 * @param usuarioEscrito Usuario elegido.
 * @param contrasena Contraseña.
 */
export async function registrarse(usuarioEscrito: string, contrasena: string): Promise<void> {
    const usuario = validarCredenciales(usuarioEscrito, contrasena);
    const db = cliente();

    const disponible = await db.rpc("usuario_disponible", { p_usuario: usuario });
    if (disponible.error) throw traducirError(disponible.error);
    if (disponible.data === false) throw new ErrorCuenta("usuario-ocupado");

    const { data, error } = await db.auth.signUp({
        email: correoInterno(usuario),
        password: contrasena,
        options: { data: { usuario } },
    });
    if (error) throw traducirError(error);
    if (data.session && data.user) {
        await cargarPerfil(data.user.id);
        return;
    }
    // Con "Confirm email" activado Supabase no devuelve sesión, aunque la base
    // de datos ya confirma la cuenta sola (trigger confirmar_usuario): se entra.
    await entrar(usuario, contrasena);
}

/**
 * Cambia el nombre visible (vacío = volver a enseñar el usuario).
 * @param nombre Nombre nuevo.
 */
export async function cambiarNombre(nombre: string): Promise<void> {
    if (!perfil) throw new ErrorCuenta("no-autenticado");
    const limpio = nombre.replace(/[\u0000-\u001f<>]/g, "").trim();
    if ([...limpio].length > LONGITUD_MAXIMA_NOMBRE) throw new ErrorCuenta("nombre-no-valido");
    const { data, error } = await cliente().rpc("cambiar_nombre", { p_nombre: limpio });
    if (error) throw traducirError(error);
    perfil = { ...perfil, nombre: (data as string | null) ?? null };
    avisarCambio();
}

/** Cierra la sesión (se sigue jugando como invitado). */
export async function salir(): Promise<void> {
    await cliente().auth.signOut();
    perfil = null;
    recordsOnline = new Map();
    avisarCambio();
}

/**
 * Cambia la contraseña del jugador con sesión.
 * @param nueva Contraseña nueva.
 */
export async function cambiarContrasena(nueva: string): Promise<void> {
    if (nueva.length < LONGITUD_MINIMA_CONTRASENA) throw new ErrorCuenta("contrasena-corta");
    const { error } = await cliente().auth.updateUser({ password: nueva });
    if (error) throw traducirError(error);
}

/**
 * Recorta la imagen al centro en un cuadrado y la reduce a LADO_AVATAR px.
 * @param archivo Imagen elegida por el jugador.
 * @returns La imagen en WebP (o PNG si el navegador no sabe hacer WebP).
 */
async function prepararImagen(archivo: File): Promise<Blob> {
    if (!archivo.type.startsWith("image/")) throw new ErrorCuenta("imagen-no-valida");
    if (archivo.size > TAMANO_MAXIMO_IMAGEN) throw new ErrorCuenta("imagen-grande");

    let imagen: ImageBitmap;
    try {
        imagen = await createImageBitmap(archivo);
    } catch {
        throw new ErrorCuenta("imagen-no-valida");
    }
    const lado = Math.min(imagen.width, imagen.height);
    const lienzo = document.createElement("canvas");
    lienzo.width = LADO_AVATAR;
    lienzo.height = LADO_AVATAR;
    const pincel = lienzo.getContext("2d");
    if (!pincel) throw new ErrorCuenta("imagen-no-valida");
    pincel.imageSmoothingQuality = "high";
    pincel.drawImage(
        imagen,
        (imagen.width - lado) / 2,
        (imagen.height - lado) / 2,
        lado,
        lado,
        0,
        0,
        LADO_AVATAR,
        LADO_AVATAR,
    );
    imagen.close();
    return new Promise((resolver, rechazar) => {
        lienzo.toBlob((blob) => (blob ? resolver(blob) : rechazar(new ErrorCuenta("imagen-no-valida"))), "image/webp", 0.85);
    });
}

/**
 * Sube una foto de perfil nueva (recortada y reducida).
 * @param archivo Imagen elegida.
 */
export async function subirAvatar(archivo: File): Promise<void> {
    if (!perfil) throw new ErrorCuenta("no-autenticado");
    const db = cliente();
    const imagen = await prepararImagen(archivo);
    const { error } = await db.storage
        .from(BUCKET_AVATARES)
        .upload(`${perfil.id}/avatar`, imagen, { upsert: true, contentType: imagen.type, cacheControl: "31536000" });
    if (error) throw traducirError(error);
    const version = await db.rpc("avatar_actualizado");
    if (version.error) throw traducirError(version.error);
    perfil = { ...perfil, avatarVersion: version.data as number };
    avisarCambio();
}

/** Borra la foto de perfil. */
export async function quitarAvatar(): Promise<void> {
    if (!perfil) throw new ErrorCuenta("no-autenticado");
    const db = cliente();
    await db.storage.from(BUCKET_AVATARES).remove([`${perfil.id}/avatar`]);
    const { error } = await db.rpc("quitar_avatar");
    if (error) throw traducirError(error);
    perfil = { ...perfil, avatarVersion: null };
    avisarCambio();
}

/** Datos de una partida terminada. */
export interface DatosPartida {
    modo: IdModo;
    tema: string;
    puntos: number;
    aciertos: number;
    total: number;
}

/**
 * Guarda una partida en el servidor: suma los puntos al total y actualiza el récord.
 * @param partida Datos de la partida.
 */
export async function registrarPartidaOnline(partida: DatosPartida): Promise<ResultadoPartidaOnline> {
    if (!perfil) throw new ErrorCuenta("no-autenticado");
    const { data, error } = await cliente().rpc("registrar_partida", {
        p_modo: partida.modo,
        p_tema: partida.tema,
        p_puntos: partida.puntos,
        p_aciertos: partida.aciertos,
        p_total: partida.total,
    });
    if (error) throw traducirError(error);
    const resultado = data as { anterior: number; mejor: number; nuevo_record: boolean; puntos_totales: number };

    const anterior = recordsOnline.get(partida.modo);
    recordsOnline.set(partida.modo, { mejor: resultado.mejor, partidas: (anterior?.partidas ?? 0) + 1 });
    perfil = {
        ...perfil,
        puntosTotales: Number(resultado.puntos_totales),
        partidas: perfil.partidas + 1,
        aciertos: perfil.aciertos + partida.aciertos,
        preguntas: perfil.preguntas + partida.total,
    };
    avisarCambio();
    return {
        anterior: resultado.anterior,
        mejor: resultado.mejor,
        nuevoRecord: resultado.nuevo_record,
        puntosTotales: Number(resultado.puntos_totales),
    };
}
