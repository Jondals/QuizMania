/**
 * social.ts
 * Ranking y amigos, y la comparación con los amigos al acabar una partida.
 * Todo sale de Supabase (funciones de supabase/schema.sql):
 *   - Clasificación de puntos totales o del récord de cada modo, entre tus
 *     amigos o global (los 50 mejores). La global se ve también sin cuenta.
 *     Los tres primeros salen en un podio; se cambia de clasificación con el
 *     desplegable, con las flechas ◀ ▶ o con ← → del teclado, y las filas
 *     entran con un escalonado suave cada vez que cambia la lista. Debajo del
 *     podio va la lista con todos y, de cada uno, sus partidas, aciertos y
 *     precisión. Encima van tus propias estadísticas.
 *   - Amigos: el panel vive en el menú de la cuenta (la foto de la cabecera) y
 *     se pliega y despliega entero: tu código para compartir, el formulario
 *     para añadir por código o usuario (la amistad es mutua) y la lista, con el
 *     botón de quitar a cada uno. Se refresca al entrar y al salir.
 *   - Enlace de invitación: …/?amigo=<código> abre el menú de amigos con el
 *     formulario preparado para añadir a ese amigo.
 */

import type { IdModo } from "../config/modos";
import { buscarModo, MODOS } from "../config/modos";
import { abrirEntrar, abrirMenuCuenta, mensajeDeErrorCuenta, pintarAvatar } from "../cuenta/interfaz-cuenta";
import { ErrorCuenta, EVENTO_SESION, generarCodigoLocal, hayOnline, nombreVisible, obtenerPerfil } from "../cuenta/sesion";
import { supabase } from "../cuenta/supabase";
import { EVENTO_IDIOMA_CAMBIADO, obtenerIdioma, texto } from "../i18n/textos";
import { formatearPuntos } from "../juego/puntuacion";
import { confirmar } from "../utilidades/confirmar";
import { obtenerElemento } from "../utilidades/dom";
import { copiarAlPortapapeles } from "../utilidades/portapapeles";

/** Filas que se enseñan en la comparación de la pantalla de resultados. */
const FILAS_EN_RESULTADOS = 5;
/**
 * Formato aceptado al buscar un amigo:
 *   - Código de amigo: 6 caracteres exactos del alfabeto seguro (sin I, O, 0, 1).
 *   - Usuario: 3-20 caracteres alfanuméricos (minúsculas, dígitos, guion bajo).
 * La BD busca primero por código, y si no coincide, por usuario.
 */
const FORMATO_AMIGO = /^[A-HJ-NP-Z2-9]{6}$|^[a-z0-9_]{3,20}$/i;

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
    partidas: number | null;
    aciertos: number | null;
    preguntas: number | null;
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
    cuentaAmigos: obtenerElemento("cuenta-amigos"),
    miCodigo: obtenerElemento("mi-codigo-social"),
    mensajeInvitacion: obtenerElemento("mensaje-invitacion"),
    estadisticasRanking: obtenerElemento("estadisticas-ranking"),
    statPartidasRanking: obtenerElemento("stat-partidas-ranking"),
    statAciertosRanking: obtenerElemento("stat-aciertos-ranking"),
    statPrecisionRanking: obtenerElemento("stat-precision-ranking"),
    formularioAmigo: obtenerElemento("formulario-amigo", HTMLFormElement),
    campoAmigo: obtenerElemento("campo-amigo", HTMLInputElement),
    mensajeAmigo: obtenerElemento("mensaje-amigo"),
    desplegableAmigos: obtenerElemento("desplegable-amigos"),
    botonDesplegableAmigos: obtenerElemento("boton-desplegable-amigos", HTMLButtonElement),
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
        partidas: Number(fila.partidas ?? 0),
        aciertos: Number(fila.aciertos ?? 0),
        preguntas: Number(fila.preguntas ?? 0),
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

/** Porcentaje de aciertos de un jugador ("—" si no ha respondido nada). */
function textoPrecision(preguntas: number, aciertos: number): string {
    return preguntas > 0 ? `${Math.round((aciertos / preguntas) * 100)}%` : "–";
}

/**
 * Crea la fila de un jugador (posición, avatar, nombre, puntos y sus números).
 * @param fila Datos de la fila.
 * @param orden Orden en la lista (para escalonar la animación de entrada).
 * @param conNumeros false en la comparación de resultados, que ya se ve justa.
 */
function crearFilaRanking(fila: FilaRanking, orden = 0, conNumeros = true): HTMLLIElement {
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

    if (conNumeros) {
        // Los tres números van dentro de un envoltorio: con `display: contents`
        // cada uno cae en su columna, pero en móvil se convierte en una fila
        // debajo del nombre, porque en una sola línea no caben los siete campos.
        const numeros = document.createElement("span");
        numeros.className = "fila-stats";
        const partidas = document.createElement("span");
        partidas.className = "fila-dato";
        partidas.textContent = formatearPuntos(fila.partidas ?? 0, obtenerIdioma());
        const aciertos = document.createElement("span");
        aciertos.className = "fila-dato";
        aciertos.textContent = formatearPuntos(fila.aciertos ?? 0, obtenerIdioma());
        const precision = document.createElement("span");
        precision.className = "fila-dato fila-dato--fuerte";
        precision.textContent = textoPrecision(fila.preguntas ?? 0, fila.aciertos ?? 0);
        numeros.append(partidas, aciertos, precision);
        elemento.append(numeros);
    }
    return elemento;
}

/**
 * Reinicia la animación escalonada de las filas de una lista.
 * Se quita la clase, se fuerza un recálculo y se vuelve a poner: así las
 * filas entran con el efecto también cuando solo cambian los datos (al
 * cambiar de clasificación), no únicamente la primera vez que se pinta.
 * @param lista Lista cuyas filas se animan.
 */
function animarFilasLista(lista: HTMLElement): void {
    lista.classList.remove("entrando");
    void lista.offsetWidth; // Fuerza el recálculo para que la animación se reinicie.
    lista.classList.add("entrando");
}

/**
 * Crea la columna del podio: avatar, nombre, puntos, sus números y el pedestal.
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

    // Partidas, aciertos y porcentaje bajo el nombre: los tres números pedidos.
    const numeros = document.createElement("span");
    numeros.className = "podio-numeros";
    const partidas = document.createElement("span");
    partidas.className = "podio-numero";
    partidas.textContent = `${formatearPuntos(fila.partidas ?? 0, obtenerIdioma())} ${texto("partidasCorto")}`;
    const aciertos = document.createElement("span");
    aciertos.className = "podio-numero";
    aciertos.textContent = `${formatearPuntos(fila.aciertos ?? 0, obtenerIdioma())} ${texto("aciertosCorto")}`;
    const precision = document.createElement("span");
    precision.className = "podio-numero podio-numero--fuerte";
    precision.textContent = textoPrecision(fila.preguntas ?? 0, fila.aciertos ?? 0);
    numeros.append(partidas, aciertos, precision);

    const pedestal = document.createElement("span");
    pedestal.className = "podio-pedestal";
    pedestal.textContent = String(puesto);

    columna.append(avatar, nombre, puntos, numeros, pedestal);
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

/**
 * Pinta las estadísticas de tus partidas (partidas, aciertos y precisión)
 * en la cabecera del ranking. Sin sesión no hay nada que enseñar.
 */
function pintarEstadisticasRanking(): void {
    const perfil = obtenerPerfil();
    const idioma = obtenerIdioma();
    elementos.estadisticasRanking.hidden = perfil === null;
    if (!perfil) return;
    elementos.statPartidasRanking.textContent = formatearPuntos(perfil.partidas, idioma);
    elementos.statAciertosRanking.textContent = formatearPuntos(perfil.aciertos, idioma);
    elementos.statPrecisionRanking.textContent =
        perfil.preguntas > 0 ? `${Math.round((perfil.aciertos / perfil.preguntas) * 100)}%` : "–";
}

/** Descarga y pinta la clasificación elegida (podio + lista). */
async function cargarRanking(): Promise<void> {
    const miPeticion = ++peticionRanking;
    pintarSelectorClasificacion();
    elementos.estadoRanking.textContent = texto("cargando");
    elementos.estadoRanking.hidden = false;
    elementos.miPosicion.textContent = "";

    if (ambitoRanking === "amigos" && !obtenerPerfil()) {
        elementos.podio.replaceChildren();
        elementos.listaRanking.replaceChildren();
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
        // Las filas viejas se quedan hasta tener las nuevas: el cambio se ve
        // como una entrada suave, sin el parpadeo de la lista vacía.
        elementos.podio.replaceChildren(...columnas);
        elementos.listaRanking.replaceChildren(...resto.map((fila, orden) => crearFilaRanking(fila, orden)));
        animarFilasLista(elementos.listaRanking);

        const soloYo = ambitoRanking === "amigos" && filas.length <= 1;
        elementos.estadoRanking.hidden = filas.length > 0 && !soloYo;
        elementos.estadoRanking.textContent = soloYo ? texto("sinAmigosTodavia") : texto("rankingVacio");
        const yo = filas.find((fila) => fila.soy_yo);
        if (yo?.posicion) {
            elementos.miPosicion.textContent = `${texto("tuPosicion")}: ${yo.posicion}º · ${textoPuntos(yo.puntos)} pts`;
        }
    } catch (error) {
        if (miPeticion !== peticionRanking) return;
        elementos.podio.replaceChildren();
        elementos.listaRanking.replaceChildren();
        elementos.estadoRanking.textContent = mensajeDeErrorCuenta(error);
    }
}

/* ---------- Amigos ---------- */

/**
 * Abre o cierra el desplegable del panel de amigos (código, formulario y lista).
 * @param abrir true para desplegarlo, false para plegarlo.
 */
function mostrarDesplegableAmigos(abrir: boolean): void {
    elementos.desplegableAmigos.classList.toggle("abierto", abrir);
    elementos.botonDesplegableAmigos.setAttribute("aria-expanded", String(abrir));
}

/**
 * Crea la fila de un amigo con el botón de quitar.
 * @param amigo Datos del amigo.
 * @param orden Orden en la lista (para escalonar la animación de entrada).
 */
function crearFilaAmigo(amigo: Amigo, orden = 0): HTMLLIElement {
    const elemento = document.createElement("li");
    elemento.className = "fila-amigo";
    elemento.style.setProperty("--orden", String(orden));

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

/**
 * Pinta la lista de amigos del menú de la cuenta y carga la lista.
 * Se llama al entrar y al salir para que el número de la cabecera esté al día.
 */
async function cargarAmigos(): Promise<void> {
    const perfil = obtenerPerfil();
    if (!perfil) {
        elementos.cuentaAmigos.textContent = "";
        elementos.listaAmigos.replaceChildren();
        elementos.listaAmigos.dataset.vacia = "true";
        return;
    }
    // El código es siempre un identificador independiente del usuario (la BD
    // lo genera automáticamente al crear el perfil o lo repara al entrar, y si
    // la función RPC no existe se genera localmente).
    elementos.miCodigo.textContent = perfil.codigo ?? generarCodigoLocal();
    const { data, error } = await cliente().rpc("mis_amigos");
    const amigos = error ? [] : (data as Amigo[]);
    elementos.listaAmigos.replaceChildren(...amigos.map((amigo, orden) => crearFilaAmigo(amigo, orden)));
    elementos.listaAmigos.dataset.vacia = String(amigos.length === 0);
    elementos.cuentaAmigos.textContent = amigos.length > 0 ? String(amigos.length) : "";
    animarFilasLista(elementos.listaAmigos);
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
    mostrarDesplegableAmigos(true);
    // Si el jugador está mirando el ranking, se le enseña entre sus amigos.
    ambitoRanking = "amigos";
    await cargarAmigos();
    if (!elementos.pantalla.hidden) await cargarRanking();
}

/** Comparte (o copia) el enlace de invitación con el código propio. */
async function compartirInvitacion(): Promise<void> {
    const perfil = obtenerPerfil();
    if (!perfil) {
        abrirEntrar();
        return;
    }
    const enlace = `${location.origin}${location.pathname}?amigo=${encodeURIComponent(perfil.codigo ?? generarCodigoLocal())}`;
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
    pintarEstadisticasRanking();
    if (!obtenerPerfil() && ambitoRanking === "amigos") {
        ambitoRanking = "global";
    }
    await cargarRanking();
}

/**
 * Abre el menú de la cuenta con el panel de amigos desplegado.
 * Se usa al llegar con una invitación: el jugador va directo al formulario
 * para añadir a quien le ha invitado, sin tener que buscar el ranking.
 */
export function abrirMenuDeAmigos(): void {
    abrirMenuCuenta();
    mostrarDesplegableAmigos(true);
    requestAnimationFrame(() => elementos.campoAmigo.focus());
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
        // Aquí van sin partidas ni %, que ya se han visto justo encima.
        elementos.listaAmigosResultado.replaceChildren(
            ...visibles.map((fila, orden) => crearFilaRanking(fila, orden, false)),
        );
        elementos.bloqueAmigos.hidden = false;
        // Ya visible el bloque, es cuando la animación escalonada puede correr.
        animarFilasLista(elementos.listaAmigosResultado);
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
 * Conecta los controles de la pantalla de ranking y del panel de amigos.
 */
export function iniciarSocial(): void {
    if (!hayOnline()) return;
    crearSelectorClasificacion();
    elementos.botonesAmbito.forEach((boton) => {
        boton.addEventListener("click", () => {
            ambitoRanking = boton.dataset.ambito === "amigos" ? "amigos" : "global";
            void cargarRanking();
        });
    });
    elementos.botonDesplegableAmigos.addEventListener("click", () => {
        const abierto = elementos.botonDesplegableAmigos.getAttribute("aria-expanded") === "true";
        mostrarDesplegableAmigos(!abierto);
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

    document.addEventListener(EVENTO_IDIOMA_CAMBIADO, () => {
        pintarSelectorClasificacion();
        pintarEstadisticasRanking();
    });
    document.addEventListener(EVENTO_SESION, () => {
        // El panel de amigos vive en el menú de la cuenta: se refresca siempre,
        // y el ranking solo si ahora mismo se está viendo.
        void cargarAmigos();
        if (!elementos.pantalla.hidden) void cargarPantallaRanking();
    });

    const invitacion = leerInvitacionDeLaUrl();
    if (invitacion) {
        // El amigo se añade desde el panel de amigos del menú de la cuenta.
        const aceptar = () => {
            abrirMenuDeAmigos();
            void anadirAmigo(invitacion);
        };
        if (obtenerPerfil()) aceptar();
        else abrirEntrar("registro", aceptar);
    }
}
