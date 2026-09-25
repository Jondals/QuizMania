/**
 * social.ts
 * Pantalla de ranking y amigos, y la comparación con los amigos al acabar
 * una partida. Todo sale de Supabase (funciones de supabase/schema.sql):
 *   - Clasificación de puntos totales o del récord de cada modo, entre tus
 *     amigos o global (los 50 mejores). La global se ve también sin cuenta.
 *     Los tres primeros salen en un podio; se cambia de clasificación con el
 *     desplegable, con las flechas ◀ ▶ o con ← → del teclado.
 *   - Añadir amigos por su código de amigo o su usuario (la amistad es
 *     mutua) y quitarlos.
 *   - Enlace de invitación: …/?amigo=<código> añade a ese amigo al entrar.
 */

import type { IdModo } from "../config/modos";
import { buscarModo, MODOS } from "../config/modos";
import { abrirEntrar, mensajeDeErrorCuenta, pintarAvatar } from "../cuenta/interfaz-cuenta";
import { ErrorCuenta, EVENTO_SESION, hayOnline, nombreVisible, obtenerPerfil } from "../cuenta/sesion";
import { supabase } from "../cuenta/supabase";
import { EVENTO_IDIOMA_CAMBIADO, obtenerIdioma, texto } from "../i18n/textos";
import { formatearPuntos } from "../juego/puntuacion";
import { confirmar } from "../utilidades/confirmar";
import { obtenerElemento } from "../utilidades/dom";
import { copiarAlPortapapeles } from "../utilidades/portapapeles";

/** Filas que se enseñan en la comparación de la pantalla de resultados. */
const FILAS_EN_RESULTADOS = 5;
/** Lo que se acepta como código o usuario de un amigo. */
const FORMATO_AMIGO = /^[a-z0-9_]{3,20}$/i;

/** Clasificación: puntos totales o récord de un modo. */
type ModoRanking = IdModo | "total";
const CLASIFICACIONES: readonly ModoRanking[] = ["total", ...MODOS.map((modo) => modo.id)];

/** Fila de una clasificación. */
interface FilaRanking {
    posicion: number | null;
    id: string;
    usuario: string;
    nombre: string | null;
    avatar_version: number | null;
    puntos: number | null;
    soy_yo: boolean;
}

/** Amigo en la lista de amigos. */
interface Amigo {
    id: string;
    usuario: string;
    nombre: string | null;
    avatar_version: number | null;
    puntos_totales: number;
}

const elementos = {
    pantalla: obtenerElemento("pantalla-ranking"),
    selectorModo: obtenerElemento("selector-ranking-modo", HTMLSelectElement),
    flechaAnterior: obtenerElemento("ranking-anterior", HTMLButtonElement),
    flechaSiguiente: obtenerElemento("ranking-siguiente", HTMLButtonElement),
    botonesAmbito: [...document.querySelectorAll<HTMLButtonElement>(".boton-ambito")],
    podio: obtenerElemento("podio"),
    listaRanking: obtenerElemento("lista-ranking"),
    estadoRanking: obtenerElemento("estado-ranking"),
    miPosicion: obtenerElemento("mi-posicion"),
    amigosSinSesion: obtenerElemento("amigos-sin-sesion"),
    amigosConSesion: obtenerElemento("amigos-con-sesion"),
    miCodigo: obtenerElemento("mi-codigo-social"),
    mensajeInvitacion: obtenerElemento("mensaje-invitacion"),
    formularioAmigo: obtenerElemento("formulario-amigo", HTMLFormElement),
    campoAmigo: obtenerElemento("campo-amigo", HTMLInputElement),
    mensajeAmigo: obtenerElemento("mensaje-amigo"),
    listaAmigos: obtenerElemento("lista-amigos"),
    bloqueAmigos: obtenerElemento("bloque-amigos"),
    posicionAmigos: obtenerElemento("posicion-amigos"),
    listaAmigosResultado: obtenerElemento("lista-amigos-resultado"),
    invitarAmigos: obtenerElemento("invitar-amigos"),
};

let modoRanking: ModoRanking = "total";
let ambitoRanking: "amigos" | "global" = "global";
/** Evita pintar una respuesta vieja si se cambia de clasificación rápido. */
let peticionRanking = 0;

/** Devuelve el cliente de Supabase o lanza un error. */
function cliente() {
    if (!supabase) throw new ErrorCuenta("sin-servidor");
    return supabase;
}

/**
 * Convierte el error de una función de la base de datos en ErrorCuenta.
 * @param error Error de Supabase.
 */
function errorDeBaseDeDatos(error: { message?: string }): ErrorCuenta {
    const codigo = (error.message ?? "").trim();
    return new ErrorCuenta(/^[a-z-]+$/.test(codigo) ? codigo : "sin-conexion");
}

/**
 * Pide una clasificación al servidor.
 * @param modo "total" o id de modo.
 * @param ambito "amigos" o "global".
 */
async function pedirRanking(modo: ModoRanking, ambito: "amigos" | "global"): Promise<FilaRanking[]> {
    const { data, error } = await cliente().rpc("ranking", { p_modo: modo, p_ambito: ambito, p_limite: 50 });
    if (error) throw errorDeBaseDeDatos(error);
    return (data as FilaRanking[]).map((fila) => ({
        ...fila,
        posicion: fila.posicion === null ? null : Number(fila.posicion),
        puntos: fila.puntos === null ? null : Number(fila.puntos),
    }));
}

/**
 * Crea un avatar pequeño de un jugador.
 * @param jugador Datos del jugador.
 * @param clase Clase extra de tamaño.
 */
function crearAvatar(jugador: { id: string; usuario: string; nombre: string | null; avatar_version: number | null }, clase = ""): HTMLElement {
    const avatar = document.createElement("span");
    avatar.className = `avatar ${clase}`.trim();
    avatar.setAttribute("aria-hidden", "true");
    pintarAvatar(avatar, { id: jugador.id, usuario: jugador.usuario, nombre: jugador.nombre, avatarVersion: jugador.avatar_version });
    return avatar;
}

/**
 * Texto de los puntos de una fila.
 * @param puntos Puntos o null si no ha jugado.
 */
function textoPuntos(puntos: number | null): string {
    return puntos === null ? texto("sinJugar") : formatearPuntos(puntos, obtenerIdioma());
}

/**
 * Crea la fila de un jugador (posición, avatar, nombre y puntos).
 * @param fila Datos de la fila.
 * @param orden Orden en la lista (para escalonar la animación de entrada).
 */
function crearFilaRanking(fila: FilaRanking, orden = 0): HTMLLIElement {
    const elemento = document.createElement("li");
    elemento.className = "fila-ranking";
    elemento.classList.toggle("es-yo", fila.soy_yo);
    elemento.style.setProperty("--orden", String(orden));
    if (fila.posicion !== null && fila.posicion <= 3) {
        elemento.classList.add(`podio-${fila.posicion}`);
    }

    const posicion = document.createElement("span");
    posicion.className = "fila-posicion";
    posicion.textContent = fila.posicion === null ? "–" : String(fila.posicion);

    const nombre = document.createElement("span");
    nombre.className = "fila-nombre";
    nombre.textContent = nombreVisible(fila);
    if (fila.soy_yo) nombre.title = texto("tu");

    const puntos = document.createElement("span");
    puntos.className = "fila-puntos";
    puntos.textContent = textoPuntos(fila.puntos);

    elemento.append(posicion, crearAvatar(fila), nombre, puntos);
    return elemento;
}

/**
 * Crea una columna del podio.
 * @param fila Jugador de esa posición.
 * @param puesto 1, 2 o 3.
 */
function crearColumnaPodio(fila: FilaRanking, puesto: number): HTMLElement {
    const columna = document.createElement("div");
    columna.className = `podio-columna podio-columna--${puesto}`;
    columna.classList.toggle("es-yo", fila.soy_yo);

    const avatar = crearAvatar(fila, puesto === 1 ? "avatar--podio-grande" : "avatar--podio");
    const nombre = document.createElement("span");
    nombre.className = "podio-nombre";
    nombre.textContent = nombreVisible(fila);
    const puntos = document.createElement("span");
    puntos.className = "podio-puntos";
    puntos.textContent = textoPuntos(fila.puntos);
    const pedestal = document.createElement("span");
    pedestal.className = "podio-pedestal";
    pedestal.textContent = String(puesto);

    columna.append(avatar, nombre, puntos, pedestal);
    return columna;
}

/* ---------- Clasificación ---------- */

/** Crea las opciones del desplegable: puntos totales y un récord por modo. */
function crearSelectorClasificacion(): void {
    elementos.selectorModo.replaceChildren(
        ...CLASIFICACIONES.map((opcion) => {
            const elemento = document.createElement("option");
            elemento.value = opcion;
            return elemento;
        }),
    );
    elementos.selectorModo.addEventListener("change", () => {
        modoRanking = elementos.selectorModo.value as ModoRanking;
        void cargarRanking();
    });
    elementos.flechaAnterior.addEventListener("click", () => moverClasificacion(-1));
    elementos.flechaSiguiente.addEventListener("click", () => moverClasificacion(1));
    pintarSelectorClasificacion();
}

/**
 * Pasa a la clasificación anterior o siguiente (en círculo).
 * @param paso -1 anterior, +1 siguiente.
 */
function moverClasificacion(paso: 1 | -1): void {
    const posicion = CLASIFICACIONES.indexOf(modoRanking);
    modoRanking = CLASIFICACIONES[(posicion + paso + CLASIFICACIONES.length) % CLASIFICACIONES.length];
    void cargarRanking();
}

/** Actualiza los textos del desplegable y la selección del ámbito. */
function pintarSelectorClasificacion(): void {
    const idioma = obtenerIdioma();
    for (const opcion of elementos.selectorModo.options) {
        if (opcion.value === "total") {
            opcion.textContent = `🏆 ${texto("puntosTotales")}`;
        } else {
            const modo = buscarModo(opcion.value);
            opcion.textContent = `${modo.icono} ${texto("recordDe")} ${modo.nombre[idioma]}`;
        }
    }
    elementos.selectorModo.value = modoRanking;
    elementos.botonesAmbito.forEach((boton) => {
        boton.setAttribute("aria-pressed", String(boton.dataset.ambito === ambitoRanking));
    });
}

/** Descarga y pinta la clasificación elegida (podio + lista). */
async function cargarRanking(): Promise<void> {
    const miPeticion = ++peticionRanking;
    pintarSelectorClasificacion();
    elementos.estadoRanking.textContent = texto("cargando");
    elementos.estadoRanking.hidden = false;
    elementos.podio.replaceChildren();
    elementos.listaRanking.replaceChildren();
    elementos.miPosicion.textContent = "";

    if (ambitoRanking === "amigos" && !obtenerPerfil()) {
        elementos.estadoRanking.textContent = texto("entraParaAmigos");
        return;
    }
    try {
        const filas = await pedirRanking(modoRanking, ambitoRanking);
        if (miPeticion !== peticionRanking) return;

        // Los tres primeros (con puntos) van al podio, en orden 2 · 1 · 3.
        const podio = filas.filter((fila) => fila.posicion !== null && fila.posicion <= 3).slice(0, 3);
        const resto = filas.filter((fila) => !podio.includes(fila));
        const columnas = [podio[1], podio[0], podio[2]]
            .map((fila, indice) => (fila ? crearColumnaPodio(fila, [2, 1, 3][indice]) : null))
            .filter((columna): columna is HTMLElement => columna !== null);
        elementos.podio.replaceChildren(...columnas);
        elementos.listaRanking.replaceChildren(...resto.map((fila, orden) => crearFilaRanking(fila, orden)));

        const soloYo = ambitoRanking === "amigos" && filas.length <= 1;
        elementos.estadoRanking.hidden = filas.length > 0 && !soloYo;
        elementos.estadoRanking.textContent = soloYo ? texto("sinAmigosTodavia") : texto("rankingVacio");
        const yo = filas.find((fila) => fila.soy_yo);
        if (yo?.posicion) {
            elementos.miPosicion.textContent = `${texto("tuPosicion")}: ${yo.posicion}º · ${textoPuntos(yo.puntos)} pts`;
        }
    } catch (error) {
        if (miPeticion !== peticionRanking) return;
        elementos.estadoRanking.textContent = mensajeDeErrorCuenta(error);
    }
}

/* ---------- Amigos ---------- */

/**
 * Crea la fila de un amigo con el botón de quitar.
 * @param amigo Datos del amigo.
 */
function crearFilaAmigo(amigo: Amigo): HTMLLIElement {
    const elemento = document.createElement("li");
    elemento.className = "fila-amigo";

    const nombre = document.createElement("span");
    nombre.className = "fila-nombre";
    nombre.textContent = nombreVisible(amigo);

    const puntos = document.createElement("span");
    puntos.className = "fila-puntos fila-puntos--suave";
    puntos.textContent = `${formatearPuntos(Number(amigo.puntos_totales), obtenerIdioma())} pts`;

    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.className = "boton-icono boton-icono--pequeno boton-quitar";
    quitar.textContent = "✕";
    quitar.setAttribute("aria-label", `${texto("quitarAmigo")}: ${nombreVisible(amigo)}`);
    quitar.addEventListener("click", async () => {
        const acepta = await confirmar({
            titulo: texto("quitarAmigo"),
            mensaje: `${texto("confirmarQuitarAmigo")} ${nombreVisible(amigo)}?`,
            aceptar: texto("quitarAmigo"),
            peligroso: true,
        });
        if (!acepta) return;
        const { error } = await cliente().rpc("quitar_amigo", { p_amigo: amigo.id });
        if (error) {
            elementos.mensajeAmigo.textContent = mensajeDeErrorCuenta(errorDeBaseDeDatos(error));
            return;
        }
        elemento.classList.add("saliendo");
        setTimeout(() => {
            elemento.remove();
            elementos.listaAmigos.dataset.vacia = String(elementos.listaAmigos.children.length === 0);
        }, 250);
        void cargarRanking();
    });

    elemento.append(crearAvatar(amigo), nombre, puntos, quitar);
    return elemento;
}

/** Pinta el panel de amigos según haya sesión o no, y carga la lista. */
async function cargarAmigos(): Promise<void> {
    const perfil = obtenerPerfil();
    elementos.amigosSinSesion.hidden = perfil !== null;
    elementos.amigosConSesion.hidden = perfil === null;
    if (!perfil) return;
    elementos.miCodigo.textContent = perfil.codigo ?? "—";
    const { data, error } = await cliente().rpc("mis_amigos");
    const amigos = error ? [] : (data as Amigo[]);
    elementos.listaAmigos.replaceChildren(...amigos.map(crearFilaAmigo));
    elementos.listaAmigos.dataset.vacia = String(amigos.length === 0);
}

/**
 * Añade un amigo por su código o su usuario y refresca las listas.
 * @param escrito Lo que escribió el jugador.
 */
async function anadirAmigo(escrito: string): Promise<void> {
    const limpio = escrito.trim().replace(/[\s#@-]/g, "");
    elementos.mensajeAmigo.classList.remove("es-error");
    if (!FORMATO_AMIGO.test(limpio)) {
        elementos.mensajeAmigo.textContent = texto("errorCodigoOUsuario");
        elementos.mensajeAmigo.classList.add("es-error");
        return;
    }
    elementos.mensajeAmigo.textContent = texto("cargando");
    const { data, error } = await cliente().rpc("anadir_amigo", { p_usuario: limpio });
    if (error) {
        elementos.mensajeAmigo.textContent = mensajeDeErrorCuenta(errorDeBaseDeDatos(error));
        elementos.mensajeAmigo.classList.add("es-error");
        return;
    }
    elementos.mensajeAmigo.textContent = `${texto("amigoAnadido")}: ${nombreVisible(data as Amigo)}`;
    elementos.campoAmigo.value = "";
    ambitoRanking = "amigos";
    await Promise.all([cargarAmigos(), cargarRanking()]);
}

/** Comparte (o copia) el enlace de invitación con el código propio. */
async function compartirInvitacion(): Promise<void> {
    const perfil = obtenerPerfil();
    if (!perfil) {
        abrirEntrar();
        return;
    }
    const enlace = `${location.origin}${location.pathname}?amigo=${encodeURIComponent(perfil.codigo ?? perfil.usuario)}`;
    if (navigator.share) {
        try {
            await navigator.share({ title: "QuizMania", text: texto("textoInvitacion"), url: enlace });
            return;
        } catch {
            // Cancelado o no permitido: se copia al portapapeles.
        }
    }
    elementos.mensajeInvitacion.textContent = (await copiarAlPortapapeles(enlace)) ? texto("enlaceCopiado") : enlace;
}

/* ---------- Pantalla y resultados ---------- */

/** Rellena la pantalla de ranking (se llama al entrar en ella). */
export async function cargarPantallaRanking(): Promise<void> {
    elementos.mensajeAmigo.textContent = "";
    elementos.mensajeInvitacion.textContent = "";
    if (!obtenerPerfil() && ambitoRanking === "amigos") {
        ambitoRanking = "global";
    }
    await Promise.all([cargarRanking(), cargarAmigos()]);
}

/**
 * Tras una partida guardada: enseña cómo quedas entre tus amigos en ese modo.
 * @param modo Modo jugado.
 */
export async function mostrarComparacionConAmigos(modo: IdModo): Promise<void> {
    elementos.bloqueAmigos.hidden = true;
    if (!obtenerPerfil()) return;
    try {
        const filas = await pedirRanking(modo, "amigos");
        const tieneAmigos = filas.length > 1;
        const yo = filas.find((fila) => fila.soy_yo);
        elementos.invitarAmigos.hidden = tieneAmigos;
        elementos.listaAmigosResultado.hidden = !tieneAmigos;
        elementos.posicionAmigos.textContent = tieneAmigos && yo?.posicion ? `${yo.posicion}º / ${filas.length}` : "";

        // Se enseñan los primeros y, si no estás entre ellos, también tu fila.
        const visibles = filas.slice(0, FILAS_EN_RESULTADOS);
        if (yo && !visibles.includes(yo)) visibles[visibles.length - 1] = yo;
        elementos.listaAmigosResultado.replaceChildren(...visibles.map((fila, orden) => crearFilaRanking(fila, orden)));
        elementos.bloqueAmigos.hidden = false;
    } catch {
        // Sin conexión: no se enseña la comparación.
    }
}

/** Si la página se abrió con ?amigo=código (o usuario), lo devuelve y lo quita de la URL. */
function leerInvitacionDeLaUrl(): string | null {
    const parametros = new URLSearchParams(location.search);
    const amigo = (parametros.get("amigo") ?? "").trim();
    if (parametros.has("amigo")) {
        parametros.delete("amigo");
        const busqueda = parametros.toString();
        history.replaceState(null, "", `${location.pathname}${busqueda ? `?${busqueda}` : ""}${location.hash}`);
    }
    return FORMATO_AMIGO.test(amigo) ? amigo : null;
}

/**
 * Conecta los controles de la pantalla de ranking.
 * @param abrirPantalla Muestra la pantalla de ranking (lo decide main.ts).
 */
export function iniciarSocial(abrirPantalla: () => void): void {
    if (!hayOnline()) return;
    crearSelectorClasificacion();
    elementos.botonesAmbito.forEach((boton) => {
        boton.addEventListener("click", () => {
            ambitoRanking = boton.dataset.ambito === "amigos" ? "amigos" : "global";
            void cargarRanking();
        });
    });
    elementos.formularioAmigo.addEventListener("submit", (evento) => {
        evento.preventDefault();
        void anadirAmigo(elementos.campoAmigo.value);
    });
    obtenerElemento("boton-compartir").addEventListener("click", () => void compartirInvitacion());
    obtenerElemento("boton-invitar-resultados").addEventListener("click", () => void compartirInvitacion());

    // En la pantalla de ranking, ← y → cambian de clasificación.
    document.addEventListener("keydown", (evento) => {
        if (elementos.pantalla.hidden || (evento.key !== "ArrowLeft" && evento.key !== "ArrowRight")) return;
        const objetivo = evento.target as HTMLElement | null;
        if (objetivo?.closest("input, textarea, select") || document.querySelector("dialog[open]")) return;
        evento.preventDefault();
        moverClasificacion(evento.key === "ArrowLeft" ? -1 : 1);
    });

    document.addEventListener(EVENTO_IDIOMA_CAMBIADO, pintarSelectorClasificacion);
    document.addEventListener(EVENTO_SESION, () => {
        if (!elementos.pantalla.hidden) void cargarPantallaRanking();
    });

    const invitacion = leerInvitacionDeLaUrl();
    if (invitacion) {
        const aceptar = () => {
            abrirPantalla();
            void anadirAmigo(invitacion);
        };
        if (obtenerPerfil()) aceptar();
        else abrirEntrar("registro", aceptar);
    }
}
