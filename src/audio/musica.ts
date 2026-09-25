/**
 * musica.ts
 * Música de fondo elegida por el jugador pegando un link:
 *   - YouTube (vídeo o lista): se usa la API oficial del reproductor de
 *     YouTube (dominio youtube-nocookie.com), que permite cambiar el volumen
 *     desde el slider de ajustes. La música se repite en bucle.
 *   - Spotify: se incrusta el reproductor oficial. Spotify no deja cambiar su
 *     volumen desde fuera, así que se usa su propio control.
 * Ningún script de terceros se descarga hasta que el jugador pega un link.
 */

import type { EnlaceMusical, EnlaceSpotify, EnlaceYoutube } from "./enlaces";

/** Parte de la API del reproductor de YouTube que se usa aquí. */
interface ReproductorYoutube {
    playVideo(): void;
    setVolume(volumen: number): void;
    setLoop(repetir: boolean): void;
    destroy(): void;
}

/** Evento que YouTube pasa a los callbacks. */
interface EventoReproductorYoutube {
    target: ReproductorYoutube;
    data: number;
}

declare global {
    interface Window {
        YT?: {
            Player: new (elemento: HTMLElement, opciones: Record<string, unknown>) => ReproductorYoutube;
            PlayerState: { ENDED: number };
        };
        onYouTubeIframeAPIReady?: () => void;
    }
}

const URL_API_YOUTUBE = "https://www.youtube.com/iframe_api";

/** Reproductor de YouTube activo (si lo hay). */
let reproductorYoutube: ReproductorYoutube | null = null;
/** Promesa de carga de la API de YouTube (para cargarla una sola vez). */
let cargaApiYoutube: Promise<void> | null = null;
/** Volumen de la música entre 0 y 1. */
let volumenMusica = 0.5;

/**
 * Descarga la API de YouTube la primera vez que se necesita.
 * @returns Promesa que se cumple cuando window.YT está listo.
 */
function cargarApiYoutube(): Promise<void> {
    cargaApiYoutube ??= new Promise((resolver, rechazar) => {
        if (window.YT?.Player) {
            resolver();
            return;
        }
        window.onYouTubeIframeAPIReady = () => resolver();
        const script = document.createElement("script");
        script.src = URL_API_YOUTUBE;
        script.async = true;
        script.onerror = () => {
            cargaApiYoutube = null;
            rechazar(new Error("No se pudo cargar la API de YouTube"));
        };
        document.head.append(script);
    });
    return cargaApiYoutube;
}

/**
 * Cambia el volumen de la música (solo afecta a YouTube; Spotify no lo permite).
 * @param volumen Valor entre 0 y 1.
 */
export function establecerVolumenMusica(volumen: number): void {
    volumenMusica = Math.min(1, Math.max(0, volumen));
    reproductorYoutube?.setVolume(Math.round(volumenMusica * 100));
}

/**
 * Para la música y vacía el contenedor del reproductor.
 * @param contenedor Elemento donde está el reproductor.
 */
export function quitarMusica(contenedor: HTMLElement): void {
    reproductorYoutube?.destroy();
    reproductorYoutube = null;
    contenedor.replaceChildren();
}

/**
 * Empieza a reproducir la música de un enlace, sustituyendo la anterior.
 * @param enlace Enlace ya analizado.
 * @param contenedor Elemento donde se mete el reproductor.
 */
export async function reproducirEnlaceMusical(enlace: EnlaceMusical, contenedor: HTMLElement): Promise<void> {
    quitarMusica(contenedor);
    if (enlace.plataforma === "youtube") {
        await reproducirYoutube(enlace, contenedor);
    } else {
        reproducirSpotify(enlace, contenedor);
    }
}

/**
 * Crea el reproductor de YouTube en bucle con el volumen actual.
 * @param enlace Vídeo y/o lista.
 * @param contenedor Elemento donde se mete el reproductor.
 */
async function reproducirYoutube(enlace: EnlaceYoutube, contenedor: HTMLElement): Promise<void> {
    await cargarApiYoutube();
    const YT = window.YT;
    if (!YT) {
        throw new Error("La API de YouTube no está disponible");
    }

    // YouTube sustituye este div por su iframe.
    const hueco = document.createElement("div");
    contenedor.append(hueco);

    const opcionesDeReproduccion: Record<string, string | number> = { autoplay: 1, playsinline: 1, rel: 0 };
    if (enlace.idLista) {
        opcionesDeReproduccion.listType = "playlist";
        opcionesDeReproduccion.list = enlace.idLista;
    } else if (enlace.idVideo) {
        // Para repetir un solo vídeo YouTube exige indicarlo también como lista.
        opcionesDeReproduccion.loop = 1;
        opcionesDeReproduccion.playlist = enlace.idVideo;
    }

    reproductorYoutube = new YT.Player(hueco, {
        host: "https://www.youtube-nocookie.com",
        width: "100%",
        height: "100%",
        videoId: enlace.idVideo,
        playerVars: opcionesDeReproduccion,
        events: {
            onReady: (evento: EventoReproductorYoutube) => {
                evento.target.setVolume(Math.round(volumenMusica * 100));
                if (enlace.idLista) {
                    evento.target.setLoop(true);
                }
                evento.target.playVideo();
            },
        },
    });
}

/**
 * Incrusta el reproductor oficial de Spotify.
 * @param enlace Contenido de Spotify.
 * @param contenedor Elemento donde se mete el reproductor.
 */
function reproducirSpotify(enlace: EnlaceSpotify, contenedor: HTMLElement): void {
    const marco = document.createElement("iframe");
    marco.src = `https://open.spotify.com/embed/${enlace.tipo}/${enlace.id}?utm_source=generator`;
    marco.title = "Spotify";
    marco.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
    marco.loading = "lazy";
    contenedor.append(marco);
}
