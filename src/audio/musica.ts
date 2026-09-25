/**
 * musica.ts
 * Reproductor de música del juego: una lista de canciones de tres orígenes,
 * que suenan de una en una y pasan solas a la siguiente.
 *   - archivo: canciones que sube el jugador (se guardan en IndexedDB).
 *   - youtube: vídeos o listas de YouTube; solo se oye el audio (el vídeo
 *     va en un reproductor oculto de la API oficial de YouTube).
 *   - spotify: canciones, álbumes o listas de Spotify con su reproductor
 *     oficial incrustado (sin sesión en Spotify solo suenan 30 s).
 *
 * La lista, la canción actual y el volumen se recuerdan entre visitas.
 * Cada cambio lanza EVENTO_MUSICA en document para que la interfaz se repinte.
 */

import { guardarDato, leerDatoGuardado } from "../utilidades/almacenamiento";
import { borrarArchivo, guardarArchivo, leerArchivo } from "../utilidades/archivos";
import { analizarEnlaceMusical } from "./enlaces";

/** Evento que se lanza en document cada vez que cambia algo de la música. */
export const EVENTO_MUSICA = "quizmania:musica";

/** Origen de una canción. */
export type FuenteCancion = "archivo" | "youtube" | "spotify";

/** Una canción de la lista. */
export interface Cancion {
    id: string;
    fuente: FuenteCancion;
    titulo: string;
    /** archivo: clave en IndexedDB · youtube: id del vídeo · spotify: URI (spotify:track:…). */
    ref: string;
}

/** Error con un código corto que la interfaz traduce. */
export class ErrorMusica extends Error {
    constructor(readonly codigo: "enlace-no-valido" | "lista-vacia" | "archivo-no-valido") {
        super(codigo);
    }
}

const CLAVE_MUSICA = "musica";
/** Máximo de vídeos que se importan de una lista de YouTube. */
const MAXIMO_VIDEOS_LISTA = 200;
/** Peticiones de títulos a la vez al importar una lista. */
const TITULOS_EN_PARALELO = 6;

interface EstadoGuardado {
    canciones: Cancion[];
    indice: number;
    volumen: number;
}

let canciones: Cancion[] = [];
let indice = 0;
let volumen = 0.5;
let reproduciendo = false;
let cargando = false;

/* ---------- Estado ---------- */

/** Estado actual del reproductor (para pintarlo). */
export function obtenerEstadoMusica() {
    return { canciones: [...canciones], indice, volumen, reproduciendo, cargando, actual: canciones[indice] ?? null };
}

/** Guarda la lista y avisa a la interfaz. */
function avisar(): void {
    guardarDato<EstadoGuardado>(CLAVE_MUSICA, { canciones, indice, volumen });
    document.dispatchEvent(new CustomEvent(EVENTO_MUSICA));
}

/** Genera un identificador al azar. */
function nuevoId(): string {
    return [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- Carga de APIs externas (solo cuando hacen falta) ---------- */

/**
 * Carga un script externo una sola vez.
 * @param url Dirección del script.
 * @param global Función global que el script llama al estar listo.
 */
function cargarScript<T>(url: string, global: string): Promise<T> {
    return new Promise((resolver, rechazar) => {
        (window as unknown as Record<string, unknown>)[global] = (api: T) => resolver(api);
        const script = document.createElement("script");
        script.src = url;
        script.async = true;
        script.onerror = () => rechazar(new Error(`No se pudo cargar ${url}`));
        document.head.append(script);
    });
}

/** Contenedor fuera de la vista para los reproductores externos. */
function contenedorOculto(id: string): HTMLElement {
    let caja = document.getElementById(id);
    if (!caja) {
        caja = document.createElement("div");
        caja.id = id;
        caja.className = "reproductor-oculto";
        caja.setAttribute("aria-hidden", "true");
        caja.append(document.createElement("div"));
        document.body.append(caja);
    }
    return caja.firstElementChild as HTMLElement;
}

/* ---------- YouTube (API IFrame oficial; el vídeo no se ve) ---------- */

/** Lo mínimo de la API de YouTube que se usa. */
interface ReproductorYoutube {
    loadVideoById(id: string): void;
    cuePlaylist(opciones: { listType: "playlist"; list: string }): void;
    getPlaylist(): string[] | null;
    playVideo(): void;
    pauseVideo(): void;
    stopVideo(): void;
    setVolume(volumen: number): void;
}
interface ApiYoutube {
    Player: new (
        elemento: HTMLElement,
        opciones: {
            width: number;
            height: number;
            playerVars: Record<string, number | string>;
            events: Record<string, (evento: { data: number; target: ReproductorYoutube }) => void>;
        },
    ) => ReproductorYoutube;
}

let youtube: Promise<ReproductorYoutube> | null = null;
/** Se llama cuando la lista pedida con cuePlaylist está cargada. */
let alCargarListaYoutube: (() => void) | null = null;

/** Devuelve el reproductor oculto de YouTube (lo crea la primera vez). */
function obtenerYoutube(): Promise<ReproductorYoutube> {
    youtube ??= new Promise<ReproductorYoutube>((resolver, rechazar) => {
        cargarScript<void>("https://www.youtube.com/iframe_api", "onYouTubeIframeAPIReady")
            .then(() => {
                const api = (window as unknown as { YT: ApiYoutube }).YT;
                const reproductor = new api.Player(contenedorOculto("musica-youtube"), {
                    width: 200,
                    height: 200,
                    playerVars: { playsinline: 1, controls: 0, disablekb: 1, rel: 0 },
                    events: {
                        onReady: (evento) => resolver(evento.target),
                        onStateChange: (evento) => alCambiarEstadoYoutube(evento.data),
                        // Vídeo borrado o que no deja incrustarse: se salta.
                        onError: () => {
                            if (canciones[indice]?.fuente === "youtube") void siguiente();
                        },
                    },
                });
                void reproductor;
            })
            .catch(rechazar);
    });
    youtube.catch(() => {
        youtube = null;
    });
    return youtube;
}

/**
 * Reacciona a los cambios del reproductor de YouTube.
 * Estados: 0 terminado, 1 sonando, 2 en pausa, 3 cargando, 5 lista preparada.
 */
function alCambiarEstadoYoutube(estado: number): void {
    if (estado === 5 && alCargarListaYoutube) {
        alCargarListaYoutube();
        return;
    }
    if (canciones[indice]?.fuente !== "youtube") return;
    if (estado === 0) {
        void siguiente();
    } else if (estado === 1 || estado === 2 || estado === 3) {
        cargando = estado === 3;
        reproduciendo = estado !== 2;
        avisar();
    }
}

/* ---------- Spotify (reproductor incrustado oficial) ---------- */

interface ControladorSpotify {
    loadUri(uri: string): void;
    play(): void;
    togglePlay(): void;
    pause?: () => void;
    resume?: () => void;
    addListener(evento: string, funcion: (datos: { data: { isPaused: boolean; position: number; duration: number } }) => void): void;
}
interface ApiSpotify {
    createController(
        elemento: HTMLElement,
        opciones: { uri: string; width: string; height: number },
        listo: (controlador: ControladorSpotify) => void,
    ): void;
}

let spotify: Promise<ControladorSpotify> | null = null;
let spotifyPausado = true;

/**
 * Devuelve el controlador del reproductor de Spotify (lo crea la primera vez).
 * @param uri Primera canción/lista a cargar.
 */
function obtenerSpotify(uri: string): Promise<ControladorSpotify> {
    spotify ??= cargarScript<ApiSpotify>("https://open.spotify.com/embed/iframe-api/v1", "onSpotifyIframeApiReady").then(
        (api) =>
            new Promise<ControladorSpotify>((resolver) => {
                const caja = document.getElementById("musica-spotify");
                const destino = document.createElement("div");
                caja?.replaceChildren(destino);
                api.createController(destino, { uri, width: "100%", height: 80 }, (controlador) => {
                    controlador.addListener("playback_update", ({ data }) => {
                        if (canciones[indice]?.fuente !== "spotify") return;
                        const termino = spotifyPausado === false && data.isPaused && data.duration > 0 && data.position >= data.duration - 800;
                        spotifyPausado = data.isPaused;
                        reproduciendo = !data.isPaused;
                        cargando = false;
                        avisar();
                        // Una canción suelta que termina pasa a la siguiente de la lista.
                        if (termino && canciones[indice]?.ref.startsWith("spotify:track:")) void siguiente();
                    });
                    resolver(controlador);
                });
            }),
    );
    spotify.catch(() => {
        spotify = null;
    });
    return spotify;
}

/* ---------- Archivos subidos ---------- */

const audio = new Audio();
audio.preload = "auto";
let urlArchivoActual: string | null = null;

audio.addEventListener("ended", () => void siguiente());
audio.addEventListener("playing", () => {
    cargando = false;
    reproduciendo = true;
    avisar();
});
audio.addEventListener("waiting", () => {
    cargando = true;
    avisar();
});
audio.addEventListener("pause", () => {
    if (canciones[indice]?.fuente === "archivo" && !audio.ended) {
        reproduciendo = false;
        avisar();
    }
});
audio.addEventListener("error", () => {
    if (canciones[indice]?.fuente === "archivo" && audio.src) void siguiente();
});

/* ---------- Control ---------- */

/** Para lo que esté sonando en cualquier reproductor. */
async function pararTodo(): Promise<void> {
    audio.pause();
    if (youtube) (await youtube.catch(() => null))?.pauseVideo();
    if (spotify && !spotifyPausado) {
        const controlador = await spotify.catch(() => null);
        if (controlador?.pause) controlador.pause();
        else controlador?.togglePlay();
    }
}

/**
 * Empieza a reproducir una canción de la lista.
 * @param posicion Posición en la lista.
 */
export async function reproducirIndice(posicion: number): Promise<void> {
    if (canciones.length === 0) return;
    indice = ((posicion % canciones.length) + canciones.length) % canciones.length;
    const cancion = canciones[indice];
    cargando = true;
    reproduciendo = true;
    avisar();
    await pararTodo();

    try {
        if (cancion.fuente === "archivo") {
            const archivo = await leerArchivo(cancion.ref);
            if (!archivo) throw new Error("Archivo no encontrado");
            if (urlArchivoActual) URL.revokeObjectURL(urlArchivoActual);
            urlArchivoActual = URL.createObjectURL(archivo);
            audio.src = urlArchivoActual;
            audio.volume = volumen;
            await audio.play();
        } else if (cancion.fuente === "youtube") {
            const reproductor = await obtenerYoutube();
            reproductor.setVolume(Math.round(volumen * 100));
            reproductor.loadVideoById(cancion.ref);
        } else {
            const controlador = await obtenerSpotify(cancion.ref);
            controlador.loadUri(cancion.ref);
            controlador.play();
            spotifyPausado = false;
        }
    } catch {
        // No se pudo reproducir (archivo borrado, sin conexión…): se para.
        reproduciendo = false;
        cargando = false;
        avisar();
    }
}

/** Pausa o reanuda la canción actual (si no ha empezado, la empieza). */
export async function alternarReproduccion(): Promise<void> {
    const cancion = canciones[indice];
    if (!cancion) return;
    if (reproduciendo) {
        await pararTodo();
        reproduciendo = false;
        cargando = false;
        avisar();
        return;
    }
    if (cancion.fuente === "archivo" && audio.src && !audio.ended && urlArchivoActual) {
        await audio.play().catch(() => {});
    } else if (cancion.fuente === "youtube" && youtube) {
        (await youtube).playVideo();
    } else if (cancion.fuente === "spotify" && spotify) {
        const controlador = await spotify;
        if (controlador.resume) controlador.resume();
        else controlador.togglePlay();
    } else {
        await reproducirIndice(indice);
        return;
    }
    reproduciendo = true;
    avisar();
}

/** Pasa a la siguiente canción (al final vuelve a la primera). */
export function siguiente(): Promise<void> {
    return reproducirIndice(indice + 1);
}

/** Vuelve a la canción anterior (o al principio de la actual si ya lleva un rato). */
export function anterior(): Promise<void> {
    if (canciones[indice]?.fuente === "archivo" && audio.currentTime > 3) {
        audio.currentTime = 0;
        return Promise.resolve();
    }
    return reproducirIndice(indice - 1);
}

/**
 * Cambia el volumen de la música (Spotify usa su propio volumen).
 * @param nuevo Valor entre 0 y 1.
 */
export function establecerVolumenMusica(nuevo: number): void {
    volumen = Math.min(1, Math.max(0, nuevo));
    audio.volume = volumen;
    youtube?.then((reproductor) => reproductor.setVolume(Math.round(volumen * 100))).catch(() => {});
    avisar();
}

/* ---------- Editar la lista ---------- */

/**
 * Añade canciones subidas por el jugador.
 * @param archivos Archivos de audio elegidos.
 * @returns Cuántas se añadieron.
 */
export async function anadirArchivos(archivos: Iterable<File>): Promise<number> {
    let anadidas = 0;
    for (const archivo of archivos) {
        if (!archivo.type.startsWith("audio/")) continue;
        const clave = nuevoId();
        try {
            await guardarArchivo(clave, archivo);
        } catch {
            continue;
        }
        canciones.push({ id: clave, fuente: "archivo", titulo: archivo.name.replace(/\.[^.]+$/, ""), ref: clave });
        anadidas++;
    }
    if (anadidas === 0) throw new ErrorMusica("archivo-no-valido");
    avisar();
    return anadidas;
}

/**
 * Pide el título de un vídeo o canción por oEmbed (sin clave).
 * @param url Dirección del oEmbed.
 */
async function pedirTitulo(url: string): Promise<string | null> {
    try {
        const respuesta = await fetch(url);
        if (!respuesta.ok) return null;
        const datos = (await respuesta.json()) as { title?: string };
        return datos.title?.trim() || null;
    } catch {
        return null;
    }
}

/** Título de un vídeo de YouTube. */
function tituloYoutube(idVideo: string): Promise<string | null> {
    return pedirTitulo(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${idVideo}`)}`);
}

/**
 * Pide los vídeos de una lista de YouTube usando el reproductor oculto.
 * @param idLista Id de la lista.
 */
async function videosDeListaYoutube(idLista: string): Promise<string[]> {
    const reproductor = await obtenerYoutube();
    const ids = await new Promise<string[]>((resolver) => {
        const limite = setTimeout(() => resolver([]), 12000);
        alCargarListaYoutube = () => {
            clearTimeout(limite);
            alCargarListaYoutube = null;
            resolver(reproductor.getPlaylist() ?? []);
        };
        reproductor.cuePlaylist({ listType: "playlist", list: idLista });
    });
    return ids.slice(0, MAXIMO_VIDEOS_LISTA);
}

/**
 * Añade un enlace de YouTube (vídeo o lista) o de Spotify.
 * @param texto Enlace pegado por el jugador.
 * @returns Cuántas canciones se añadieron.
 */
export async function anadirEnlace(texto: string): Promise<number> {
    const enlace = analizarEnlaceMusical(texto);
    if (!enlace) throw new ErrorMusica("enlace-no-valido");

    if (enlace.plataforma === "spotify") {
        const uri = `spotify:${enlace.tipo}:${enlace.id}`;
        const titulo = await pedirTitulo(`https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/${enlace.tipo}/${enlace.id}`)}`);
        canciones.push({ id: nuevoId(), fuente: "spotify", titulo: titulo ?? `Spotify · ${enlace.tipo}`, ref: uri });
        avisar();
        return 1;
    }

    // YouTube: una lista se convierte en una canción por vídeo.
    const ids = enlace.idLista ? await videosDeListaYoutube(enlace.idLista) : [enlace.idVideo as string];
    if (ids.length === 0) throw new ErrorMusica("lista-vacia");
    const nuevas: Cancion[] = ids.map((idVideo, posicion) => ({
        id: nuevoId(),
        fuente: "youtube",
        titulo: ids.length > 1 ? `YouTube ${posicion + 1}` : "YouTube",
        ref: idVideo,
    }));
    canciones.push(...nuevas);
    avisar();

    // Los títulos se piden poco a poco y la lista se va actualizando.
    for (let inicio = 0; inicio < nuevas.length; inicio += TITULOS_EN_PARALELO) {
        const grupo = nuevas.slice(inicio, inicio + TITULOS_EN_PARALELO);
        const titulos = await Promise.all(grupo.map((cancion) => tituloYoutube(cancion.ref)));
        grupo.forEach((cancion, posicion) => {
            if (titulos[posicion]) cancion.titulo = titulos[posicion] as string;
        });
        avisar();
    }
    return nuevas.length;
}

/**
 * Quita una canción de la lista (y su archivo, si era subida).
 * @param id Id de la canción.
 */
export async function quitarCancion(id: string): Promise<void> {
    const posicion = canciones.findIndex((cancion) => cancion.id === id);
    if (posicion === -1) return;
    const [quitada] = canciones.splice(posicion, 1);
    if (quitada.fuente === "archivo") void borrarArchivo(quitada.ref).catch(() => {});

    if (posicion === indice) {
        const seguia = reproduciendo;
        await pararTodo();
        reproduciendo = false;
        indice = Math.min(indice, Math.max(canciones.length - 1, 0));
        if (seguia && canciones.length > 0) {
            await reproducirIndice(indice);
            return;
        }
    } else if (posicion < indice) {
        indice--;
    }
    avisar();
}

/**
 * Mueve una canción a otra posición de la lista.
 * @param desde Posición actual.
 * @param hasta Posición nueva.
 */
export function moverCancion(desde: number, hasta: number): void {
    if (desde === hasta || desde < 0 || hasta < 0 || desde >= canciones.length || hasta >= canciones.length) return;
    const actual = canciones[indice];
    const [movida] = canciones.splice(desde, 1);
    canciones.splice(hasta, 0, movida);
    indice = canciones.indexOf(actual);
    avisar();
}

/** Carga la lista guardada (no empieza a sonar sola). */
export function iniciarMusica(): void {
    const guardado = leerDatoGuardado<Partial<EstadoGuardado>>(CLAVE_MUSICA, {});
    canciones = Array.isArray(guardado.canciones) ? guardado.canciones.filter((c) => c && c.id && c.ref) : [];
    indice = Math.min(Math.max(guardado.indice ?? 0, 0), Math.max(canciones.length - 1, 0));
    volumen = typeof guardado.volumen === "number" ? guardado.volumen : 0.5;
    audio.volume = volumen;
    document.dispatchEvent(new CustomEvent(EVENTO_MUSICA));
}
