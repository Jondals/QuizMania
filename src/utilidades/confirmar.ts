/**
 * confirmar.ts
 * Diálogo de confirmación con el estilo del juego (en lugar del
 * window.confirm del navegador, que no se puede personalizar).
 */

import { texto } from "../i18n/textos";
import { obtenerElemento } from "./dom";

const dialogo = obtenerElemento("dialogo-confirmar", HTMLDialogElement);
const titulo = obtenerElemento("confirmar-titulo");
const mensaje = obtenerElemento("confirmar-mensaje");
const botonAceptar = obtenerElemento("confirmar-aceptar", HTMLButtonElement);
const botonCancelar = obtenerElemento("confirmar-cancelar", HTMLButtonElement);

/** Opciones del diálogo. */
export interface OpcionesConfirmar {
    titulo: string;
    mensaje: string;
    /** Texto del botón de aceptar (por defecto "Aceptar"). */
    aceptar?: string;
    /** true = acción destructiva (el botón de aceptar sale en rojo). */
    peligroso?: boolean;
}

/**
 * Pregunta algo al jugador.
 * @param opciones Título, mensaje y texto del botón.
 * @returns true si acepta; false si cancela o cierra el diálogo.
 */
export function confirmar(opciones: OpcionesConfirmar): Promise<boolean> {
    titulo.textContent = opciones.titulo;
    mensaje.textContent = opciones.mensaje;
    botonAceptar.textContent = opciones.aceptar ?? texto("aceptar");
    botonCancelar.textContent = texto("cancelar");
    botonAceptar.classList.toggle("boton-peligro", opciones.peligroso === true);
    botonAceptar.classList.toggle("boton-rosa", opciones.peligroso !== true);

    return new Promise((resolver) => {
        let aceptado = false;
        const alAceptar = () => {
            aceptado = true;
            dialogo.close();
        };
        const alCancelar = () => dialogo.close();
        const alPulsarFondo = (evento: MouseEvent) => {
            if (evento.target === dialogo) dialogo.close();
        };
        const alCerrar = () => {
            botonAceptar.removeEventListener("click", alAceptar);
            botonCancelar.removeEventListener("click", alCancelar);
            dialogo.removeEventListener("click", alPulsarFondo);
            resolver(aceptado);
        };
        botonAceptar.addEventListener("click", alAceptar);
        botonCancelar.addEventListener("click", alCancelar);
        dialogo.addEventListener("click", alPulsarFondo);
        dialogo.addEventListener("close", alCerrar, { once: true });
        dialogo.showModal();
        botonCancelar.focus();
    });
}
