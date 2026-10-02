/**
 * music-ui.ts
 * Music player inside the Settings drop-down:
 *   - Previous / play-pause / next buttons and music volume slider.
 *   - Playlist: click a song to play it, drag it by the handle (⠿) to
 *     reorder it and remove it with ✕.
 *   - "Upload songs" (audio files, kept in this browser) and a field for
 *     YouTube or Spotify links.
 */

import type { TextKey } from "../i18n/texts";
import { LANGUAGE_CHANGED, t } from "../i18n/texts";
import { getElement } from "../utils/dom";
import type { Song } from "./music";
import {
    addFiles,
    addLink,
    getMusicState,
    initMusic,
    moveSong,
    MUSIC_CHANGED,
    MusicError,
    nextSong,
    playIndex,
    previousSong,
    removeSong,
    setMusicVolume,
    togglePlayback,
} from "./music";

const elements = {
    current: getElement("music-current"),
    previousButton: getElement("music-previous", HTMLButtonElement),
    playButton: getElement("music-play", HTMLButtonElement),
    nextButton: getElement("music-next", HTMLButtonElement),
    spotify: getElement("music-spotify"),
    volume: getElement("music-volume", HTMLInputElement),
    volumeValue: getElement("music-volume-value", HTMLOutputElement),
    count: getElement("music-count"),
    list: getElement("music-list"),
    fileInput: getElement("song-files", HTMLInputElement),
    linkForm: getElement("music-link-form", HTMLFormElement),
    linkInput: getElement("music-link-input", HTMLInputElement),
    message: getElement("music-message"),
};

/** Short name of where a song comes from. */
const SOURCE_LABELS: Record<Song["source"], string> = { file: "Audio", youtube: "YouTube", spotify: "Spotify" };

/**
 * Creates a simple SVG icon.
 * @param path Icon path.
 */
function icon(path: string): SVGSVGElement {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("width", "16");
    svg.setAttribute("height", "16");
    svg.setAttribute("aria-hidden", "true");
    const stroke = document.createElementNS("http://www.w3.org/2000/svg", "path");
    stroke.setAttribute("d", path);
    stroke.setAttribute("fill", "none");
    stroke.setAttribute("stroke", "currentColor");
    stroke.setAttribute("stroke-width", "2");
    stroke.setAttribute("stroke-linecap", "round");
    svg.append(stroke);
    return svg;
}

/**
 * Creates the row of a playlist song.
 * @param song Song.
 * @param position Position in the playlist.
 * @param isCurrent Whether it's the song playing (or selected).
 */
function createRow(song: Song, position: number, isCurrent: boolean): HTMLLIElement {
    const { playing, loading } = getMusicState();
    const row = document.createElement("li");
    row.className = "song";
    row.classList.toggle("is-current", isCurrent);
    row.dataset.position = String(position);

    const handle = document.createElement("button");
    handle.type = "button";
    handle.className = "song-handle";
    handle.dataset.noClick = "";
    handle.setAttribute("aria-label", `${t("move")}: ${song.title}`);
    handle.append(icon("M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"));
    connectDragging(handle, row);

    const number = document.createElement("span");
    number.className = "song-number";
    number.setAttribute("aria-hidden", "true");
    if (isCurrent && loading) {
        number.append(Object.assign(document.createElement("span"), { className: "song-spinner" }));
    } else if (isCurrent && playing) {
        const bars = document.createElement("span");
        bars.className = "song-bars";
        bars.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
        number.append(bars);
    } else {
        number.textContent = String(position + 1);
    }

    const title = document.createElement("button");
    title.type = "button";
    title.className = "song-title";
    title.textContent = song.title;
    title.title = song.title;
    title.addEventListener("click", () => void playIndex(position));

    const source = document.createElement("span");
    source.className = "song-source";
    source.textContent = SOURCE_LABELS[song.source];

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "song-remove";
    remove.setAttribute("aria-label", `${t("remove")}: ${song.title}`);
    remove.append(icon("M6 6l12 12M18 6 6 18"));
    remove.addEventListener("click", () => void removeSong(song.id));

    row.append(handle, number, title, source, remove);
    return row;
}

/**
 * Lets a row be reordered by dragging its handle (mouse or finger) or with
 * the up/down arrows of the keyboard.
 * @param handle Row handle.
 * @param row Song row.
 */
function connectDragging(handle: HTMLButtonElement, row: HTMLLIElement): void {
    handle.addEventListener("pointerdown", (event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const startY = event.clientY;
        const from = Number(row.dataset.position);
        const rows = [...elements.list.children] as HTMLElement[];
        const centres = rows.map((other) => {
            const box = other.getBoundingClientRect();
            return box.top + box.height / 2;
        });
        let to = from;
        row.classList.add("is-dragging");
        try {
            handle.setPointerCapture(event.pointerId);
        } catch {
            // Without pointer capture dragging still works.
        }
        const move = (moveEvent: PointerEvent) => {
            const offset = moveEvent.clientY - startY;
            row.style.transform = `translateY(${offset}px)`;
            const centre = centres[from] + offset;
            to = centres.reduce((best, other, position) => (Math.abs(other - centre) < Math.abs(centres[best] - centre) ? position : best), from);
        };
        const drop = () => {
            handle.removeEventListener("pointermove", move);
            handle.removeEventListener("pointerup", drop);
            handle.removeEventListener("pointercancel", drop);
            row.classList.remove("is-dragging");
            row.style.transform = "";
            if (to !== from) moveSong(from, to);
        };
        handle.addEventListener("pointermove", move);
        handle.addEventListener("pointerup", drop);
        handle.addEventListener("pointercancel", drop);
    });
    handle.addEventListener("keydown", (event) => {
        const from = Number(row.dataset.position);
        const step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
        if (!step) return;
        event.preventDefault();
        moveSong(from, from + step);
        (elements.list.children[from + step]?.querySelector(".song-handle") as HTMLElement | null)?.focus();
    });
}

/** Repaints the whole player. */
function paint(): void {
    const { songs, index, volume, playing, current } = getMusicState();
    const hasSongs = songs.length > 0;

    elements.playButton.classList.toggle("is-playing", playing);
    elements.playButton.setAttribute("aria-label", t(playing ? "pauseMusic" : "playMusic"));
    elements.playButton.disabled = !hasSongs;
    elements.previousButton.disabled = !hasSongs;
    elements.nextButton.disabled = songs.length < 2;
    elements.count.textContent = hasSongs ? `${index + 1} / ${songs.length}` : "0";
    elements.current.replaceChildren();
    if (current) {
        const title = document.createElement("strong");
        title.textContent = current.title;
        elements.current.append(`${t(playing ? "nowPlaying" : "paused")}: `, title);
    }
    elements.spotify.hidden = current?.source !== "spotify";
    elements.volume.value = String(Math.round(volume * 100));
    elements.volumeValue.value = `${Math.round(volume * 100)}%`;

    // The list isn't repainted while a row is being dragged.
    if (!elements.list.querySelector(".is-dragging")) {
        const focused = document.activeElement?.closest(".song") as HTMLElement | null;
        const focusedPosition = focused?.dataset.position;
        elements.list.replaceChildren(...songs.map((song, position) => createRow(song, position, position === index)));
        if (focusedPosition !== undefined) {
            (elements.list.children[Number(focusedPosition)]?.querySelector(".song-title") as HTMLElement | null)?.focus();
        }
    }
}

/**
 * Shows a message under the links field.
 * @param key Text to show (null = clear).
 * @param isError Whether it's an error.
 * @param extra Text appended at the end.
 */
function showMessage(key: TextKey | null, isError = false, extra = ""): void {
    elements.message.textContent = key ? `${t(key)}${extra}` : "";
    elements.message.classList.toggle("is-error", isError);
}

/**
 * Text key of a music error.
 * @param error Error received.
 */
function errorKey(error: unknown): TextKey {
    if (error instanceof MusicError) {
        return error.code === "invalid-link" ? "invalidLink" : error.code === "empty-playlist" ? "emptyPlaylistLink" : "invalidFile";
    }
    return "errorOffline";
}

/** Connects the music player controls of the Settings drop-down. */
export function initMusicUi(): void {
    elements.playButton.dataset.noClick = "";
    elements.playButton.addEventListener("click", () => void togglePlayback());
    elements.previousButton.addEventListener("click", () => void previousSong());
    elements.nextButton.addEventListener("click", () => void nextSong());
    elements.volume.addEventListener("input", () => setMusicVolume(Number(elements.volume.value) / 100));

    elements.fileInput.addEventListener("change", async () => {
        const files = [...(elements.fileInput.files ?? [])];
        elements.fileInput.value = "";
        if (files.length === 0) return;
        showMessage("loading");
        try {
            showMessage("songsAdded", false, ` ${await addFiles(files)}`);
        } catch (error) {
            showMessage(errorKey(error), true);
        }
    });

    elements.linkForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const link = elements.linkInput.value.trim();
        if (!link) return;
        showMessage("loading");
        try {
            const added = await addLink(link);
            elements.linkInput.value = "";
            showMessage("songsAdded", false, ` ${added}`);
        } catch (error) {
            showMessage(errorKey(error), true);
        }
    });
    elements.linkInput.addEventListener("input", () => showMessage(null));

    document.addEventListener(MUSIC_CHANGED, paint);
    document.addEventListener(LANGUAGE_CHANGED, paint);
    initMusic();
}
