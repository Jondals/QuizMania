/**
 * interfaz-musica.ts
 * Reproductor de música de Ajustes:
 *   - Anterior / reproducir-pausar / siguiente y volumen de la música.
 *   - Playlist: se toca una canción para ponerla, se arrastra por el asa
 *     (⠿) para reordenarla y se quita con ✕.
 *   - "Subir canciones" (archivos de audio) y un campo para pegar enlaces
 *     de YouTube (vídeo o lista) o Spotify.
 */

import type { ClaveTexto } from "../i18n/textos";
import { EVENTO_IDIOMA_CAMBIADO, texto } from "../i18n/textos";
import { obtenerElemento } from "../utilidades/dom";
import type { Cancion } from "./musica";
import {
    alternarReproduccion,
    anadirArchivos,
    anadirEnlace,
    anterior,
    ErrorMusica,
    establecerVolumenMusica,
    EVENTO_MUSICA,
    iniciarMusica,
    moverCancion,
    obtenerEstadoMusica,
    quitarCancion,
    reproducirIndice,
    siguiente,
} from "./musica";

const elementos = {
    actual: obtenerElemento("musica-actual"),
    botonAnterior: obtenerElemento("musica-anterior", HTMLButtonElement),
    botonPlay: obtenerElemento("musica-play", HTMLButtonElement),
    botonSiguiente: obtenerElemento("musica-siguiente", HTMLButtonElement),
    spotify: obtenerElemento("musica-spotify"),
    volumen: obtenerElemento("volumen-musica", HTMLInputElement),
    valorVolumen: obtenerElemento("valor-volumen-musica", HTMLOutputElement),
    contador: obtenerElemento("musica-contador"),
    lista: obtenerElemento("lista-musica"),
    campoArchivos: obtenerElemento("campo-canciones", HTMLInputElement),
    formularioEnlace: obtenerElemento("formulario-enlace-musica", HTMLFormElement),
    campoEnlace: obtenerElemento("campo-enlace-musica", HTMLInputElement),
    mensaje: obtenerElemento("mensaje-musica"),
};

/** Nombre corto del origen de una canción. */
const ETIQUETAS_FUENTE: Record<Cancion["fuente"], string> = { archivo: "Audio", youtube: "YouTube", spotify: "Spotify" };

/**
 * Crea un icono SVG sencillo.
 * @param ruta Trazado del icono.
 * @param relleno true = relleno; false = solo trazo.
 */
function icono(ruta: string, relleno = false): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("aria-hidden", "true");
    const trazo = document.createElementNS("http://www.w3.org/2000/svg", "path");
    trazo.setAttribute("d", ruta);
    if (relleno) {
        trazo.setAttribute("fill", "currentColor");
    } else {
        trazo.setAttribute("fill", "none");
        trazo.setAttribute("stroke", "currentColor");
        trazo.setAttribute("stroke-width", "2");
        trazo.setAttribute("stroke-linecap", "round");
    }
    svg.append(trazo);
    return svg;
}

/**
 * Crea la fila de una canción de la playlist.
 * @param cancion Canción.
 * @param posicion Posición en la lista.
 * @param esActual Si es la canción que suena (o está elegida).
 */
function crearFila(cancion: Cancion, posicion: number, esActual: boolean): HTMLLIElement {
    const { reproduciendo, cargando } = obtenerEstadoMusica();
    const fila = document.createElement("li");
    fila.className = "cancion";
    fila.classList.toggle("es-actual", esActual);
    fila.dataset.posicion = String(posicion);

    const asa = document.createElement("button");
    asa.type = "button";
    asa.className = "cancion-asa";
    asa.dataset.sinClic = "";
    asa.setAttribute("aria-label", `${texto("mover")}: ${cancion.titulo}`);
    asa.append(icono("M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"));
    conectarArrastre(asa, fila);

    const numero = document.createElement("span");
    numero.className = "cancion-numero";
    numero.setAttribute("aria-hidden", "true");
    if (esActual && cargando) {
        numero.append(Object.assign(document.createElement("span"), { className: "cancion-girando" }));
    } else if (esActual && reproduciendo) {
        const barras = document.createElement("span");
        barras.className = "cancion-sonando";
        barras.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
        numero.append(barras);
    } else {
        numero.textContent = String(posicion + 1);
    }

    const titulo = document.createElement("button");
    titulo.type = "button";
    titulo.className = "cancion-titulo";
    titulo.textContent = cancion.titulo;
    titulo.title = cancion.titulo;
    titulo.addEventListener("click", () => void reproducirIndice(posicion));

    const fuente = document.createElement("span");
    fuente.className = "cancion-fuente";
    fuente.textContent = ETIQUETAS_FUENTE[cancion.fuente];

    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.className = "cancion-quitar";
    quitar.setAttribute("aria-label", `${texto("quitar")}: ${cancion.titulo}`);
    quitar.append(icono("M6 6l12 12M18 6 6 18"));
    quitar.addEventListener("click", () => void quitarCancion(cancion.id));

    fila.append(asa, numero, titulo, fuente, quitar);
    return fila;
}

/**
 * Permite reordenar arrastrando la fila por su asa (ratón o dedo).
 * @param asa Asa de la fila.
 * @param fila Fila de la canción.
 */
function conectarArrastre(asa: HTMLButtonElement, fila: HTMLLIElement): void {
    asa.addEventListener("pointerdown", (evento) => {
        if (evento.button !== 0) return;
        evento.preventDefault();
        const inicioY = evento.clientY;
        const desde = Number(fila.dataset.posicion);
        const filas = [...elementos.lista.children] as HTMLElement[];
        const centros = filas.map((otra) => {
            const caja = otra.getBoundingClientRect();
            return caja.top + caja.height / 2;
        });
        let hasta = desde;
        fila.classList.add("arrastrando");
        try {
            asa.setPointerCapture(evento.pointerId);
        } catch {
            // Sin captura del puntero se arrastra igual.
        }

        const mover = (movimiento: PointerEvent) => {
            const desplazamiento = movimiento.clientY - inicioY;
            fila.style.transform = `translateY(${desplazamiento}px)`;
            const centro = centros[desde] + desplazamiento;
            hasta = centros.reduce((mejor, otro, posicion) => (Math.abs(otro - centro) < Math.abs(centros[mejor] - centro) ? posicion : mejor), desde);
        };
        const soltar = () => {
            asa.removeEventListener("pointermove", mover);
            asa.removeEventListener("pointerup", soltar);
            asa.removeEventListener("pointercancel", soltar);
            fila.classList.remove("arrastrando");
            fila.style.transform = "";
            if (hasta !== desde) moverCancion(desde, hasta);
        };
        asa.addEventListener("pointermove", mover);
        asa.addEventListener("pointerup", soltar);
        asa.addEventListener("pointercancel", soltar);
    });
    // Teclado: flechas arriba/abajo sobre el asa mueven la canción.
    asa.addEventListener("keydown", (evento) => {
        const desde = Number(fila.dataset.posicion);
        const paso = evento.key === "ArrowUp" ? -1 : evento.key === "ArrowDown" ? 1 : 0;
        if (!paso) return;
        evento.preventDefault();
        moverCancion(desde, desde + paso);
        (elementos.lista.children[desde + paso]?.querySelector(".cancion-asa") as HTMLElement | null)?.focus();
    });
}

/** Repinta todo el reproductor. */
function pintar(): void {
    const { canciones, indice, volumen, reproduciendo, actual } = obtenerEstadoMusica();
    const hayCanciones = canciones.length > 0;

    elementos.botonPlay.classList.toggle("sonando", reproduciendo);
    elementos.botonPlay.setAttribute("aria-label", texto(reproduciendo ? "pausar" : "reproducir"));
    elementos.botonPlay.disabled = !hayCanciones;
    elementos.botonAnterior.disabled = !hayCanciones;
    elementos.botonSiguiente.disabled = canciones.length < 2;
    elementos.contador.textContent = hayCanciones ? `${indice + 1} / ${canciones.length}` : "0";
    elementos.actual.replaceChildren();
    if (actual) {
        const titulo = document.createElement("strong");
        titulo.textContent = actual.titulo;
        elementos.actual.append(`${texto(reproduciendo ? "sonando" : "enPausa")}: `, titulo);
    }
    elementos.spotify.hidden = actual?.fuente !== "spotify";

    elementos.volumen.value = String(Math.round(volumen * 100));
    elementos.valorVolumen.value = `${Math.round(volumen * 100)}%`;

    // No se repinta la lista mientras se arrastra una fila.
    if (!elementos.lista.querySelector(".arrastrando")) {
        const enfocado = document.activeElement?.closest(".cancion") as HTMLElement | null;
        const posicionEnfocada = enfocado?.dataset.posicion;
        elementos.lista.replaceChildren(...canciones.map((cancion, posicion) => crearFila(cancion, posicion, posicion === indice)));
        if (posicionEnfocada !== undefined) {
            (elementos.lista.children[Number(posicionEnfocada)]?.querySelector(".cancion-titulo") as HTMLElement | null)?.focus();
        }
    }

}

/**
 * Enseña un mensaje bajo el campo de enlaces.
 * @param clave Texto a enseñar.
 * @param esError Si es un error.
 * @param extra Texto que se añade al final.
 */
function mostrarMensaje(clave: ClaveTexto | null, esError = false, extra = ""): void {
    elementos.mensaje.textContent = clave ? `${texto(clave)}${extra}` : "";
    elementos.mensaje.classList.toggle("es-error", esError);
}

/** Traduce un error de música. */
function claveDeError(error: unknown): ClaveTexto {
    if (error instanceof ErrorMusica) {
        return error.codigo === "enlace-no-valido" ? "enlaceNoValido" : error.codigo === "lista-vacia" ? "listaVacia" : "archivoNoValido";
    }
    return "errorOnline";
}

/** Conecta el reproductor de Ajustes. */
export function iniciarInterfazMusica(): void {
    elementos.botonPlay.dataset.sinClic = "";
    elementos.botonPlay.addEventListener("click", () => void alternarReproduccion());
    elementos.botonAnterior.addEventListener("click", () => void anterior());
    elementos.botonSiguiente.addEventListener("click", () => void siguiente());
    elementos.volumen.addEventListener("input", () => establecerVolumenMusica(Number(elementos.volumen.value) / 100));

    elementos.campoArchivos.addEventListener("change", async () => {
        const archivos = [...(elementos.campoArchivos.files ?? [])];
        elementos.campoArchivos.value = "";
        if (archivos.length === 0) return;
        try {
            const cantidad = await anadirArchivos(archivos);
            mostrarMensaje("cancionesAnadidas", false, ` ${cantidad}`);
        } catch (error) {
            mostrarMensaje(claveDeError(error), true);
        }
    });

    elementos.formularioEnlace.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        const enlace = elementos.campoEnlace.value.trim();
        if (!enlace) return;
        mostrarMensaje("cargando");
        try {
            const cantidad = await anadirEnlace(enlace);
            elementos.campoEnlace.value = "";
            mostrarMensaje("cancionesAnadidas", false, ` ${cantidad}`);
        } catch (error) {
            mostrarMensaje(claveDeError(error), true);
        }
    });
    elementos.campoEnlace.addEventListener("input", () => mostrarMensaje(null));


    document.addEventListener(EVENTO_MUSICA, pintar);
    document.addEventListener(EVENTO_IDIOMA_CAMBIADO, pintar);
    iniciarMusica();
}
