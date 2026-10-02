/**
 * links.ts
 * Recognises YouTube and Spotify links pasted by the player and extracts
 * what's needed to play them (video id, playlist id, track…). It doesn't
 * depend on the browser, so it is unit-tested in Node.
 */

/** YouTube music: a video, a playlist, or a video inside a playlist. */
export interface YoutubeLink {
    platform: "youtube";
    videoId?: string;
    playlistId?: string;
}

/** Spotify content types that can be embedded. */
export type SpotifyType = "track" | "album" | "playlist" | "artist" | "episode" | "show";

/** Spotify music. */
export interface SpotifyLink {
    platform: "spotify";
    type: SpotifyType;
    id: string;
}

/** Any recognised music link. */
export type MusicLink = YoutubeLink | SpotifyLink;

const YOUTUBE_VIDEO_ID = /^[\w-]{11}$/;
const YOUTUBE_PLAYLIST_ID = /^[\w-]{10,}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_TYPES: readonly SpotifyType[] = ["track", "album", "playlist", "artist", "episode", "show"];
const YOUTUBE_DOMAINS = ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com"];

/**
 * Parses a link and says whether it's YouTube or Spotify music.
 * @param pasted What the player pasted (spaces are tolerated).
 * @returns The link data, or null if it isn't recognised.
 */
export function parseMusicLink(pasted: string): MusicLink | null {
    const text = pasted.trim();
    return parseSpotifyUri(text) ?? parseUrl(text);
}

/**
 * Recognises Spotify URIs like "spotify:track:ID".
 * @param text Text to parse.
 */
function parseSpotifyUri(text: string): SpotifyLink | null {
    const match = /^spotify:([a-z]+):([A-Za-z0-9]{22})$/.exec(text);
    if (match && isSpotifyType(match[1])) return { platform: "spotify", type: match[1], id: match[2] };
    return null;
}

/**
 * Recognises YouTube and Spotify web URLs.
 * @param text Text to parse (https:// is added if missing).
 */
function parseUrl(text: string): MusicLink | null {
    let url: URL;
    try {
        url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    } catch {
        return null;
    }
    const domain = url.hostname.toLowerCase();
    if (domain === "youtu.be") return youtubeLink(url.pathname.split("/")[1], url.searchParams.get("list"));
    if (YOUTUBE_DOMAINS.includes(domain)) return parseYoutubePath(url);
    if (domain === "open.spotify.com" || domain === "play.spotify.com") return parseSpotifyPath(url.pathname);
    return null;
}

/**
 * Extracts video and playlist from YouTube's paths:
 * /watch?v=, /playlist?list=, /shorts/ID, /embed/ID, /live/ID.
 * @param url YouTube URL.
 */
function parseYoutubePath(url: URL): YoutubeLink | null {
    const playlistId = url.searchParams.get("list");
    const [first, second] = url.pathname.split("/").filter(Boolean);
    if (first === "watch") return youtubeLink(url.searchParams.get("v"), playlistId);
    if (first === "playlist") return youtubeLink(null, playlistId);
    if (first === "shorts" || first === "embed" || first === "live" || first === "v") return youtubeLink(second, playlistId);
    return null;
}

/**
 * Validates the ids and builds the YouTube link.
 * @param videoId Video id (11 characters) or nothing.
 * @param playlistId Playlist id or nothing.
 */
function youtubeLink(videoId: string | null | undefined, playlistId: string | null | undefined): YoutubeLink | null {
    const video = videoId && YOUTUBE_VIDEO_ID.test(videoId) ? videoId : undefined;
    const playlist = playlistId && YOUTUBE_PLAYLIST_ID.test(playlistId) ? playlistId : undefined;
    if (!video && !playlist) return null;
    return { platform: "youtube", videoId: video, playlistId: playlist };
}

/**
 * Extracts type and id from Spotify paths like /track/ID, /intl-es/playlist/ID or /embed/album/ID.
 * @param path URL path.
 */
function parseSpotifyPath(path: string): SpotifyLink | null {
    const parts = path.split("/").filter((part) => part && !part.startsWith("intl-") && part !== "embed");
    const [type, id] = parts;
    if (type && id && isSpotifyType(type) && SPOTIFY_ID.test(id)) return { platform: "spotify", type, id };
    return null;
}

/**
 * Whether a text is an embeddable Spotify content type.
 * @param type Text to check.
 */
function isSpotifyType(type: string): type is SpotifyType {
    return (SPOTIFY_TYPES as readonly string[]).includes(type);
}
