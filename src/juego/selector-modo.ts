/**
 * selector-modo.ts
 * Botones de la portada para elegir el modo de juego antes de tirar de la
 * palanca. El modo elegido se recuerda para la próxima visita y debajo se
 * enseña el récord personal de ese modo.
 */

import type { Modo } from "../config/modos";
import { buscarModo, MODOS } from "../config/modos";
import { EVENTO_IDIOMA_CAMBIADO, obtenerIdioma, texto } from "../i18n/textos";
import { leerRecord } from "../perfil/records";
import { guardarDato, leerDatoGuardado } from "../utilidades/almacenamiento";
import { obtenerElemento } from "../utilidades/dom";
import { formatearPuntos } from "./puntuacion";

const CLAVE_MODO = "modo";

const contenedor = obtenerElemento("selector-modo");
const descripcionModo = obtenerElemento("descripcion-modo");
const recordInicio = obtenerElemento("record-inicio");

let modoElegido: Modo = buscarModo(leerDatoGuardado(CLAVE_MODO, "clasico"));

/** Devuelve el modo elegido. */
export function obtenerModoElegido(): Modo {
    return modoElegido;
}

/** Pinta los botones (textos, selección) y el récord del modo elegido. */
export function pintarSelectorModo(): void {
    const idioma = obtenerIdioma();
    contenedor.querySelectorAll<HTMLButtonElement>(".boton-modo").forEach((boton) => {
        const modo = buscarModo(boton.dataset.modo ?? "");
        boton.setAttribute("aria-checked", String(modo.id === modoElegido.id));
        boton.tabIndex = modo.id === modoElegido.id ? 0 : -1;
        (boton.querySelector(".boton-modo-nombre") as HTMLElement).textContent = modo.nombre[idioma];
        boton.title = modo.descripcion[idioma];
    });
    descripcionModo.textContent = `${modoElegido.icono} ${modoElegido.descripcion[idioma]}`;
    recordInicio.textContent = `${texto("tuRecord")}: ${formatearPuntos(leerRecord(modoElegido.id).mejor, idioma)}`;
}

/**
 * Elige un modo.
 * @param modo Modo a elegir.
 */
function elegirModo(modo: Modo): void {
    modoElegido = modo;
    guardarDato(CLAVE_MODO, modo.id);
    pintarSelectorModo();
}

/**
 * Activa o desactiva los botones (mientras giran los rodillos).
 * @param bloqueado true para desactivarlos.
 */
export function bloquearSelectorModo(bloqueado: boolean): void {
    contenedor.querySelectorAll<HTMLButtonElement>(".boton-modo").forEach((boton) => (boton.disabled = bloqueado));
}

/** Crea los botones de modos. Las flechas del teclado mueven la selección. */
export function iniciarSelectorModo(): void {
    contenedor.replaceChildren(
        ...MODOS.map((modo) => {
            const boton = document.createElement("button");
            boton.type = "button";
            boton.className = "boton-modo";
            boton.setAttribute("role", "radio");
            boton.dataset.modo = modo.id;

            const icono = document.createElement("span");
            icono.className = "boton-modo-icono";
            icono.setAttribute("aria-hidden", "true");
            icono.textContent = modo.icono;
            const nombre = document.createElement("span");
            nombre.className = "boton-modo-nombre";

            boton.append(icono, nombre);
            boton.setAttribute("aria-describedby", "descripcion-modo");
            boton.addEventListener("click", () => elegirModo(modo));
            return boton;
        }),
    );
    contenedor.addEventListener("keydown", (evento) => {
        const pasos: Record<string, number> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
        const paso = pasos[evento.key];
        if (!paso) return;
        evento.preventDefault();
        const posicion = MODOS.findIndex((modo) => modo.id === modoElegido.id);
        elegirModo(MODOS[(posicion + paso + MODOS.length) % MODOS.length]);
        contenedor.querySelector<HTMLButtonElement>(`[data-modo="${modoElegido.id}"]`)?.focus();
    });
    document.addEventListener(EVENTO_IDIOMA_CAMBIADO, pintarSelectorModo);
    pintarSelectorModo();
}
