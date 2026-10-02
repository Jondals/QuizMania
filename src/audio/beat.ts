/**
 * beat.ts
 * Makes the slot machine dance to the music. While a song is playing it
 * sets two CSS variables on the machine, which the stylesheet uses for the
 * lights, the glow and the reels:
 *   --beat    1 on each beat, fading back to 0 (flashes and bumps).
 *   --energy  How loud the music is right now, from 0 to 1 (overall glow).
 * and toggles the class "is-beat-odd" on every beat so the bulbs swap colours.
 *
 * Uploaded songs are analysed for real with a Web Audio AnalyserNode (the
 * bass energy is compared with its recent average to spot the kicks).
 * YouTube and Spotify play inside other sites' frames, whose sound can't be
 * read by any web page, so for them a steady 120 BPM pulse is used instead.
 */

import { prefersReducedMotion } from "../utils/dom";
import { getAudioElement, getMusicState, MUSIC_CHANGED } from "./music";

/** Minimum time between two beats (ms): faster than ~210 BPM is noise. */
const MIN_BEAT_GAP = 280;
/** Pulse used when the sound can't be analysed (ms between beats, 120 BPM). */
const FALLBACK_BEAT_GAP = 500;
/** How much the beat level fades per frame. */
const DECAY = 0.88;

let target: HTMLElement | null = null;
/** false while reduced motion is on (system setting or the Settings toggle). */
let enabled = true;
let context: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let frequencies = new Uint8Array(0);
let frame = 0;
let level = 0;
let energy = 0;
let averageBass = 0;
let lastBeat = 0;
let oddBeat = false;

/**
 * Connects the <audio> element of uploaded songs to an analyser. This can
 * only be done once per element and, once done, its sound goes through the
 * audio context, so it's only done when the context is really running
 * (otherwise the music would go silent).
 */
async function connectAnalyser(): Promise<void> {
    if (analyser) {
        if (context?.state === "suspended") await context.resume().catch(() => {});
        return;
    }
    try {
        context ??= new AudioContext();
        if (context.state !== "running") await context.resume();
        if (context.state !== "running") return;
        const source = context.createMediaElementSource(getAudioElement());
        analyser = context.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.6;
        frequencies = new Uint8Array(analyser.frequencyBinCount);
        source.connect(analyser);
        analyser.connect(context.destination);
    } catch {
        analyser = null; // Not supported: the steady pulse is used.
    }
}

/** Marks a beat: full level and swapped bulb colours. */
function beat(now: number): void {
    lastBeat = now;
    level = 1;
    oddBeat = !oddBeat;
    target?.classList.toggle("is-beat-odd", oddBeat);
}

/**
 * Bass energy (roughly 40-250 Hz) between 0 and 1.
 */
function readBass(): number {
    if (!analyser || !context) return 0;
    analyser.getByteFrequencyData(frequencies);
    const binWidth = context.sampleRate / analyser.fftSize;
    const first = Math.max(1, Math.floor(40 / binWidth));
    const last = Math.max(first + 1, Math.ceil(250 / binWidth));
    let sum = 0;
    for (let bin = first; bin <= last; bin++) sum += frequencies[bin];
    return sum / ((last - first + 1) * 255);
}

/** One animation frame: detect beats and update the CSS variables. */
function tick(now: number): void {
    const { playing, current } = getMusicState();
    if (!playing || !target) {
        stop();
        return;
    }
    if (current?.source === "file" && analyser) {
        const bass = readBass();
        averageBass = averageBass * 0.94 + bass * 0.06;
        energy = energy * 0.85 + bass * 0.15;
        if (bass > averageBass * 1.22 + 0.03 && bass > 0.18 && now - lastBeat > MIN_BEAT_GAP) beat(now);
    } else {
        energy = 0.45;
        if (now - lastBeat > FALLBACK_BEAT_GAP) beat(now);
    }
    level *= DECAY;
    target.style.setProperty("--beat", level.toFixed(3));
    target.style.setProperty("--energy", Math.min(1, energy * 1.6).toFixed(3));
    frame = requestAnimationFrame(tick);
}

/** Stops the loop and leaves the machine still. */
function stop(): void {
    cancelAnimationFrame(frame);
    frame = 0;
    level = 0;
    energy = 0;
    target?.style.setProperty("--beat", "0");
    target?.style.setProperty("--energy", "0");
    target?.classList.remove("is-dancing");
}

/** Starts or stops following the music when the player (or the setting) changes. */
async function onMusicChanged(): Promise<void> {
    const { playing, current } = getMusicState();
    if (!enabled || !playing || !target) {
        if (frame) stop();
        return;
    }
    if (current?.source === "file") await connectAnalyser();
    if (!frame) {
        target.classList.add("is-dancing");
        frame = requestAnimationFrame(tick);
    }
}

/**
 * Turns the dancing on or off right away (used by the "Reduce animations"
 * toggle in Settings; the system preference is still checked once at start-up).
 * @param value true to let the machine follow the music again.
 */
export function setBeatEnabled(value: boolean): void {
    enabled = value;
    void onMusicChanged();
}

/**
 * Makes an element (the slot machine) follow the music.
 * @param element Element that receives --beat, --energy and the classes.
 */
export function initBeat(element: HTMLElement): void {
    target = element;
    enabled = !prefersReducedMotion();
    document.addEventListener(MUSIC_CHANGED, () => void onMusicChanged());
}
