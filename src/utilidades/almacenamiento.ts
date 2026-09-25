/**
 * almacenamiento.ts
 * Envoltorio seguro sobre localStorage. En modo incógnito, con las cookies
 * bloqueadas o en algunos navegadores embebidos, localStorage puede lanzar
 * excepciones; aquí se capturan para que el juego funcione igual (sin guardar).
 */

/** Prefijo común de todas las claves para no chocar con otras webs del mismo dominio. */
const PREFIJO_CLAVES = "quizmania.";

/**
 * Lee un valor JSON guardado.
 * @param clave Nombre de la clave (sin prefijo).
 * @param valorPorDefecto Valor que se devuelve si no existe o no se puede leer.
 * @returns El valor guardado o el valor por defecto.
 */
export function leerDatoGuardado<T>(clave: string, valorPorDefecto: T): T {
    try {
        const textoGuardado = window.localStorage.getItem(PREFIJO_CLAVES + clave);
        return textoGuardado === null ? valorPorDefecto : (JSON.parse(textoGuardado) as T);
    } catch {
        return valorPorDefecto;
    }
}

/**
 * Guarda un valor serializándolo a JSON. Si falla, se ignora en silencio.
 * @param clave Nombre de la clave (sin prefijo).
 * @param valor Valor a guardar.
 */
export function guardarDato<T>(clave: string, valor: T): void {
    try {
        window.localStorage.setItem(PREFIJO_CLAVES + clave, JSON.stringify(valor));
    } catch {
        // Sin almacenamiento disponible: el juego sigue funcionando sin recordar nada.
    }
}

/**
 * Borra un valor guardado.
 * @param clave Nombre de la clave (sin prefijo).
 */
export function borrarDato(clave: string): void {
    try {
        window.localStorage.removeItem(PREFIJO_CLAVES + clave);
    } catch {
        // Nada que hacer si el almacenamiento no está disponible.
    }
}
