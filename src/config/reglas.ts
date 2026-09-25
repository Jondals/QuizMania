/**
 * reglas.ts
 * Reglas de las cuentas. Deben coincidir con las de supabase/schema.sql.
 */

/** Usuario: 3-20 letras minúsculas sin acentos, números o guion bajo. */
export const FORMATO_USUARIO = /^[a-z0-9_]{3,20}$/;
/** Longitud mínima de la contraseña (la de Supabase por defecto). */
export const LONGITUD_MINIMA_CONTRASENA = 6;
/**
 * Dominio del correo interno: Supabase necesita un correo, así que el juego
 * usa "<usuario>@quizmania.app". Nunca se envía nada a esa dirección.
 */
export const DOMINIO_CORREO_INTERNO = "quizmania.app";

/**
 * Normaliza lo que escribe el jugador como usuario (minúsculas, sin espacios).
 * @param texto Usuario escrito.
 */
export function normalizarUsuario(texto: string): string {
    return texto.trim().toLowerCase();
}

/**
 * Indica si un usuario tiene el formato permitido.
 * @param usuario Usuario ya normalizado.
 */
export function esUsuarioValido(usuario: string): boolean {
    return FORMATO_USUARIO.test(usuario);
}

/**
 * Correo interno de un usuario.
 * @param usuario Usuario ya normalizado.
 */
export function correoInterno(usuario: string): string {
    return `${usuario}@${DOMINIO_CORREO_INTERNO}`;
}
