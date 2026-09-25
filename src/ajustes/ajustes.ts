/**
 * ajustes.ts
 * Selector de idioma (ES/EN, en la barra superior) y panel de ajustes con el
 * volumen de los efectos. Todo se guarda en el navegador.
 */

import { establecerVolumenEfectos, reproducirEfecto } from "../audio/efectos";
import type { Idioma } from "../i18n/textos";
import { cambiarIdioma, detectarIdiomaDelNavegador } from "../i18n/textos";
import { guardarDato, leerDatoGuardado } from "../utilidades/almacenamiento";
import { obtenerElemento } from "../utilidades/dom";

/** Ajustes que se guardan entre visitas. */
interface AjustesGuardados {
    idioma: Idioma;
    /** 0-100 */
    volumenEfectos: number;
}

const CLAVE_AJUSTES = "ajustes";

/** Ajustes actuales. */
let ajustes: AjustesGuardados = {
    idioma: detectarIdiomaDelNavegador(),
    volumenEfectos: 70,
};

const elementos = {
    botonAbrir: obtenerElemento("boton-ajustes", HTMLButtonElement),
    dialogo: obtenerElemento("dialogo-ajustes", HTMLDialogElement),
    botonesIdioma: [...document.querySelectorAll<HTMLButtonElement>(".boton-idioma")],
    sliderEfectos: obtenerElemento("volumen-efectos", HTMLInputElement),
    valorEfectos: obtenerElemento("valor-volumen-efectos", HTMLOutputElement),
};

/** Guarda los ajustes actuales en el navegador. */
function guardarAjustes(): void {
    guardarDato(CLAVE_AJUSTES, ajustes);
}

/**
 * Activa un idioma y marca su botón como pulsado.
 * @param idioma Idioma a activar.
 */
function aplicarIdioma(idioma: Idioma): void {
    ajustes.idioma = idioma;
    cambiarIdioma(idioma);
    elementos.botonesIdioma.forEach((boton) => {
        boton.setAttribute("aria-pressed", String(boton.dataset.idioma === idioma));
    });
}

/** Carga los ajustes guardados, los aplica y conecta los controles. */
export function iniciarAjustes(): void {
    const guardados = leerDatoGuardado<Partial<AjustesGuardados>>(CLAVE_AJUSTES, {});
    ajustes = {
        idioma: guardados.idioma === "en" || guardados.idioma === "es" ? guardados.idioma : ajustes.idioma,
        volumenEfectos: typeof guardados.volumenEfectos === "number" ? guardados.volumenEfectos : ajustes.volumenEfectos,
    };

    aplicarIdioma(ajustes.idioma);
    establecerVolumenEfectos(ajustes.volumenEfectos / 100);
    elementos.sliderEfectos.value = String(ajustes.volumenEfectos);
    elementos.valorEfectos.value = `${ajustes.volumenEfectos}%`;

    elementos.botonAbrir.addEventListener("click", () => elementos.dialogo.showModal());
    elementos.dialogo.addEventListener("click", (evento) => {
        if (evento.target === elementos.dialogo) {
            elementos.dialogo.close();
        }
    });

    elementos.botonesIdioma.forEach((boton) => {
        boton.addEventListener("click", () => {
            aplicarIdioma(boton.dataset.idioma as Idioma);
            guardarAjustes();
        });
    });

    elementos.sliderEfectos.addEventListener("input", () => {
        ajustes.volumenEfectos = Number(elementos.sliderEfectos.value);
        establecerVolumenEfectos(ajustes.volumenEfectos / 100);
        elementos.valorEfectos.value = `${ajustes.volumenEfectos}%`;
        guardarAjustes();
    });
    // Al soltar el slider suena un efecto para oír el volumen elegido.
    elementos.sliderEfectos.addEventListener("change", () => reproducirEfecto("acierto"));
}
