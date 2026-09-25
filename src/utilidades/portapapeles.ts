/**
 * portapapeles.ts
 * Copiar texto al portapapeles sin fallar si el navegador no lo permite.
 */

/**
 * Copia un texto al portapapeles.
 * @param contenido Texto a copiar.
 * @returns true si se copió.
 */
export async function copiarAlPortapapeles(contenido: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(contenido);
        return true;
    } catch {
        return false;
    }
}
