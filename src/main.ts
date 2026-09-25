/**
 * main.ts
 * Punto de entrada de QuizMania. Arranca los ajustes, el idioma y la
 * sesión, bloquea el clic derecho, añade el sonido de clic a todos los
 * botones y conecta los botones de cada pantalla:
 *
 *   Inicio (elegir modo + tirar de la palanca) → Carga → Preguntas
 *          → Resultados → (Revisar respuestas) → Jugar de nuevo → Inicio
 *   Cabecera: logo (inicio), ranking y amigos, cuenta, idioma y ajustes.
 */

import { iniciarAjustes } from "./ajustes/ajustes";
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
    conectarAvisoInvitado,
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
    resultadoTragaperras.textContent = "";
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
    resultadoTragaperras.textContent = "";

    const temaElegido = modo.temasMezclados ? TEMAS[0] : elegirAlAzar(TEMAS);
    await girarRodillos(tirasRodillos, temaElegido);

    detenerEfecto("giro");
    reproducirEfecto("tema");
    document.body.style.setProperty("--acento", temaElegido.color);
    const nombreTema = temaElegido.nombre[obtenerIdioma()];
    tituloTragaperras.textContent = `${temaElegido.icono} ${nombreTema}`;
    resultadoTragaperras.textContent = `${texto("temaElegido")}: ${nombreTema}`;

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
 * En la portada, la barra espaciadora tira de la palanca (salvo si se está
 * escribiendo en un campo o hay un diálogo abierto).
 * @param tirar Tira de la palanca con su animación.
 */
function activarTeclaEspacio(tirar: () => void): void {
    document.addEventListener("keydown", (evento) => {
        if (evento.code !== "Space" || evento.repeat || pantallaActual() !== "inicio") return;
        const objetivo = evento.target as HTMLElement | null;
        if (objetivo?.closest("input, textarea, select, dialog") || document.querySelector("dialog[open]")) return;
        if (objetivo === palanca) return; // La propia palanca ya responde al Espacio.
        evento.preventDefault();
        tirar();
    });
}

/** Conecta cada botón de las pantallas con su acción. */
function conectarBotones(): void {
    const tirarConAnimacion = conectarPalanca(palanca, () => void tirarDeLaPalanca());
    activarTeclaEspacio(tirarConAnimacion);
    obtenerElemento("boton-inicio").addEventListener("click", async () => {
        if (!tragaperrasGirando && (await confirmarSalida())) mostrarInicio();
    });
    const botonRanking = obtenerElemento("boton-ranking");
    botonRanking.hidden = !hayOnline();
    botonRanking.addEventListener("click", () => void mostrarRanking());
    obtenerElemento("boton-volver-ranking").addEventListener("click", mostrarInicio);
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
    conectarAvisoInvitado();
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
    bloquearClicDerecho();
    repintarAlCambiarIdioma();
    iniciarAjustes();
    iniciarInterfazCuenta();
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
