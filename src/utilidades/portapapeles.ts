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
        // Sin contexto seguro (http, IP de la red local) no existe la API
        // moderna: se prueba el método clásico de seleccionar y copiar.
        return copiarConSeleccion(contenido);
    }
}

/**
 * Copia con un cuadro de texto temporal y execCommand (funciona en http).
 * @param contenido Texto a copiar.
 * @returns true si se copió.
 */
function copiarConSeleccion(contenido: string): boolean {
    const cuadro = document.createElement("textarea");
    cuadro.value = contenido;
    cuadro.setAttribute("readonly", "");
    cuadro.style.position = "fixed";
    cuadro.style.top = "-1000px";
    cuadro.style.opacity = "0";
    cuadro.style.userSelect = "text";
    document.body.append(cuadro);
    let copiado = false;
    try {
        cuadro.select();
        copiado = document.execCommand("copy");
    } catch {
        copiado = false;
    }
    cuadro.remove();
    return copiado;
}
