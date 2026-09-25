/**
 * enlaces.ts
 * Reconoce links de YouTube y Spotify pegados por el jugador y extrae lo
 * necesario para reproducirlos (id del vídeo, de la lista, de la canción…).
 * No depende del navegador, así que se puede probar con tests en Node.
 */

/** Música de YouTube: un vídeo, una lista de reproducción, o un vídeo dentro de una lista. */
export interface EnlaceYoutube {
    plataforma: "youtube";
    idVideo?: string;
    idLista?: string;
}

/** Tipos de contenido de Spotify que se pueden incrustar. */
export type TipoSpotify = "track" | "album" | "playlist" | "artist" | "episode" | "show";

/** Música de Spotify. */
export interface EnlaceSpotify {
    plataforma: "spotify";
    tipo: TipoSpotify;
    id: string;
}

/** Cualquier enlace de música reconocido. */
export type EnlaceMusical = EnlaceYoutube | EnlaceSpotify;

const PATRON_ID_VIDEO_YOUTUBE = /^[\w-]{11}$/;
const PATRON_ID_LISTA_YOUTUBE = /^[\w-]{10,}$/;
const PATRON_ID_SPOTIFY = /^[A-Za-z0-9]{22}$/;
const TIPOS_SPOTIFY: readonly TipoSpotify[] = ["track", "album", "playlist", "artist", "episode", "show"];
const DOMINIOS_YOUTUBE = ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"];

/**
 * Analiza un link y dice si es música de YouTube o Spotify.
 * @param textoPegado Lo que el jugador pegó (se toleran espacios).
 * @returns Los datos del enlace o null si no se reconoce.
 */
export function analizarEnlaceMusical(textoPegado: string): EnlaceMusical | null {
    const textoLimpio = textoPegado.trim();
    return analizarUriSpotify(textoLimpio) ?? analizarUrl(textoLimpio);
}

/**
 * Reconoce las URIs de Spotify del tipo "spotify:track:ID".
 * @param texto Texto a analizar.
 */
function analizarUriSpotify(texto: string): EnlaceSpotify | null {
    const coincidencia = /^spotify:([a-z]+):([A-Za-z0-9]{22})$/.exec(texto);
    if (coincidencia && esTipoSpotify(coincidencia[1])) {
        return { plataforma: "spotify", tipo: coincidencia[1], id: coincidencia[2] };
    }
    return null;
}

/**
 * Reconoce URLs web de YouTube y Spotify.
 * @param texto Texto a analizar (se añade https:// si falta).
 */
function analizarUrl(texto: string): EnlaceMusical | null {
    let url: URL;
    try {
        url = new URL(/^https?:\/\//i.test(texto) ? texto : `https://${texto}`);
    } catch {
        return null;
    }
    const dominio = url.hostname.toLowerCase();

    if (dominio === "youtu.be") {
        return crearEnlaceYoutube(url.pathname.split("/")[1], url.searchParams.get("list"));
    }
    if (DOMINIOS_YOUTUBE.includes(dominio)) {
        return analizarRutaYoutube(url);
    }
    if (dominio === "open.spotify.com" || dominio === "play.spotify.com") {
        return analizarRutaSpotify(url.pathname);
    }
    return null;
}

/**
 * Extrae vídeo y lista de las distintas rutas de YouTube:
 * /watch?v=, /playlist?list=, /shorts/ID, /embed/ID, /live/ID.
 * @param url URL de YouTube.
 */
function analizarRutaYoutube(url: URL): EnlaceYoutube | null {
    const idLista = url.searchParams.get("list");
    const [primerTramo, segundoTramo] = url.pathname.split("/").filter(Boolean);

    if (primerTramo === "watch") {
        return crearEnlaceYoutube(url.searchParams.get("v"), idLista);
    }
    if (primerTramo === "playlist") {
        return crearEnlaceYoutube(null, idLista);
    }
    if (primerTramo === "shorts" || primerTramo === "embed" || primerTramo === "live" || primerTramo === "v") {
        return crearEnlaceYoutube(segundoTramo, idLista);
    }
    return null;
}

/**
 * Valida los ids y crea el enlace de YouTube.
 * @param idVideo Id del vídeo (11 caracteres) o nada.
 * @param idLista Id de la lista o nada.
 */
function crearEnlaceYoutube(idVideo: string | null | undefined, idLista: string | null | undefined): EnlaceYoutube | null {
    const videoValido = idVideo && PATRON_ID_VIDEO_YOUTUBE.test(idVideo) ? idVideo : undefined;
    const listaValida = idLista && PATRON_ID_LISTA_YOUTUBE.test(idLista) ? idLista : undefined;
    if (!videoValido && !listaValida) {
        return null;
    }
    return { plataforma: "youtube", idVideo: videoValido, idLista: listaValida };
}

/**
 * Extrae tipo e id de rutas de Spotify como /track/ID, /intl-es/playlist/ID
 * o /embed/album/ID.
 * @param ruta Ruta de la URL.
 */
function analizarRutaSpotify(ruta: string): EnlaceSpotify | null {
    const tramos = ruta.split("/").filter((tramo) => tramo && !tramo.startsWith("intl-") && tramo !== "embed");
    const [tipo, id] = tramos;
    if (tipo && id && esTipoSpotify(tipo) && PATRON_ID_SPOTIFY.test(id)) {
        return { plataforma: "spotify", tipo, id };
    }
    return null;
}

/**
 * Comprueba si un texto es un tipo de contenido de Spotify incrustable.
 * @param tipo Texto a comprobar.
 */
function esTipoSpotify(tipo: string): tipo is TipoSpotify {
    return (TIPOS_SPOTIFY as readonly string[]).includes(tipo);
}
