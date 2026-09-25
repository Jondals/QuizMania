/**
 * aleatorio.ts
 * Utilidades de azar: barajar listas y elegir un elemento al azar.
 */

/**
 * Devuelve una copia de la lista con los elementos en orden aleatorio
 * (algoritmo de Fisher-Yates, todas las permutaciones son igual de probables).
 * @param lista Lista original (no se modifica).
 * @returns Nueva lista barajada.
 */
export function barajar<T>(lista: readonly T[]): T[] {
    const copia = [...lista];
    for (let posicion = copia.length - 1; posicion > 0; posicion--) {
        const posicionAleatoria = Math.floor(Math.random() * (posicion + 1));
        [copia[posicion], copia[posicionAleatoria]] = [copia[posicionAleatoria], copia[posicion]];
    }
    return copia;
}

/**
 * Elige un elemento al azar de una lista no vacía.
 * @param lista Lista de la que elegir.
 * @returns Un elemento de la lista.
 */
export function elegirAlAzar<T>(lista: readonly T[]): T {
    return lista[Math.floor(Math.random() * lista.length)];
}

/**
 * Espera el número de milisegundos indicado.
 * @param milisegundos Tiempo de espera.
 */
export function esperar(milisegundos: number): Promise<void> {
    return new Promise((resolver) => setTimeout(resolver, milisegundos));
}
