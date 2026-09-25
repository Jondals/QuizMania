/**
 * main.ts
 * Punto de entrada de QuizMania. Arranca los ajustes, el idioma y la
 * sesión, bloquea el clic derecho, añade el sonido de clic a todos los
 * botones y conecta los botones de cada pantalla:
 *
 *   Inicio (elegir modo + tirar de la palanca) → Carga → Preguntas
 *          → Resultados → (Revisar respuestas) → Jugar de nuevo → Inicio
 *   Cabecera: logo y "Jugar" (inicio), ranking y amigos, idioma, ajustes
 *   (con la música) y el menú de la cuenta.
 * Al abrir la página se ve la pantalla de bienvenida (splash) unos segundos.
 */

import { iniciarAjustes } from "./ajustes/ajustes";
import { iniciarInterfazMusica } from "./audio/interfaz-musica";
import { detenerEfecto, reproducirEfecto } from "./audio/efectos";
import { TEMAS } from "./config/temas";
import { iniciarInterfazCuenta } from "./cuenta/interfaz-cuenta";
import { EVENTO_SESION, hayOnline, recuperarSesion } from "./cuenta/sesion";
import { EVENTO_IDIOMA_CAMBIADO, obtenerIdioma, texto } from "./i18n/textos";
import { estadoPartida } from "./juego/estado";
import { mostrarPantalla, pantallaActual } from "./juego/pantallas";
import {
    abandonarPartida,
    cambiarIdiomaPartida,
    empezarRevision,
    hayPartidaEnJuego,
    iniciarPartida,
    moverRevision,
    mostrarPreguntaActual,
    mostrarResultados,
    pintarResultados,
    terminarPartida,
} from "./juego/partida";
import {
    bloquearSelectorModo,
    iniciarSelectorModo,
    moverModo,
    obtenerModoElegido,
    pintarSelectorModo,
} from "./juego/selector-modo";
import { cargarPantallaRanking, iniciarSocial } from "./online/social";
import { conectarPalanca, girarRodillos, prepararRodillos } from "./tragaperras/tragaperras";
import { confirmar } from "./utilidades/confirmar";
import { elegirAlAzar, esperar } from "./utilidades/aleatorio";
import { obtenerElemento } from "./utilidades/dom";
import { bloquearClicDerecho } from "./utilidades/proteccion";

/** Pausa tras pararse los rodillos antes de cargar las preguntas (ms). */
const PAUSA_TRAS_ELEGIR_TEMA = 1400;

const palanca = obtenerElemento("palanca", HTMLButtonElement);
const tituloTragaperras = obtenerElemento("titulo-tragaperras");
const resultadoTragaperras = obtenerElemento("resultado-tragaperras");
const tirasRodillos = [...document.querySelectorAll<HTMLElement>(".rodillo-tira")];

/** Evita tirar de la palanca otra vez mientras gira. */
let tragaperrasGirando = false;

/**
 * Si hay una partida en juego, pregunta si se quiere abandonar.
 * @returns true si se puede salir (no había partida o el jugador acepta).
 */
async function confirmarSalida(): Promise<boolean> {
    if (!hayPartidaEnJuego()) {
        return true;
    }
    const acepta = await confirmar({
        titulo: texto("tituloAbandonar"),
        mensaje: texto("confirmarAbandonar"),
        aceptar: texto("abandonar"),
        peligroso: true,
    });
    if (acepta) {
        abandonarPartida();
    }
    return acepta;
}

/** Muestra la portada con la tragaperras lista para tirar. */
function mostrarInicio(): void {
    tituloTragaperras.textContent = texto("tiraDeLaPalanca");
    tituloTragaperras.dataset.texto = "tiraDeLaPalanca";
    resultadoTragaperras.textContent = "—";
    document.body.style.removeProperty("--acento");
    palanca.disabled = false;
    bloquearSelectorModo(false);
    pintarSelectorModo();
    estadoPartida.enRevision = false;
    mostrarPantalla("inicio");
}

/** Muestra la pantalla de ranking y amigos. */
async function mostrarRanking(): Promise<void> {
    if (tragaperrasGirando || !(await confirmarSalida())) {
        return;
    }
    mostrarPantalla("ranking");
    void cargarPantallaRanking();
}

/**
 * Tira de la palanca: gira los rodillos, elige un tema al azar (en Ruleta,
 * siempre "Al azar", que mezcla temas), lo anuncia y empieza la partida.
 */
async function tirarDeLaPalanca(): Promise<void> {
    if (tragaperrasGirando) {
        return;
    }
    tragaperrasGirando = true;
    palanca.disabled = true;
    bloquearSelectorModo(true);

    const modo = obtenerModoElegido();
    reproducirEfecto("giro");
    tituloTragaperras.textContent = texto("girando");
    delete tituloTragaperras.dataset.texto;
    resultadoTragaperras.textContent = "…";

    const temaElegido = modo.temasMezclados ? TEMAS[0] : elegirAlAzar(TEMAS);
    await girarRodillos(tirasRodillos, temaElegido);

    detenerEfecto("giro");
    reproducirEfecto("tema");
    document.body.style.setProperty("--acento", temaElegido.color);
    const nombreTema = temaElegido.nombre[obtenerIdioma()];
    tituloTragaperras.textContent = `${temaElegido.icono} ${nombreTema}`;
    resultadoTragaperras.textContent = nombreTema;

    await esperar(PAUSA_TRAS_ELEGIR_TEMA);
    tragaperrasGirando = false;
    await iniciarPartida(modo, temaElegido);
}

/**
 * Hace sonar un clic al pulsar cualquier botón, salvo los marcados con
 * data-sin-clic (que ya tienen su propio sonido).
 */
function activarSonidoDeBotones(): void {
    document.addEventListener("click", (evento) => {
        const boton = (evento.target as Element | null)?.closest("button");
        if (boton && !boton.disabled && !("sinClic" in boton.dataset)) {
            reproducirEfecto("clic");
        }
    });
}

/**
 * Atajos de teclado de la portada (salvo si se está escribiendo en un campo
 * o hay un diálogo abierto):
 *   Espacio  tira de la palanca.
 *   ← / →    cambian de modo.
 * @param tirar Tira de la palanca con su animación.
 */
function activarAtajosPortada(tirar: () => void): void {
    document.addEventListener("keydown", (evento) => {
        if (evento.repeat || pantallaActual() !== "inicio" || tragaperrasGirando) return;
        const objetivo = evento.target as HTMLElement | null;
        if (objetivo?.closest("input, textarea, select, dialog") || document.querySelector("dialog[open]")) return;
        if (evento.code === "Space") {
            if (objetivo === palanca) return; // La propia palanca ya responde al Espacio.
            evento.preventDefault();
            tirar();
        } else if (evento.key === "ArrowLeft" || evento.key === "ArrowRight") {
            evento.preventDefault();
            moverModo(evento.key === "ArrowLeft" ? -1 : 1);
        }
    });
}

/**
 * Quita la pantalla de bienvenida cuando termina su animación, o antes si
 * se pulsa una tecla o se hace clic.
 */
function prepararSplash(): void {
    const splash = document.getElementById("splash");
    if (!splash) return;
    const quitar = () => {
        splash.classList.add("oculta");
        window.removeEventListener("keydown", quitar, true);
        window.removeEventListener("pointerdown", quitar, true);
    };
    splash.addEventListener("animationend", (evento) => {
        if (evento.target === splash) quitar();
    });
    window.addEventListener("keydown", quitar, true);
    window.addEventListener("pointerdown", quitar, true);
}

/** Conecta cada botón de las pantallas con su acción. */
function conectarBotones(): void {
    const tirarConAnimacion = conectarPalanca(palanca, () => void tirarDeLaPalanca());
    activarAtajosPortada(tirarConAnimacion);
    const irAlInicio = async () => {
        if (!tragaperrasGirando && (await confirmarSalida())) mostrarInicio();
    };
    obtenerElemento("boton-inicio").addEventListener("click", irAlInicio);
    obtenerElemento("nav-jugar").addEventListener("click", irAlInicio);
    const botonRanking = obtenerElemento("boton-ranking");
    botonRanking.hidden = !hayOnline();
    botonRanking.addEventListener("click", () => void mostrarRanking());
    obtenerElemento("boton-reintentar").addEventListener("click", mostrarInicio);
    obtenerElemento("boton-terminar").addEventListener("click", async () => {
        const acepta = await confirmar({
            titulo: texto("tituloTerminar"),
            mensaje: texto("confirmarTerminar"),
            aceptar: texto("terminar"),
        });
        if (acepta && hayPartidaEnJuego()) terminarPartida();
    });
    obtenerElemento("boton-revisar").addEventListener("click", empezarRevision);
    obtenerElemento("boton-anterior").addEventListener("click", () => moverRevision(-1));
    obtenerElemento("boton-siguiente").addEventListener("click", () => moverRevision(1));
    obtenerElemento("boton-ver-resultados").addEventListener("click", mostrarResultados);
    document.querySelectorAll(".boton-jugar-de-nuevo").forEach((boton) => boton.addEventListener("click", mostrarInicio));
    document.querySelectorAll<HTMLElement>(".boton-ir-ranking").forEach((boton) => {
        boton.hidden = !hayOnline();
        boton.addEventListener("click", () => void mostrarRanking());
    });
}

/**
 * Repinta los textos que se generan desde el código (contador, tema…)
 * cuando el jugador cambia de idioma. Las preguntas ya cargadas no se
 * traducen de nuevo; las siguientes saldrán en el idioma nuevo.
 */
function repintarAlCambiarIdioma(): void {
    document.addEventListener(EVENTO_IDIOMA_CAMBIADO, () => {
        const pantalla = pantallaActual();
        if (pantalla === "pregunta" && estadoPartida.historial.length > 0) {
            // Las preguntas también cambian de idioma (se traducen desde el original).
            mostrarPreguntaActual();
            void cambiarIdiomaPartida(obtenerIdioma());
        } else if (pantalla === "resultados") {
            pintarResultados();
        } else if (pantalla === "ranking") {
            void cargarPantallaRanking();
        }
    });
}

/** Arranca el juego. */
async function iniciarJuego(): Promise<void> {
    prepararSplash();
    bloquearClicDerecho();
    repintarAlCambiarIdioma();
    iniciarAjustes();
    iniciarInterfazMusica();
    iniciarInterfazCuenta(() => void mostrarRanking());
    iniciarSelectorModo();
    prepararRodillos(tirasRodillos);
    activarSonidoDeBotones();
    conectarBotones();
    // Al entrar o salir cambian los récords que se enseñan en la portada.
    document.addEventListener(EVENTO_SESION, pintarSelectorModo);

    await recuperarSesion().catch(() => {});
    iniciarSocial(() => void mostrarRanking());
}

void iniciarJuego();
