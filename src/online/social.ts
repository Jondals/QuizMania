/**
 * social.ts
 * Pantalla de ranking y amigos, y la comparación con los amigos al acabar
 * una partida:
 *   - Clasificación de cada modo: tú y tus amigos, o los 50 mejores del mundo.
 *   - Tu código de amigo (copiar o compartir un enlace de invitación).
 *   - Añadir amigos por código y quitarlos. La amistad es mutua.
 *   - Tus récords guardados en este navegador.
 * Un enlace con ?amigo=CODIGO añade a ese amigo automáticamente.
 */

import { normalizarCodigo } from "../../api/_lib/compartido";
import type { IdModo } from "../config/modos";
import { buscarModo, MODOS } from "../config/modos";
import type { ClaveTexto } from "../i18n/textos";
import { EVENTO_IDIOMA_CAMBIADO, obtenerIdioma, texto } from "../i18n/textos";
import { formatearPuntos } from "../juego/puntuacion";
import { copiarAlPortapapeles, EVENTO_PERFIL_CAMBIADO, obtenerPerfil, pintarAvatar, subirPerfil } from "../perfil/perfil";
import { leerRecord } from "../perfil/records";
import { obtenerElemento } from "../utilidades/dom";
import type { FilaRanking, JugadorPublico } from "./cliente";
import { anadirAmigo, enviarPuntuacion, ErrorOnline, listarAmigos, obtenerRanking, quitarAmigo } from "./cliente";

/** Filas que se enseñan en la comparación de la pantalla de resultados. */
const FILAS_EN_RESULTADOS = 5;

const elementos = {
    avisoOffline: obtenerElemento("aviso-offline"),
    pestanasModo: obtenerElemento("pestanas-modo"),
    botonesAmbito: [...document.querySelectorAll<HTMLButtonElement>(".boton-ambito")],
    listaRanking: obtenerElemento("lista-ranking"),
    estadoRanking: obtenerElemento("estado-ranking"),
    miPosicion: obtenerElemento("mi-posicion"),
    codigoSocial: obtenerElemento("codigo-social"),
    mensajeCodigo: obtenerElemento("mensaje-codigo-social"),
    formularioAmigo: obtenerElemento("formulario-amigo", HTMLFormElement),
    campoCodigoAmigo: obtenerElemento("campo-codigo-amigo", HTMLInputElement),
    mensajeAmigo: obtenerElemento("mensaje-amigo"),
    listaAmigos: obtenerElemento("lista-amigos"),
    listaRecords: obtenerElemento("lista-records"),
    bloqueAmigos: obtenerElemento("bloque-amigos"),
    posicionAmigos: obtenerElemento("posicion-amigos"),
    listaAmigosResultado: obtenerElemento("lista-amigos-resultado"),
    invitarAmigos: obtenerElemento("invitar-amigos"),
};

let modoRanking: IdModo = "clasico";
let ambitoRanking: "amigos" | "global" = "amigos";
/** Evita pintar una respuesta vieja si se cambia de pestaña rápido. */
let peticionRanking = 0;

/**
 * Traduce un código de error del servidor a un mensaje para el jugador.
 * @param error Error recibido.
 */
function mensajeDeError(error: unknown): string {
    const codigos: Record<string, ClaveTexto> = {
        "no-disponible": "onlineNoDisponible",
        "codigo-no-existe": "codigoNoExiste",
        "codigo-no-valido": "codigoNoValido",
        "eres-tu": "codigoEresTu",
        "demasiados-amigos": "demasiadosAmigos",
    };
    const clave = error instanceof ErrorOnline ? codigos[error.codigo] : undefined;
    return texto(clave ?? "errorOnline");
}

/**
 * Crea la fila de un jugador (posición, avatar, nombre y puntos).
 * @param fila Datos de la fila.
 */
function crearFilaRanking(fila: FilaRanking): HTMLLIElement {
    const elemento = document.createElement("li");
    elemento.className = "fila-ranking";
    elemento.classList.toggle("es-yo", fila.soyYo);
    if (fila.posicion !== null && fila.posicion <= 3) {
        elemento.classList.add(`podio-${fila.posicion}`);
    }

    const posicion = document.createElement("span");
    posicion.className = "fila-posicion";
    posicion.textContent = fila.posicion === null ? "–" : String(fila.posicion);

    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.setAttribute("aria-hidden", "true");
    pintarAvatar(avatar, fila.avatar, fila.color);

    const nombre = document.createElement("span");
    nombre.className = "fila-nombre";
    nombre.textContent = fila.soyYo ? `${fila.nombre} (${texto("tu")})` : fila.nombre;

    const puntos = document.createElement("span");
    puntos.className = "fila-puntos";
    puntos.textContent = fila.puntos === null ? texto("sinJugar") : formatearPuntos(fila.puntos, obtenerIdioma());

    elemento.append(posicion, avatar, nombre, puntos);
    return elemento;
}

/* ---------- Clasificación ---------- */

/** Crea las pestañas de modos. */
function crearPestanasModo(): void {
    elementos.pestanasModo.replaceChildren(
        ...MODOS.map((modo) => {
            const boton = document.createElement("button");
            boton.type = "button";
            boton.className = "pestana";
            boton.dataset.modo = modo.id;
            boton.addEventListener("click", () => {
                modoRanking = modo.id;
                void cargarRanking();
            });
            return boton;
        }),
    );
    pintarPestanas();
}

/** Actualiza el texto y la selección de las pestañas y del ámbito. */
function pintarPestanas(): void {
    const idioma = obtenerIdioma();
    elementos.pestanasModo.querySelectorAll<HTMLButtonElement>(".pestana").forEach((boton) => {
        const modo = buscarModo(boton.dataset.modo ?? "");
        boton.textContent = `${modo.icono} ${modo.nombre[idioma]}`;
        boton.setAttribute("aria-pressed", String(modo.id === modoRanking));
    });
    elementos.botonesAmbito.forEach((boton) => {
        boton.setAttribute("aria-pressed", String(boton.dataset.ambito === ambitoRanking));
    });
}

/** Descarga y pinta la clasificación del modo y ámbito elegidos. */
async function cargarRanking(): Promise<void> {
    const miPeticion = ++peticionRanking;
    pintarPestanas();
    elementos.estadoRanking.textContent = texto("cargando");
    elementos.estadoRanking.hidden = false;
    elementos.listaRanking.replaceChildren();
    elementos.miPosicion.textContent = "";
    try {
        const ranking = await obtenerRanking(modoRanking, ambitoRanking);
        if (miPeticion !== peticionRanking) return;
        elementos.listaRanking.replaceChildren(...ranking.filas.map(crearFilaRanking));
        const soloYo = ambitoRanking === "amigos" && ranking.filas.length <= 1;
        elementos.estadoRanking.hidden = ranking.filas.length > 0 && !soloYo;
        elementos.estadoRanking.textContent = soloYo ? texto("sinAmigosTodavia") : texto("rankingVacio");
        if (ranking.miPosicion !== null) {
            elementos.miPosicion.textContent = `${texto("tuPosicion")}: #${ranking.miPosicion}`;
        }
        elementos.avisoOffline.hidden = true;
    } catch (error) {
        if (miPeticion !== peticionRanking) return;
        elementos.estadoRanking.textContent = mensajeDeError(error);
        elementos.avisoOffline.hidden = !(error instanceof ErrorOnline && error.codigo === "no-disponible");
    }
}

/* ---------- Amigos ---------- */

/**
 * Crea la fila de un amigo con el botón de quitar.
 * @param amigo Datos del amigo.
 */
function crearFilaAmigo(amigo: JugadorPublico): HTMLLIElement {
    const elemento = document.createElement("li");
    elemento.className = "fila-amigo";

    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.setAttribute("aria-hidden", "true");
    pintarAvatar(avatar, amigo.avatar, amigo.color);

    const nombre = document.createElement("span");
    nombre.className = "fila-nombre";
    nombre.textContent = amigo.nombre;

    const codigo = document.createElement("span");
    codigo.className = "fila-codigo";
    codigo.textContent = amigo.codigo;

    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.className = "boton-icono boton-icono--pequeno";
    quitar.textContent = "✕";
    quitar.setAttribute("aria-label", `${texto("quitarAmigo")}: ${amigo.nombre}`);
    quitar.addEventListener("click", async () => {
        if (!window.confirm(`${texto("confirmarQuitarAmigo")} ${amigo.nombre}?`)) {
            return;
        }
        try {
            await quitarAmigo(amigo.id);
            elemento.remove();
            void cargarRanking();
        } catch (error) {
            elementos.mensajeAmigo.textContent = mensajeDeError(error);
        }
    });

    elemento.append(avatar, nombre, codigo, quitar);
    return elemento;
}

/** Descarga y pinta la lista de amigos. */
async function cargarAmigos(): Promise<void> {
    try {
        const amigos = await listarAmigos();
        elementos.listaAmigos.replaceChildren(...amigos.map(crearFilaAmigo));
        elementos.listaAmigos.dataset.vacia = String(amigos.length === 0);
    } catch {
        elementos.listaAmigos.replaceChildren();
        elementos.listaAmigos.dataset.vacia = "true";
    }
}

/**
 * Añade un amigo por código y refresca las listas.
 * @param codigoEscrito Código tal como lo escribió el jugador.
 */
async function anadirAmigoPorCodigo(codigoEscrito: string): Promise<void> {
    const codigo = normalizarCodigo(codigoEscrito);
    if (!codigo) {
        elementos.mensajeAmigo.textContent = texto("codigoNoValido");
        elementos.mensajeAmigo.classList.add("es-error");
        return;
    }
    elementos.mensajeAmigo.textContent = texto("cargando");
    elementos.mensajeAmigo.classList.remove("es-error");
    try {
        const amigo = await anadirAmigo(codigo);
        elementos.mensajeAmigo.textContent = `${texto("amigoAnadido")}: ${amigo.nombre} ${amigo.avatar}`;
        elementos.campoCodigoAmigo.value = "";
        ambitoRanking = "amigos";
        await Promise.all([cargarAmigos(), cargarRanking()]);
    } catch (error) {
        elementos.mensajeAmigo.textContent = mensajeDeError(error);
        elementos.mensajeAmigo.classList.add("es-error");
    }
}

/** Pinta el código propio. */
function pintarCodigoPropio(): void {
    elementos.codigoSocial.textContent = obtenerPerfil().codigo ?? "······";
}

/** Enlace que añade al jugador como amigo al abrirlo. */
function enlaceDeInvitacion(codigo: string): string {
    return `${location.origin}${location.pathname}?amigo=${codigo}`;
}

/** Comparte (o copia) el enlace de invitación. */
async function compartirInvitacion(): Promise<void> {
    const codigo = obtenerPerfil().codigo ?? (await subirPerfil());
    if (!codigo) {
        elementos.mensajeCodigo.textContent = texto("onlineNoDisponible");
        return;
    }
    const enlace = enlaceDeInvitacion(codigo);
    const datos = { title: "QuizMania", text: texto("textoInvitacion"), url: enlace };
    if (navigator.share) {
        try {
            await navigator.share(datos);
            return;
        } catch {
            // Cancelado o no permitido: se copia al portapapeles.
        }
    }
    elementos.mensajeCodigo.textContent = (await copiarAlPortapapeles(enlace)) ? texto("enlaceCopiado") : enlace;
}

/* ---------- Récords locales ---------- */

/** Pinta los récords guardados en este navegador. */
function pintarRecords(): void {
    const idioma = obtenerIdioma();
    elementos.listaRecords.replaceChildren(
        ...MODOS.map((modo) => {
            const { mejor, partidas } = leerRecord(modo.id);
            const fila = document.createElement("div");
            const nombre = document.createElement("dt");
            nombre.textContent = `${modo.icono} ${modo.nombre[idioma]}`;
            const valor = document.createElement("dd");
            valor.textContent = formatearPuntos(mejor, idioma);
            valor.title = `${partidas} ${texto("partidas")}`;
            fila.append(nombre, valor);
            return fila;
        }),
    );
}

/* ---------- Pantalla ---------- */

/** Rellena la pantalla de ranking (se llama al entrar en ella). */
export async function cargarPantallaRanking(): Promise<void> {
    pintarRecords();
    pintarCodigoPropio();
    elementos.mensajeCodigo.textContent = "";
    elementos.mensajeAmigo.textContent = "";
    if (!obtenerPerfil().codigo) {
        await subirPerfil();
        pintarCodigoPropio();
    }
    await Promise.all([cargarRanking(), cargarAmigos()]);
}

/**
 * Tras una partida: envía la puntuación y enseña cómo quedas entre tus
 * amigos en ese modo. Si no hay servidor, el bloque queda oculto.
 * @param modo Modo jugado.
 * @param puntos Puntos conseguidos.
 */
export async function mostrarComparacionConAmigos(modo: IdModo, puntos: number): Promise<void> {
    elementos.bloqueAmigos.hidden = true;
    try {
        await enviarPuntuacion(modo, puntos);
        const ranking = await obtenerRanking(modo, "amigos");
        const tieneAmigos = ranking.filas.length > 1;
        elementos.invitarAmigos.hidden = tieneAmigos;
        elementos.listaAmigosResultado.hidden = !tieneAmigos;
        elementos.posicionAmigos.textContent =
            tieneAmigos && ranking.miPosicion !== null ? `#${ranking.miPosicion} / ${ranking.filas.length}` : "";

        // Se enseñan los primeros y, si no estás entre ellos, también tu fila.
        const filas = ranking.filas.slice(0, FILAS_EN_RESULTADOS);
        const yo = ranking.filas.find((fila) => fila.soyYo);
        if (yo && !filas.includes(yo)) {
            filas[filas.length - 1] = yo;
        }
        elementos.listaAmigosResultado.replaceChildren(...filas.map(crearFilaRanking));
        elementos.bloqueAmigos.hidden = false;
    } catch {
        // Sin servidor: solo cuentan los récords locales.
    }
}

/** Si la página se abrió con ?amigo=CODIGO, devuelve ese código y lo quita de la URL. */
function leerInvitacionDeLaUrl(): string | null {
    const parametros = new URLSearchParams(location.search);
    const codigo = normalizarCodigo(parametros.get("amigo"));
    if (parametros.has("amigo")) {
        parametros.delete("amigo");
        const busqueda = parametros.toString();
        history.replaceState(null, "", `${location.pathname}${busqueda ? `?${busqueda}` : ""}${location.hash}`);
    }
    return codigo;
}

/**
 * Conecta los controles de la pantalla de ranking.
 * @param abrirPantalla Muestra la pantalla de ranking (lo decide main.ts).
 */
export function iniciarSocial(abrirPantalla: () => void): void {
    crearPestanasModo();
    elementos.botonesAmbito.forEach((boton) => {
        boton.addEventListener("click", () => {
            ambitoRanking = boton.dataset.ambito === "global" ? "global" : "amigos";
            void cargarRanking();
        });
    });
    elementos.formularioAmigo.addEventListener("submit", (evento) => {
        evento.preventDefault();
        void anadirAmigoPorCodigo(elementos.campoCodigoAmigo.value);
    });
    obtenerElemento("boton-copiar-codigo-social").addEventListener("click", async () => {
        const codigo = obtenerPerfil().codigo;
        if (codigo && (await copiarAlPortapapeles(codigo))) {
            elementos.mensajeCodigo.textContent = texto("codigoCopiado");
        }
    });
    obtenerElemento("boton-compartir").addEventListener("click", () => void compartirInvitacion());
    obtenerElemento("boton-invitar-resultados").addEventListener("click", () => void compartirInvitacion());

    document.addEventListener(EVENTO_IDIOMA_CAMBIADO, () => {
        pintarPestanas();
        pintarRecords();
    });
    document.addEventListener(EVENTO_PERFIL_CAMBIADO, pintarCodigoPropio);

    const invitacion = leerInvitacionDeLaUrl();
    if (invitacion) {
        abrirPantalla();
        void anadirAmigoPorCodigo(invitacion);
    }
}
