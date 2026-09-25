/**
 * social.ts
 * Pantalla de ranking y amigos, y la comparación con los amigos al acabar
 * una partida. Todo sale de Supabase (funciones de supabase/schema.sql):
 *   - Clasificación de puntos totales o del récord de cada modo, entre tus
 *     amigos o global (los 50 mejores). La global se ve también sin cuenta.
 *   - Añadir amigos por su nombre de usuario (la amistad es mutua) y quitarlos.
 *   - Enlace de invitación: …/?amigo=<usuario> añade a ese amigo al entrar.
 */

import type { IdModo } from "../config/modos";
import { buscarModo, MODOS } from "../config/modos";
import { esUsuarioValido, normalizarUsuario } from "../config/reglas";
import { abrirEntrar, mensajeDeErrorCuenta, pintarAvatar } from "../cuenta/interfaz-cuenta";
import { ErrorCuenta, EVENTO_SESION, hayOnline, nombreVisible, obtenerPerfil } from "../cuenta/sesion";
import { supabase } from "../cuenta/supabase";
import { EVENTO_IDIOMA_CAMBIADO, obtenerIdioma, texto } from "../i18n/textos";
import { formatearPuntos } from "../juego/puntuacion";
import { confirmar } from "../utilidades/confirmar";
import { copiarAlPortapapeles } from "../utilidades/portapapeles";
import { obtenerElemento } from "../utilidades/dom";

/** Filas que se enseñan en la comparación de la pantalla de resultados. */
const FILAS_EN_RESULTADOS = 5;

/** Clasificación: puntos totales o récord de un modo. */
type ModoRanking = IdModo | "total";

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
    pestanasModo: obtenerElemento("pestanas-modo"),
    botonesAmbito: [...document.querySelectorAll<HTMLButtonElement>(".boton-ambito")],
    listaRanking: obtenerElemento("lista-ranking"),
    estadoRanking: obtenerElemento("estado-ranking"),
    miPosicion: obtenerElemento("mi-posicion"),
    panelAmigos: obtenerElemento("panel-amigos"),
    amigosSinSesion: obtenerElemento("amigos-sin-sesion"),
    amigosConSesion: obtenerElemento("amigos-con-sesion"),
    miUsuario: obtenerElemento("mi-usuario-social"),
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
/** Evita pintar una respuesta vieja si se cambia de pestaña rápido. */
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
 * Crea el bloque de nombre de una fila: nombre visible y debajo @usuario.
 * @param jugador Usuario y nombre.
 * @param sufijo Texto a añadir al nombre (por ejemplo "(tú)").
 */
function crearNombre(jugador: { usuario: string; nombre: string | null }, sufijo = ""): HTMLElement {
    const bloque = document.createElement("span");
    bloque.className = "fila-nombre";
    const nombre = document.createElement("span");
    nombre.className = "fila-nombre-principal";
    nombre.textContent = sufijo ? `${nombreVisible(jugador)} ${sufijo}` : nombreVisible(jugador);
    const usuario = document.createElement("span");
    usuario.className = "fila-usuario";
    usuario.textContent = `@${jugador.usuario}`;
    bloque.append(nombre, usuario);
    return bloque;
}

/**
 * Crea la fila de un jugador (posición, avatar, nombre y puntos).
 * @param fila Datos de la fila.
 */
function crearFilaRanking(fila: FilaRanking): HTMLLIElement {
    const elemento = document.createElement("li");
    elemento.className = "fila-ranking";
    elemento.classList.toggle("es-yo", fila.soy_yo);
    if (fila.posicion !== null && fila.posicion <= 3) {
        elemento.classList.add(`podio-${fila.posicion}`);
    }

    const posicion = document.createElement("span");
    posicion.className = "fila-posicion";
    posicion.textContent = fila.posicion === null ? "–" : String(fila.posicion);

    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.setAttribute("aria-hidden", "true");
    pintarAvatar(avatar, { id: fila.id, usuario: fila.usuario, nombre: fila.nombre, avatarVersion: fila.avatar_version });

    const nombre = crearNombre(fila, fila.soy_yo ? `(${texto("tu")})` : "");

    const puntos = document.createElement("span");
    puntos.className = "fila-puntos";
    puntos.textContent = fila.puntos === null ? texto("sinJugar") : formatearPuntos(fila.puntos, obtenerIdioma());

    elemento.append(posicion, avatar, nombre, puntos);
    return elemento;
}

/* ---------- Clasificación ---------- */

/** Crea las pestañas: puntos totales y un récord por modo. */
function crearPestanasModo(): void {
    const opciones: ModoRanking[] = ["total", ...MODOS.map((modo) => modo.id)];
    elementos.pestanasModo.replaceChildren(
        ...opciones.map((opcion) => {
            const boton = document.createElement("button");
            boton.type = "button";
            boton.className = "pestana";
            boton.dataset.modo = opcion;
            boton.addEventListener("click", () => {
                modoRanking = opcion;
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
        const opcion = boton.dataset.modo ?? "total";
        if (opcion === "total") {
            boton.textContent = `🏆 ${texto("puntosTotales")}`;
        } else {
            const modo = buscarModo(opcion);
            boton.textContent = `${modo.icono} ${modo.nombre[idioma]}`;
        }
        boton.setAttribute("aria-pressed", String(opcion === modoRanking));
    });
    elementos.botonesAmbito.forEach((boton) => {
        boton.setAttribute("aria-pressed", String(boton.dataset.ambito === ambitoRanking));
    });
}

/** Descarga y pinta la clasificación elegida. */
async function cargarRanking(): Promise<void> {
    const miPeticion = ++peticionRanking;
    pintarPestanas();
    elementos.estadoRanking.textContent = texto("cargando");
    elementos.estadoRanking.hidden = false;
    elementos.listaRanking.replaceChildren();
    elementos.miPosicion.textContent = "";

    if (ambitoRanking === "amigos" && !obtenerPerfil()) {
        elementos.estadoRanking.textContent = texto("entraParaAmigos");
        return;
    }
    try {
        const filas = await pedirRanking(modoRanking, ambitoRanking);
        if (miPeticion !== peticionRanking) return;
        elementos.listaRanking.replaceChildren(...filas.map(crearFilaRanking));
        const soloYo = ambitoRanking === "amigos" && filas.length <= 1;
        elementos.estadoRanking.hidden = filas.length > 0 && !soloYo;
        elementos.estadoRanking.textContent = soloYo ? texto("sinAmigosTodavia") : texto("rankingVacio");
        const yo = filas.find((fila) => fila.soy_yo);
        if (yo?.posicion) {
            elementos.miPosicion.textContent = `${texto("tuPosicion")}: #${yo.posicion}`;
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

    const avatar = document.createElement("span");
    avatar.className = "avatar";
    avatar.setAttribute("aria-hidden", "true");
    pintarAvatar(avatar, { id: amigo.id, usuario: amigo.usuario, nombre: amigo.nombre, avatarVersion: amigo.avatar_version });

    const nombre = crearNombre(amigo);

    const puntos = document.createElement("span");
    puntos.className = "fila-puntos fila-puntos--suave";
    puntos.textContent = `${formatearPuntos(Number(amigo.puntos_totales), obtenerIdioma())} pts`;

    const quitar = document.createElement("button");
    quitar.type = "button";
    quitar.className = "boton-icono boton-icono--pequeno";
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
        elemento.remove();
        void cargarRanking();
    });

    elemento.append(avatar, nombre, puntos, quitar);
    return elemento;
}

/** Pinta el panel de amigos según haya sesión o no, y carga la lista. */
async function cargarAmigos(): Promise<void> {
    const perfil = obtenerPerfil();
    elementos.amigosSinSesion.hidden = perfil !== null;
    elementos.amigosConSesion.hidden = perfil === null;
    if (!perfil) return;
    elementos.miUsuario.textContent = perfil.usuario;
    const { data, error } = await cliente().rpc("mis_amigos");
    const amigos = error ? [] : (data as Amigo[]);
    elementos.listaAmigos.replaceChildren(...amigos.map(crearFilaAmigo));
    elementos.listaAmigos.dataset.vacia = String(amigos.length === 0);
}

/**
 * Añade un amigo por su usuario y refresca las listas.
 * @param usuarioEscrito Usuario tal como lo escribió el jugador.
 */
async function anadirAmigo(usuarioEscrito: string): Promise<void> {
    const usuario = normalizarUsuario(usuarioEscrito.replace(/^@/, ""));
    elementos.mensajeAmigo.classList.remove("es-error");
    if (!esUsuarioValido(usuario)) {
        elementos.mensajeAmigo.textContent = texto("errorUsuarioNoValido");
        elementos.mensajeAmigo.classList.add("es-error");
        return;
    }
    elementos.mensajeAmigo.textContent = texto("cargando");
    const { data, error } = await cliente().rpc("anadir_amigo", { p_usuario: usuario });
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

/** Comparte (o copia) el enlace de invitación con el usuario propio. */
async function compartirInvitacion(): Promise<void> {
    const perfil = obtenerPerfil();
    if (!perfil) {
        abrirEntrar();
        return;
    }
    const enlace = `${location.origin}${location.pathname}?amigo=${encodeURIComponent(perfil.usuario)}`;
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
        elementos.posicionAmigos.textContent = tieneAmigos && yo?.posicion ? `#${yo.posicion} / ${filas.length}` : "";

        // Se enseñan los primeros y, si no estás entre ellos, también tu fila.
        const visibles = filas.slice(0, FILAS_EN_RESULTADOS);
        if (yo && !visibles.includes(yo)) visibles[visibles.length - 1] = yo;
        elementos.listaAmigosResultado.replaceChildren(...visibles.map(crearFilaRanking));
        elementos.bloqueAmigos.hidden = false;
    } catch {
        // Sin conexión: no se enseña la comparación.
    }
}

/** Si la página se abrió con ?amigo=usuario, devuelve ese usuario y lo quita de la URL. */
function leerInvitacionDeLaUrl(): string | null {
    const parametros = new URLSearchParams(location.search);
    const usuario = normalizarUsuario(parametros.get("amigo") ?? "");
    if (parametros.has("amigo")) {
        parametros.delete("amigo");
        const busqueda = parametros.toString();
        history.replaceState(null, "", `${location.pathname}${busqueda ? `?${busqueda}` : ""}${location.hash}`);
    }
    return esUsuarioValido(usuario) ? usuario : null;
}

/**
 * Conecta los controles de la pantalla de ranking.
 * @param abrirPantalla Muestra la pantalla de ranking (lo decide main.ts).
 */
export function iniciarSocial(abrirPantalla: () => void): void {
    if (!hayOnline()) return;
    crearPestanasModo();
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

    document.addEventListener(EVENTO_IDIOMA_CAMBIADO, pintarPestanas);
    document.addEventListener(EVENTO_SESION, () => {
        if (!obtenerElemento("pantalla-ranking").hidden) void cargarPantallaRanking();
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
