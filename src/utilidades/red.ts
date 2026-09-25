/**
 * red.ts
 * Peticiones HTTP con tiempo límite, para que una API lenta no deje
 * el juego colgado en la pantalla de carga.
 */

/** Tiempo máximo por defecto de una petición (ms). */
const TIEMPO_LIMITE_POR_DEFECTO = 8000;

/**
 * Descarga una URL y devuelve el cuerpo como JSON.
 * Lanza un error si la respuesta no es 2xx o si se supera el tiempo límite.
 * @param url Dirección a descargar.
 * @param tiempoLimite Milisegundos antes de cancelar.
 */
export async function descargarJson<T>(url: string, tiempoLimite = TIEMPO_LIMITE_POR_DEFECTO): Promise<T> {
    const respuesta = await descargarConTiempoLimite(url, tiempoLimite);
    return (await respuesta.json()) as T;
}

/**
 * Descarga una URL y devuelve el cuerpo como texto.
 * @param url Dirección a descargar.
 * @param tiempoLimite Milisegundos antes de cancelar.
 */
export async function descargarTexto(url: string, tiempoLimite = TIEMPO_LIMITE_POR_DEFECTO): Promise<string> {
    const respuesta = await descargarConTiempoLimite(url, tiempoLimite);
    return respuesta.text();
}

/**
 * Hace un fetch que se cancela solo al pasar el tiempo límite.
 * @param url Dirección a descargar.
 * @param tiempoLimite Milisegundos antes de cancelar.
 */
async function descargarConTiempoLimite(url: string, tiempoLimite: number): Promise<Response> {
    const controlador = new AbortController();
    const temporizador = setTimeout(() => controlador.abort(), tiempoLimite);
    try {
        const respuesta = await fetch(url, { signal: controlador.signal });
        if (!respuesta.ok) {
            throw new Error(`HTTP ${respuesta.status} en ${url}`);
        }
        return respuesta;
    } finally {
        clearTimeout(temporizador);
    }
}
