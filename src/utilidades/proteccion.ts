/**
 * proteccion.ts
 * Bloquea el menú del clic derecho (y la pulsación larga en móviles),
 * además de arrastrar imágenes. Funciona en Chrome, Edge, Firefox, Safari y Opera.
 * Nota: ninguna web puede impedirlo al 100% (se puede desactivar JavaScript),
 * pero en el uso normal el menú no aparece.
 */

/**
 * Indica si el elemento es un campo de texto, donde sí se permite el menú
 * contextual para poder pegar enlaces con el ratón.
 * @param elemento Elemento que recibió el evento.
 */
function esCampoDeTexto(elemento: EventTarget | null): boolean {
    return elemento instanceof HTMLInputElement || elemento instanceof HTMLTextAreaElement;
}

/**
 * Activa el bloqueo del menú contextual y del arrastre en todo el documento.
 */
export function bloquearClicDerecho(): void {
    document.addEventListener("contextmenu", (evento) => {
        if (!esCampoDeTexto(evento.target)) {
            evento.preventDefault();
        }
    });
    document.addEventListener("dragstart", (evento) => evento.preventDefault());
}
