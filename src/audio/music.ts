/**
 * music.ts
 * Background music player with one playlist that mixes three kinds of songs:
 *   - file:    songs uploaded by the player (stored in IndexedDB, so they
 *              are still there on the next visit).
 *   - youtube: videos (or a whole playlist) through YouTube's official IFrame
 *              API; the video is hidden, only the audio is heard.
 *   - spotify: Spotify's official embedded player (without a Spotify
 *              session it only plays 30-second previews).
 * The playlist, the current song and the volume are saved in the browser.
 * Every change fires MUSIC_CHANGED on document so the interface repaints.
 */

import { readSaved, save } from "../utils/storage";
import { deleteFile, listFileKeys, readFile, requestPersistentStorage, saveFile } from "../utils/files";
import { parseMusicLink } from "./links";

/** Event fired on document when the player changes. */
export const MUSIC_CHANGED = "quizmania:music";

/** Where a song comes from. */
export type SongSource = "file" | "youtube" | "spotify";

/** A playlist song. */
export interface Song {
    id: string;
    source: SongSource;
    title: string;
    /** file: IndexedDB key · youtube: video id · spotify: URI (spotify:track:…). */
    ref: string;
}

/** Player error with a short code the interface translates. */
export class MusicError extends Error {
    /** @param code What went wrong with the song or link. */
    constructor(readonly code: "invalid-link" | "empty-playlist" | "invalid-file") {
        super(code);
    }
}

const STORAGE_KEY = "music";
/** Key used by the first versions (Spanish fields); migrated on start-up. */
const LEGACY_STORAGE_KEY = "musica";
/** Maximum videos imported from a YouTube playlist. */
const MAX_PLAYLIST_VIDEOS = 200;
/** Title requests at once when importing a playlist. */
const TITLES_IN_PARALLEL = 6;

interface SavedState {
    songs: Song[];
    index: number;
    volume: number;
}

/** Shape saved by the first versions. */
interface LegacyState {
    canciones?: { id: string; fuente: "archivo" | "youtube" | "spotify"; titulo: string; ref: string }[];
    indice?: number;
    volumen?: number;
}

let songs: Song[] = [];
let index = 0;
let volume = 0.5;
let playing = false;
let loading = false;

/* ---------- State ---------- */

/** Current player state (to paint it). */
export function getMusicState() {
    return { songs: [...songs], index, volume, playing, loading, current: songs[index] ?? null };
}

/** Saves the playlist and tells the interface. */
function notify(): void {
    save<SavedState>(STORAGE_KEY, { songs, index, volume });
    document.dispatchEvent(new CustomEvent(MUSIC_CHANGED));
}

/** Generates a random identifier. */
function newId(): string {
    return [...crypto.getRandomValues(new Uint8Array(8))].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/* ---------- Loading external APIs (only when needed) ---------- */

/**
 * Loads an external script once.
 * @param url Script address.
 * @param globalName Global function the script calls when ready.
 */
function loadScript<T>(url: string, globalName: string): Promise<T> {
    return new Promise((resolve, reject) => {
        (window as unknown as Record<string, unknown>)[globalName] = (api: T) => resolve(api);
        const script = document.createElement("script");
        script.src = url;
        script.async = true;
        script.onerror = () => reject(new Error(`Could not load ${url}`));
        document.head.append(script);
    });
}

/**
 * Off-screen container for the external players.
 * @param id Container id.
 */
function hiddenContainer(id: string): HTMLElement {
    let box = document.getElementById(id);
    if (!box) {
        box = document.createElement("div");
        box.id = id;
        box.className = "hidden-player";
        box.setAttribute("aria-hidden", "true");
        box.append(document.createElement("div"));
        document.body.append(box);
    }
    return box.firstElementChild as HTMLElement;
}

/* ---------- YouTube (official IFrame API; the video isn't shown) ---------- */

/** The bit of YouTube's player API that is used. */
interface YoutubePlayer {
    loadVideoById(id: string): void;
    cuePlaylist(options: { listType: "playlist"; list: string }): void;
    getPlaylist(): string[] | null;
    playVideo(): void;
    pauseVideo(): void;
    setVolume(volume: number): void;
}

interface YoutubeApi {
    Player: new (
        element: HTMLElement,
        options: {
            width: number;
            height: number;
            playerVars: Record<string, number | string>;
            events: Record<string, (event: { data: number; target: YoutubePlayer }) => void>;
        },
    ) => YoutubePlayer;
}

let youtube: Promise<YoutubePlayer> | null = null;
/** Called when the playlist requested with cuePlaylist is ready. */
let onYoutubePlaylistCued: (() => void) | null = null;

/** Returns the hidden YouTube player (created the first time). */
function getYoutube(): Promise<YoutubePlayer> {
    youtube ??= new Promise<YoutubePlayer>((resolve, reject) => {
        loadScript<void>("https://www.youtube.com/iframe_api", "onYouTubeIframeAPIReady")
            .then(() => {
                const api = (window as unknown as { YT: YoutubeApi }).YT;
                new api.Player(hiddenContainer("music-youtube"), {
                    width: 200,
                    height: 200,
                    playerVars: { playsinline: 1, controls: 0, disablekb: 1, rel: 0 },
                    events: {
                        onReady: (event) => resolve(event.target),
                        onStateChange: (event) => onYoutubeState(event.data),
                        // Deleted video or one that can't be embedded: skip it.
                        onError: () => {
                            if (songs[index]?.source === "youtube") void nextSong();
                        },
                    },
                });
            })
            .catch(reject);
    });
    youtube.catch(() => {
        youtube = null;
    });
    return youtube;
}

/**
 * Reacts to YouTube player changes.
 * States: 0 ended, 1 playing, 2 paused, 3 buffering, 5 playlist cued.
 * @param state New state.
 */
function onYoutubeState(state: number): void {
    if (state === 5 && onYoutubePlaylistCued) {
        onYoutubePlaylistCued();
        return;
    }
    if (songs[index]?.source !== "youtube") return;
    if (state === 0) {
        void nextSong();
    } else if (state === 1 || state === 2 || state === 3) {
        loading = state === 3;
        playing = state !== 2;
        notify();
    }
}

/* ---------- Spotify (official embedded player) ---------- */

interface SpotifyController {
    loadUri(uri: string): void;
    play(): void;
    togglePlay(): void;
    pause?: () => void;
    resume?: () => void;
    addListener(event: string, listener: (data: { data: { isPaused: boolean; position: number; duration: number } }) => void): void;
}

interface SpotifyApi {
    createController(element: HTMLElement, options: { uri: string; width: string; height: number }, ready: (controller: SpotifyController) => void): void;
}

let spotify: Promise<SpotifyController> | null = null;
let spotifyPaused = true;

/**
 * Returns the Spotify player controller (created the first time).
 * @param uri First track/playlist to load.
 */
function getSpotify(uri: string): Promise<SpotifyController> {
    spotify ??= loadScript<SpotifyApi>("https://open.spotify.com/embed/iframe-api/v1", "onSpotifyIframeApiReady").then(
        (api) =>
            new Promise<SpotifyController>((resolve) => {
                const box = document.getElementById("music-spotify");
                const target = document.createElement("div");
                box?.replaceChildren(target);
                api.createController(target, { uri, width: "100%", height: 80 }, (controller) => {
                    controller.addListener("playback_update", ({ data }) => {
                        if (songs[index]?.source !== "spotify") return;
                        const ended = !spotifyPaused && data.isPaused && data.duration > 0 && data.position >= data.duration - 800;
                        spotifyPaused = data.isPaused;
                        playing = !data.isPaused;
                        loading = false;
                        notify();
                        // A single track that ends moves on to the next song.
                        if (ended && songs[index]?.ref.startsWith("spotify:track:")) void nextSong();
                    });
                    resolve(controller);
                });
            }),
    );
    spotify.catch(() => {
        spotify = null;
    });
    return spotify;
}

/* ---------- Uploaded files ---------- */

const audio = new Audio();
audio.preload = "auto";
let currentFileUrl: string | null = null;

audio.addEventListener("ended", () => void nextSong());
audio.addEventListener("playing", () => {
    loading = false;
    playing = true;
    notify();
});
audio.addEventListener("waiting", () => {
    loading = true;
    notify();
});
audio.addEventListener("pause", () => {
    if (songs[index]?.source === "file" && !audio.ended) {
        playing = false;
        notify();
    }
});
audio.addEventListener("error", () => {
    if (songs[index]?.source === "file" && audio.src) void nextSong();
});

/** The <audio> element of uploaded songs (the beat detector listens to it). */
export function getAudioElement(): HTMLAudioElement {
    return audio;
}

/* ---------- Controls ---------- */

/** Stops whatever is playing in any player. */
async function stopAll(): Promise<void> {
    audio.pause();
    if (youtube) (await youtube.catch(() => null))?.pauseVideo();
    if (spotify && !spotifyPaused) {
        const controller = await spotify.catch(() => null);
        if (controller?.pause) controller.pause();
        else controller?.togglePlay();
    }
}

/**
 * Starts playing a playlist song.
 * @param position Position in the playlist.
 */
export async function playIndex(position: number): Promise<void> {
    if (songs.length === 0) return;
    index = ((position % songs.length) + songs.length) % songs.length;
    const song = songs[index];
    loading = true;
    playing = true;
    notify();
    await stopAll();

    try {
        if (song.source === "file") {
            const file = await readFile(song.ref);
            if (!file) throw new Error("File not found");
            if (currentFileUrl) URL.revokeObjectURL(currentFileUrl);
            currentFileUrl = URL.createObjectURL(file);
            audio.src = currentFileUrl;
            audio.volume = volume;
            await audio.play();
        } else if (song.source === "youtube") {
            const player = await getYoutube();
            player.setVolume(Math.round(volume * 100));
            player.loadVideoById(song.ref);
        } else {
            const controller = await getSpotify(song.ref);
            controller.loadUri(song.ref);
            controller.play();
            spotifyPaused = false;
        }
    } catch {
        // Couldn't play (deleted file, offline…): stop.
        playing = false;
        loading = false;
        notify();
    }
}

/** Pauses or resumes the current song (starts it if it hasn't started). */
export async function togglePlayback(): Promise<void> {
    const song = songs[index];
    if (!song) return;
    if (playing) {
        await stopAll();
        playing = false;
        loading = false;
        notify();
        return;
    }
    if (song.source === "file" && audio.src && !audio.ended && currentFileUrl) {
        await audio.play().catch(() => {});
    } else if (song.source === "youtube" && youtube) {
        (await youtube).playVideo();
    } else if (song.source === "spotify" && spotify) {
        const controller = await spotify;
        if (controller.resume) controller.resume();
        else controller.togglePlay();
    } else {
        await playIndex(index);
        return;
    }
    playing = true;
    notify();
}

/** Next song (after the last one, back to the first). */
export function nextSong(): Promise<void> {
    return playIndex(index + 1);
}

/** Previous song (or the start of the current one if it has been playing a while). */
export function previousSong(): Promise<void> {
    if (songs[index]?.source === "file" && audio.currentTime > 3) {
        audio.currentTime = 0;
        return Promise.resolve();
    }
    return playIndex(index - 1);
}

/**
 * Changes the music volume (Spotify uses its own volume).
 * @param value Value between 0 and 1.
 */
export function setMusicVolume(value: number): void {
    volume = Math.min(1, Math.max(0, value));
    audio.volume = volume;
    youtube?.then((player) => player.setVolume(Math.round(volume * 100))).catch(() => {});
    notify();
}

/* ---------- Editing the playlist ---------- */

/**
 * Adds songs uploaded by the player. Each file is saved in IndexedDB before
 * it joins the playlist, so it survives reloading the page.
 * @param files Chosen audio or video files (videos only play their sound).
 * @returns How many were added.
 */
export async function addFiles(files: Iterable<File>): Promise<number> {
    let added = 0;
    for (const file of files) {
        // Video files are accepted too: the <audio> element only plays their sound.
        const isMedia = file.type.startsWith("audio/") || file.type.startsWith("video/");
        if (!isMedia && !/\.(mp3|ogg|oga|m4a|aac|wav|flac|opus|webm|mp4|m4v|mov)$/i.test(file.name)) continue;
        const key = newId();
        try {
            await saveFile(key, file);
        } catch {
            continue;
        }
        songs.push({ id: key, source: "file", title: file.name.replace(/\.[^.]+$/, ""), ref: key });
        added++;
    }
    if (added === 0) throw new MusicError("invalid-file");
    void requestPersistentStorage();
    notify();
    return added;
}

/**
 * Asks oEmbed for the title of a video or track (no key needed).
 * @param url oEmbed address.
 */
async function fetchTitle(url: string): Promise<string | null> {
    try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = (await response.json()) as { title?: string };
        return data.title?.trim() || null;
    } catch {
        return null;
    }
}

/**
 * Title of a YouTube video.
 * @param videoId Video id.
 */
function youtubeTitle(videoId: string): Promise<string | null> {
    return fetchTitle(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`);
}

/**
 * Asks the hidden player for the videos of a YouTube playlist.
 * @param playlistId Playlist id.
 */
async function youtubePlaylistVideos(playlistId: string): Promise<string[]> {
    const player = await getYoutube();
    const ids = await new Promise<string[]>((resolve) => {
        const limit = setTimeout(() => resolve([]), 12000);
        onYoutubePlaylistCued = () => {
            clearTimeout(limit);
            onYoutubePlaylistCued = null;
            resolve(player.getPlaylist() ?? []);
        };
        player.cuePlaylist({ listType: "playlist", list: playlistId });
    });
    return ids.slice(0, MAX_PLAYLIST_VIDEOS);
}

/**
 * Adds a YouTube (video or playlist) or Spotify link.
 * @param text Link pasted by the player.
 * @returns How many songs were added.
 */
export async function addLink(text: string): Promise<number> {
    const link = parseMusicLink(text);
    if (!link) throw new MusicError("invalid-link");

    if (link.platform === "spotify") {
        const uri = `spotify:${link.type}:${link.id}`;
        const title = await fetchTitle(`https://open.spotify.com/oembed?url=${encodeURIComponent(`https://open.spotify.com/${link.type}/${link.id}`)}`);
        songs.push({ id: newId(), source: "spotify", title: title ?? `Spotify · ${link.type}`, ref: uri });
        notify();
        return 1;
    }

    // YouTube: a playlist becomes one song per video.
    const ids = link.playlistId ? await youtubePlaylistVideos(link.playlistId) : [link.videoId as string];
    if (ids.length === 0) throw new MusicError("empty-playlist");
    const added: Song[] = ids.map((videoId, position) => ({
        id: newId(),
        source: "youtube",
        title: ids.length > 1 ? `YouTube ${position + 1}` : "YouTube",
        ref: videoId,
    }));
    songs.push(...added);
    notify();

    // Titles arrive little by little and the playlist updates.
    for (let start = 0; start < added.length; start += TITLES_IN_PARALLEL) {
        const group = added.slice(start, start + TITLES_IN_PARALLEL);
        const titles = await Promise.all(group.map((song) => youtubeTitle(song.ref)));
        group.forEach((song, position) => {
            if (titles[position]) song.title = titles[position] as string;
        });
        notify();
    }
    return added.length;
}

/**
 * Removes a song from the playlist (and its file, if uploaded).
 * @param id Song id.
 */
export async function removeSong(id: string): Promise<void> {
    const position = songs.findIndex((song) => song.id === id);
    if (position === -1) return;
    const [removed] = songs.splice(position, 1);
    if (removed.source === "file") void deleteFile(removed.ref).catch(() => {});

    if (position === index) {
        const wasPlaying = playing;
        await stopAll();
        playing = false;
        index = Math.min(index, Math.max(songs.length - 1, 0));
        if (wasPlaying && songs.length > 0) {
            await playIndex(index);
            return;
        }
    } else if (position < index) {
        index--;
    }
    notify();
}

/**
 * Moves a song to another position.
 * @param from Current position.
 * @param to New position.
 */
export function moveSong(from: number, to: number): void {
    if (from === to || from < 0 || to < 0 || from >= songs.length || to >= songs.length) return;
    const current = songs[index];
    const [moved] = songs.splice(from, 1);
    songs.splice(to, 0, moved);
    index = songs.indexOf(current);
    notify();
}

/** Reads the saved state, migrating the format of the first versions. */
function readState(): Partial<SavedState> {
    const saved = readSaved<Partial<SavedState> | null>(STORAGE_KEY, null);
    if (saved) return saved;
    const legacy = readSaved<LegacyState>(LEGACY_STORAGE_KEY, {});
    return {
        songs: (legacy.canciones ?? []).map((song) => ({
            id: song.id,
            source: song.fuente === "archivo" ? "file" : song.fuente,
            title: song.titulo,
            ref: song.ref,
        })),
        index: legacy.indice,
        volume: legacy.volumen,
    };
}

/**
 * Drops uploaded songs whose file is no longer in IndexedDB (e.g. the
 * browser cleared site data), so the playlist never shows broken entries.
 */
async function dropMissingFiles(): Promise<void> {
    let keys: Set<string>;
    try {
        keys = new Set(await listFileKeys());
    } catch {
        return; // IndexedDB unavailable: keep everything as it is.
    }
    const kept = songs.filter((song) => song.source !== "file" || keys.has(song.ref));
    if (kept.length !== songs.length) {
        songs = kept;
        index = Math.min(index, Math.max(songs.length - 1, 0));
        notify();
    }
}

/** Loads the saved playlist (it doesn't start playing by itself). */
export function initMusic(): void {
    const state = readState();
    songs = Array.isArray(state.songs) ? state.songs.filter((song) => song && song.id && song.ref && song.source) : [];
    index = Math.min(Math.max(state.index ?? 0, 0), Math.max(songs.length - 1, 0));
    volume = typeof state.volume === "number" ? state.volume : 0.5;
    audio.volume = volume;
    notify();
    void dropMissingFiles();
}
