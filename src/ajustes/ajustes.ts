/**
 * ajustes.ts
 * Selector de idioma (ES/EN, en la barra superior) y panel de ajustes:
 * volumen de la música, volumen de los efectos y el campo para pegar un
 * link de YouTube o Spotify. Todo se guarda en el
 * navegador para la próxima visita (el link se recuerda, pero no se
 * reproduce solo: hay que pulsar "Reproducir").
 */

import { analizarEnlaceMusical } from "../audio/enlaces";
import { establecerVolumenEfectos, reproducirEfecto } from "../audio/efectos";
import { establecerVolumenMusica, quitarMusica, reproducirEnlaceMusical } from "../audio/musica";
import type { Idioma } from "../i18n/textos";
import { cambiarIdioma, detectarIdiomaDelNavegador, texto } from "../i18n/textos";
import { guardarDato, leerDatoGuardado } from "../utilidades/almacenamiento";
import { obtenerElemento } from "../utilidades/dom";

/** Ajustes que se guardan entre visitas. */
interface AjustesGuardados {
    idioma: Idioma;
    /** 0-100 */
    volumenMusica: number;
    /** 0-100 */
    volumenEfectos: number;
    ultimoEnlaceMusical: string;
}

const CLAVE_AJUSTES = "ajustes";

/** Ajustes actuales. */
let ajustes: AjustesGuardados = {
    idioma: detectarIdiomaDelNavegador(),
    volumenMusica: 50,
    volumenEfectos: 70,
    ultimoEnlaceMusical: "",
};

/** Elementos del HTML del panel y del reproductor. */
const elementos = {
    botonAbrir: obtenerElemento("boton-ajustes", HTMLButtonElement),
    dialogo: obtenerElemento("dialogo-ajustes", HTMLDialogElement),
    botonesIdioma: [...document.querySelectorAll<HTMLButtonElement>(".boton-idioma")],
    sliderMusica: obtenerElemento("volumen-musica", HTMLInputElement),
    sliderEfectos: obtenerElemento("volumen-efectos", HTMLInputElement),
    valorMusica: obtenerElemento("valor-volumen-musica", HTMLOutputElement),
    valorEfectos: obtenerElemento("valor-volumen-efectos", HTMLOutputElement),
    formularioMusica: obtenerElemento("formulario-musica", HTMLFormElement),
    campoEnlace: obtenerElemento("enlace-musica", HTMLInputElement),
    botonQuitarMusica: obtenerElemento("boton-quitar-musica", HTMLButtonElement),
    mensajeMusica: obtenerElemento("mensaje-musica"),
    reproductor: obtenerElemento("reproductor"),
    contenidoReproductor: obtenerElemento("reproductor-contenido"),
    botonPlegarReproductor: obtenerElemento("boton-plegar-reproductor", HTMLButtonElement),
};

/** Guarda los ajustes actuales en el navegador. */
function guardarAjustes(): void {
    guardarDato(CLAVE_AJUSTES, ajustes);
}

/** Muestra el valor numérico de los sliders al lado de cada uno. */
function actualizarValoresDeVolumen(): void {
    elementos.valorMusica.value = `${ajustes.volumenMusica}%`;
    elementos.valorEfectos.value = `${ajustes.volumenEfectos}%`;
}

/**
 * Activa un idioma, marca su botón como pulsado y lo guarda.
 * @param idioma Idioma a activar.
 */
function aplicarIdioma(idioma: Idioma): void {
    ajustes.idioma = idioma;
    cambiarIdioma(idioma);
    elementos.botonesIdioma.forEach((boton) => {
        boton.setAttribute("aria-pressed", String(boton.dataset.idioma === idioma));
    });
}

/**
 * Muestra un mensaje bajo el campo del link.
 * @param mensaje Texto a mostrar (vacío para ocultarlo).
 * @param esError Si es un error (se pinta en rojo).
 */
function mostrarMensajeMusica(mensaje: string, esError = false): void {
    elementos.mensajeMusica.textContent = mensaje;
    elementos.mensajeMusica.classList.toggle("es-error", esError);
}

/**
 * Reproduce el link del campo de texto (si es válido) y lo recuerda.
 */
async function reproducirEnlaceDelCampo(): Promise<void> {
    const enlace = analizarEnlaceMusical(elementos.campoEnlace.value);
    if (!enlace) {
        mostrarMensajeMusica(texto("enlaceNoValido"), true);
        elementos.campoEnlace.setAttribute("aria-invalid", "true");
        return;
    }
    elementos.campoEnlace.removeAttribute("aria-invalid");
    ajustes.ultimoEnlaceMusical = elementos.campoEnlace.value.trim();
    guardarAjustes();

    mostrarMensajeMusica(enlace.plataforma === "spotify" ? texto("notaSpotify") : "");
    elementos.reproductor.hidden = false;
    elementos.reproductor.classList.remove("reproductor--plegado");
    elementos.reproductor.classList.toggle("reproductor--spotify", enlace.plataforma === "spotify");
    try {
        await reproducirEnlaceMusical(enlace, elementos.contenidoReproductor);
    } catch {
        mostrarMensajeMusica(texto("enlaceNoValido"), true);
    }
}

/** Para la música y oculta el reproductor. */
function detenerMusica(): void {
    quitarMusica(elementos.contenidoReproductor);
    elementos.reproductor.hidden = true;
    mostrarMensajeMusica("");
}

/** Pliega o despliega el reproductor flotante (la música sigue sonando). */
function alternarReproductorPlegado(): void {
    const plegado = elementos.reproductor.classList.toggle("reproductor--plegado");
    elementos.botonPlegarReproductor.setAttribute("aria-expanded", String(!plegado));
    elementos.botonPlegarReproductor.setAttribute(
        "aria-label",
        texto(plegado ? "mostrarReproductor" : "ocultarReproductor"),
    );
}

/**
 * Carga los ajustes guardados, los aplica y conecta los controles del panel.
 */
export function iniciarAjustes(): void {
    ajustes = { ...ajustes, ...leerDatoGuardado<Partial<AjustesGuardados>>(CLAVE_AJUSTES, {}) };

    aplicarIdioma(ajustes.idioma);
    establecerVolumenMusica(ajustes.volumenMusica / 100);
    establecerVolumenEfectos(ajustes.volumenEfectos / 100);

    elementos.sliderMusica.value = String(ajustes.volumenMusica);
    elementos.sliderEfectos.value = String(ajustes.volumenEfectos);
    elementos.campoEnlace.value = ajustes.ultimoEnlaceMusical;
    actualizarValoresDeVolumen();

    elementos.botonAbrir.addEventListener("click", () => elementos.dialogo.showModal());

    // Cerrar al pulsar fuera del cuadro (sobre el fondo oscuro).
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

    elementos.sliderMusica.addEventListener("input", () => {
        ajustes.volumenMusica = Number(elementos.sliderMusica.value);
        establecerVolumenMusica(ajustes.volumenMusica / 100);
        actualizarValoresDeVolumen();
        guardarAjustes();
    });

    elementos.sliderEfectos.addEventListener("input", () => {
        ajustes.volumenEfectos = Number(elementos.sliderEfectos.value);
        establecerVolumenEfectos(ajustes.volumenEfectos / 100);
        actualizarValoresDeVolumen();
        guardarAjustes();
    });
    // Al soltar el slider suena un efecto para oír el volumen elegido.
    elementos.sliderEfectos.addEventListener("change", () => reproducirEfecto("acierto"));

    elementos.formularioMusica.addEventListener("submit", (evento) => {
        evento.preventDefault();
        void reproducirEnlaceDelCampo();
    });
    elementos.campoEnlace.addEventListener("input", () => {
        elementos.campoEnlace.removeAttribute("aria-invalid");
        mostrarMensajeMusica("");
    });
    elementos.botonQuitarMusica.addEventListener("click", detenerMusica);
    elementos.botonPlegarReproductor.addEventListener("click", alternarReproductorPlegado);
}
