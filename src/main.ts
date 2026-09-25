/**
 * main.ts
 * Punto de entrada de QuizMania. Arranca los ajustes, el idioma y el perfil,
 * bloquea el clic derecho, añade el sonido de clic a todos los botones y
 * conecta los botones de cada pantalla:
 *
 *   Inicio (elegir modo + tirar de la palanca) → Carga → Preguntas
 *          → Resultados → (Revisar respuestas) → Jugar de nuevo → Inicio
 *   Cabecera: logo (inicio), ranking y amigos, perfil, idioma y ajustes.
 */

import { iniciarAjustes } from "./ajustes/ajustes";
import { detenerEfecto, reproducirClic, reproducirEfecto } from "./audio/efectos";
import { TEMAS } from "./config/temas";
import { EVENTO_IDIOMA_CAMBIADO, obtenerIdioma, texto } from "./i18n/textos";
import { estadoPartida } from "./juego/estado";
import { mostrarPantalla, pantallaActual } from "./juego/pantallas";
import {
    abandonarPartida,
    empezarRevision,
    hayPartidaEnJuego,
    iniciarPartida,
    moverRevision,
    mostrarPreguntaActual,
    mostrarResultados,
    pintarResultados,
    terminarPartida,
} from "./juego/partida";
import { bloquearSelectorModo, iniciarSelectorModo, obtenerModoElegido, pintarSelectorModo } from "./juego/selector-modo";
import { cargarPantallaRanking, iniciarSocial } from "./online/social";
import { iniciarPerfil } from "./perfil/perfil";
import { animarPalanca, girarRodillos, prepararRodillos } from "./tragaperras/tragaperras";
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
function confirmarSalida(): boolean {
    if (!hayPartidaEnJuego()) {
        return true;
    }
    if (!window.confirm(texto("confirmarAbandonar"))) {
        return false;
    }
    abandonarPartida();
    return true;
}

/** Muestra la portada con la tragaperras lista para tirar. */
function mostrarInicio(): void {
    tituloTragaperras.textContent = texto("tiraDeLaPalanca");
    tituloTragaperras.dataset.texto = "tiraDeLaPalanca";
    resultadoTragaperras.textContent = "";
    document.body.style.removeProperty("--acento");
    palanca.disabled = false;
    bloquearSelectorModo(false);
    pintarSelectorModo();
    estadoPartida.enRevision = false;
    mostrarPantalla("inicio");
}

/** Muestra la pantalla de ranking y amigos. */
function mostrarRanking(): void {
    if (tragaperrasGirando || !confirmarSalida()) {
        return;
    }
    mostrarPantalla("ranking");
    void cargarPantallaRanking();
}

/**
 * Tira de la palanca: gira los rodillos, elige un tema al azar, lo anuncia
 * y empieza la partida en el modo elegido.
 */
async function tirarDeLaPalanca(): Promise<void> {
    if (tragaperrasGirando) {
        return;
    }
    tragaperrasGirando = true;
    palanca.disabled = true;
    bloquearSelectorModo(true);

    animarPalanca(palanca);
    reproducirEfecto("giro");
    tituloTragaperras.textContent = texto("girando");
    delete tituloTragaperras.dataset.texto;
    resultadoTragaperras.textContent = "";

    const temaElegido = elegirAlAzar(TEMAS);
    await girarRodillos(tirasRodillos, temaElegido);

    detenerEfecto("giro");
    reproducirEfecto("temaElegido");
    document.body.style.setProperty("--acento", temaElegido.color);
    tituloTragaperras.textContent = `${temaElegido.icono} ${temaElegido.nombre[obtenerIdioma()]}`;
    resultadoTragaperras.textContent = `${texto("temaElegido")}: ${temaElegido.nombre[obtenerIdioma()]}`;

    await esperar(PAUSA_TRAS_ELEGIR_TEMA);
    tragaperrasGirando = false;
    await iniciarPartida(obtenerModoElegido(), temaElegido);
}

/**
 * Hace sonar un clic al pulsar cualquier botón, salvo los marcados con
 * data-sin-clic (que ya tienen su propio sonido).
 */
function activarSonidoDeBotones(): void {
    document.addEventListener("click", (evento) => {
        const boton = (evento.target as Element | null)?.closest("button");
        if (boton && !boton.disabled && !("sinClic" in boton.dataset)) {
            reproducirClic();
        }
    });
}

/** Conecta cada botón de las pantallas con su acción. */
function conectarBotones(): void {
    palanca.addEventListener("click", () => void tirarDeLaPalanca());
    obtenerElemento("boton-inicio").addEventListener("click", () => {
        if (!tragaperrasGirando && confirmarSalida()) mostrarInicio();
    });
    obtenerElemento("boton-ranking").addEventListener("click", mostrarRanking);
    obtenerElemento("boton-volver-ranking").addEventListener("click", mostrarInicio);
    obtenerElemento("boton-reintentar").addEventListener("click", mostrarInicio);
    obtenerElemento("boton-terminar").addEventListener("click", () => {
        if (window.confirm(texto("confirmarTerminar"))) terminarPartida();
    });
    obtenerElemento("boton-revisar").addEventListener("click", empezarRevision);
    obtenerElemento("boton-anterior").addEventListener("click", () => moverRevision(-1));
    obtenerElemento("boton-siguiente").addEventListener("click", () => moverRevision(1));
    obtenerElemento("boton-ver-resultados").addEventListener("click", mostrarResultados);
    document.querySelectorAll(".boton-jugar-de-nuevo").forEach((boton) => boton.addEventListener("click", mostrarInicio));
    document.querySelectorAll(".boton-ir-ranking").forEach((boton) => boton.addEventListener("click", mostrarRanking));
}

/**
 * Repinta los textos que se generan desde el código (contador, tema…)
 * cuando el jugador cambia de idioma a mitad de partida. Las preguntas ya
 * cargadas no se traducen de nuevo; las siguientes saldrán en el idioma nuevo.
 */
function repintarAlCambiarIdioma(): void {
    document.addEventListener(EVENTO_IDIOMA_CAMBIADO, () => {
        const pantalla = pantallaActual();
        if (pantalla === "pregunta" && estadoPartida.historial.length > 0) {
            mostrarPreguntaActual();
        } else if (pantalla === "resultados") {
            pintarResultados();
        } else if (pantalla === "ranking") {
            void cargarPantallaRanking();
        }
    });
}

/** Avisa antes de cerrar la pestaña con una partida a medias. */
function avisarAlCerrarConPartida(): void {
    window.addEventListener("beforeunload", (evento) => {
        if (hayPartidaEnJuego()) {
            evento.preventDefault();
        }
    });
}

/** Arranca el juego. */
function iniciarJuego(): void {
    bloquearClicDerecho();
    repintarAlCambiarIdioma();
    iniciarAjustes();
    iniciarPerfil();
    iniciarSelectorModo();
    prepararRodillos(tirasRodillos);
    activarSonidoDeBotones();
    conectarBotones();
    avisarAlCerrarConPartida();
    iniciarSocial(mostrarRanking);
}

iniciarJuego();
