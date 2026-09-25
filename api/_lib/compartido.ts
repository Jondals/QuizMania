/**
 * compartido.ts
 * Reglas comunes al juego (navegador) y a las funciones del servidor:
 * modos con clasificación, avatares y colores permitidos, formato de los
 * códigos de amigo y validación de nombres y puntuaciones. Así el servidor
 * rechaza exactamente lo mismo que la interfaz no deja enviar.
 * (Los archivos de api/ que empiezan por "_" no se publican como funciones.)
 */

/** Modos de juego que tienen clasificación. */
export const IDS_MODOS = ["clasico", "relampago", "contrarreloj", "supervivencia", "muerte-subita"] as const;

/** Identificador de un modo de juego. */
export type IdModo = (typeof IDS_MODOS)[number];

/** Emojis que se pueden elegir como avatar. */
export const AVATARES = [
    "🦊", "🐱", "🐶", "🐼", "🐸", "🐙", "🦄", "🐲",
    "🦁", "🐯", "🐨", "🐵", "🦉", "🐧", "🦈", "🐝",
    "👾", "🤖", "👽", "👻", "💀", "🎃", "🥷", "🧙",
    "🧛", "🧜", "🦸", "🧑‍🚀", "😎", "🤓", "🔥", "⭐",
] as const;

/** Colores de fondo del avatar. */
export const COLORES_AVATAR = ["#ff2e7e", "#19f5c8", "#ffd84d", "#22e5ff", "#a78bfa", "#ff8a3d", "#4ade80", "#f472b6"] as const;

/** Letras de los códigos de amigo (sin 0/O ni 1/I/L, que se confunden). */
export const ALFABETO_CODIGO = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const LONGITUD_CODIGO = 6;
export const LONGITUD_MAXIMA_NOMBRE = 20;
/** Puntuación máxima que se acepta (por encima es trampa o un error). */
export const PUNTOS_MAXIMOS = 1_000_000;
/** Máximo de amigos por jugador. */
export const MAXIMO_AMIGOS = 200;

/**
 * Indica si un valor es un modo de juego con clasificación.
 * @param valor Valor a comprobar.
 */
export function esModoValido(valor: unknown): valor is IdModo {
    return typeof valor === "string" && (IDS_MODOS as readonly string[]).includes(valor);
}

/**
 * Indica si un valor es uno de los avatares permitidos.
 * @param valor Valor a comprobar.
 */
export function esAvatarValido(valor: unknown): valor is string {
    return typeof valor === "string" && (AVATARES as readonly string[]).includes(valor);
}

/**
 * Indica si un valor es uno de los colores de avatar permitidos.
 * @param valor Valor a comprobar.
 */
export function esColorValido(valor: unknown): valor is string {
    return typeof valor === "string" && (COLORES_AVATAR as readonly string[]).includes(valor);
}

/**
 * Limpia un nombre de jugador: quita caracteres de control, junta espacios
 * y lo recorta.
 * @param valor Nombre escrito por el jugador.
 * @returns El nombre limpio, o null si queda vacío o no es texto.
 */
export function limpiarNombre(valor: unknown): string | null {
    if (typeof valor !== "string") {
        return null;
    }
    const limpio = [...valor.replace(/[\u0000-\u001f\u007f-\u009f<>]/g, "").replace(/\s+/g, " ").trim()]
        .slice(0, LONGITUD_MAXIMA_NOMBRE)
        .join("")
        .trim();
    return limpio.length > 0 ? limpio : null;
}

/**
 * Normaliza un código de amigo escrito a mano (mayúsculas, sin espacios ni guiones).
 * @param valor Código escrito.
 * @returns El código normalizado, o null si no tiene el formato correcto.
 */
export function normalizarCodigo(valor: unknown): string | null {
    if (typeof valor !== "string") {
        return null;
    }
    const codigo = valor.toUpperCase().replace(/[\s-]/g, "");
    const formato = new RegExp(`^[${ALFABETO_CODIGO}]{${LONGITUD_CODIGO}}$`);
    return formato.test(codigo) ? codigo : null;
}

/**
 * Indica si una puntuación es un entero razonable.
 * @param valor Puntuación recibida.
 */
export function esPuntuacionValida(valor: unknown): valor is number {
    return typeof valor === "number" && Number.isInteger(valor) && valor >= 0 && valor <= PUNTOS_MAXIMOS;
}
