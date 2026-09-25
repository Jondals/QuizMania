/**
 * dom.ts
 * Atajos para trabajar con el HTML de forma segura con tipos.
 */

/**
 * Busca un elemento por id y falla con un mensaje claro si no existe
 * (así un error en el HTML se detecta al arrancar, no a mitad de partida).
 * @param id Id del elemento.
 * @param tipo Clase esperada (por defecto HTMLElement).
 */
export function obtenerElemento<T extends HTMLElement = HTMLElement>(
    id: string,
    tipo: new () => T = HTMLElement as unknown as new () => T,
): T {
    const elemento = document.getElementById(id);
    if (!(elemento instanceof tipo)) {
        throw new Error(`Falta el elemento #${id} en el HTML`);
    }
    return elemento;
}
