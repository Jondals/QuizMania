/**
 * selector-modo.ts
 * Mandos de la tragaperras para elegir el modo de juego antes de tirar de
 * la palanca:
 *   - La pantalla LED enseña el modo elegido y su descripción, con flechas
 *     para pasar al anterior o al siguiente.
 *   - Debajo, una tecla por modo (solo el icono) para ir directo a uno.
 *   - En la portada, las flechas ← y → del teclado también cambian de modo.
 * El modo elegido se recuerda y el marcador de récord enseña el de ese modo.
 */

import type { Modo } from "../config/modos";
import { buscarModo, MODOS } from "../config/modos";
import { EVENTO_IDIOMA_CAMBIADO, obtenerIdioma } from "../i18n/textos";
import { leerRecord } from "../perfil/records";
import { guardarDato, leerDatoGuardado } from "../utilidades/almacenamiento";
import { obtenerElemento } from "../utilidades/dom";
import { formatearPuntos } from "./puntuacion";

const CLAVE_MODO = "modo";

const teclas = obtenerElemento("selector-modo");
const displayModo = obtenerElemento("display-modo");
const descripcionModo = obtenerElemento("descripcion-modo");
const recordInicio = obtenerElemento("record-inicio");
const flechaAnterior = obtenerElemento("modo-anterior", HTMLButtonElement);
const flechaSiguiente = obtenerElemento("modo-siguiente", HTMLButtonElement);

let modoElegido: Modo = buscarModo(leerDatoGuardado(CLAVE_MODO, "clasico"));
let bloqueado = false;

/** Devuelve el modo elegido. */
export function obtenerModoElegido(): Modo {
    return modoElegido;
}

/** Pinta la pantalla LED, las teclas y el récord del modo elegido. */
export function pintarSelectorModo(): void {
    const idioma = obtenerIdioma();
    displayModo.textContent = `${modoElegido.icono} ${modoElegido.nombre[idioma]}`;
    descripcionModo.textContent = modoElegido.descripcion[idioma];
    teclas.querySelectorAll<HTMLButtonElement>(".tecla-modo").forEach((tecla) => {
        const modo = buscarModo(tecla.dataset.modo ?? "");
        const elegido = modo.id === modoElegido.id;
        tecla.setAttribute("aria-checked", String(elegido));
        tecla.setAttribute("aria-label", modo.nombre[idioma]);
        tecla.title = `${modo.nombre[idioma]}: ${modo.descripcion[idioma]}`;
        tecla.tabIndex = elegido ? 0 : -1;
    });
    recordInicio.textContent = formatearPuntos(leerRecord(modoElegido.id).mejor, idioma);
}

/**
 * Elige un modo.
 * @param modo Modo a elegir.
 */
function elegirModo(modo: Modo): void {
    if (bloqueado) return;
    modoElegido = modo;
    guardarDato(CLAVE_MODO, modo.id);
    pintarSelectorModo();
}

/**
 * Pasa al modo anterior o siguiente (en círculo).
 * @param paso -1 anterior, +1 siguiente.
 */
export function moverModo(paso: 1 | -1): void {
    const posicion = MODOS.findIndex((modo) => modo.id === modoElegido.id);
    elegirModo(MODOS[(posicion + paso + MODOS.length) % MODOS.length]);
}

/**
 * Activa o desactiva los mandos (mientras giran los rodillos).
 * @param bloquear true para desactivarlos.
 */
export function bloquearSelectorModo(bloquear: boolean): void {
    bloqueado = bloquear;
    teclas.querySelectorAll<HTMLButtonElement>(".tecla-modo").forEach((tecla) => (tecla.disabled = bloquear));
    flechaAnterior.disabled = bloquear;
    flechaSiguiente.disabled = bloquear;
}

/** Crea las teclas de modo y conecta las flechas. */
export function iniciarSelectorModo(): void {
    teclas.replaceChildren(
        ...MODOS.map((modo) => {
            const tecla = document.createElement("button");
            tecla.type = "button";
            tecla.className = "tecla-modo";
            tecla.setAttribute("role", "radio");
            tecla.dataset.modo = modo.id;
            tecla.textContent = modo.icono;
            tecla.addEventListener("click", () => elegirModo(modo));
            return tecla;
        }),
    );
    flechaAnterior.addEventListener("click", () => moverModo(-1));
    flechaSiguiente.addEventListener("click", () => moverModo(1));

    // Dentro de las teclas, las flechas del teclado mueven la selección (patrón radiogroup).
    teclas.addEventListener("keydown", (evento) => {
        const pasos: Record<string, 1 | -1> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
        const paso = pasos[evento.key];
        if (!paso) return;
        evento.preventDefault();
        evento.stopPropagation();
        moverModo(paso);
        teclas.querySelector<HTMLButtonElement>(`[data-modo="${modoElegido.id}"]`)?.focus();
    });
    document.addEventListener(EVENTO_IDIOMA_CAMBIADO, pintarSelectorModo);
    pintarSelectorModo();
}
