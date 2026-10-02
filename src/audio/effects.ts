/**
 * effects.ts
 * Every sound effect of the game, synthesised with Web Audio (no audio files
 * to download):
 *   click     Buttons.
 *   correct   Right answer: two rising notes.
 *   wrong     Wrong answer: a low buzz going down.
 *   victory   Game won: arpeggio with a final chord.
 *   defeat    Game lost: four falling notes.
 *   spin      Ticking of the spinning reels (slows down little by little).
 *   jackpot   Chime when the reels stop.
 *   tick      Warning in the last seconds.
 * The volume is shared by all of them and set in Settings.
 */

/** Available effects. */
export type EffectName = "click" | "correct" | "wrong" | "victory" | "defeat" | "spin" | "jackpot" | "tick";

/** Effects volume between 0 and 1. */
let effectsVolume = 0.7;
/** Audio context (created after the player's first interaction). */
let context: AudioContext | null = null;
/** Master gain everything connects to. */
let output: GainNode | null = null;
/** Oscillators of the spin, so it can be cut. */
let spinOscillators: OscillatorNode[] = [];

/** Options of a note. */
interface NoteOptions {
    /** Seconds from now when it starts. */
    start?: number;
    duration?: number;
    wave?: OscillatorType;
    /** Relative volume (0-1). */
    volume?: number;
    /** Final frequency if the note slides. */
    slideTo?: number;
    /** Cut-off of a low-pass filter (to soften harsh waves). */
    filter?: number;
}

/**
 * Changes the volume of every effect.
 * @param volume Value between 0 and 1.
 */
export function setEffectsVolume(volume: number): void {
    effectsVolume = Math.min(1, Math.max(0, volume));
    if (output) output.gain.value = effectsVolume;
}

/** Returns the audio context ready to play, or null if not possible. */
function prepareAudio(): { audio: AudioContext; destination: GainNode } | null {
    if (effectsVolume === 0) return null;
    try {
        if (!context) {
            context = new AudioContext();
            output = context.createGain();
            output.gain.value = effectsVolume;
            output.connect(context.destination);
        }
        if (context.state === "suspended") void context.resume();
        return { audio: context, destination: output as GainNode };
    } catch {
        // Browser without Web Audio: the game goes on silently.
        return null;
    }
}

/**
 * Plays a note with a short envelope (fast attack, exponential decay).
 * @param frequency Frequency in Hz.
 * @param options Start, duration, wave, volume, slide and filter.
 * @returns The oscillator (or null without audio).
 */
function note(frequency: number, options: NoteOptions = {}): OscillatorNode | null {
    const prepared = prepareAudio();
    if (!prepared) return null;
    const { audio, destination } = prepared;
    const { start = 0, duration = 0.15, wave = "triangle", volume = 0.3, slideTo, filter } = options;
    const t0 = audio.currentTime + start;

    const oscillator = audio.createOscillator();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, t0);
    if (slideTo) oscillator.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);

    const envelope = audio.createGain();
    envelope.gain.setValueAtTime(0.0001, t0);
    envelope.gain.exponentialRampToValueAtTime(volume, t0 + 0.01);
    envelope.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

    let last: AudioNode = oscillator;
    if (filter) {
        const lowPass = audio.createBiquadFilter();
        lowPass.type = "lowpass";
        lowPass.frequency.value = filter;
        oscillator.connect(lowPass);
        last = lowPass;
    }
    last.connect(envelope);
    envelope.connect(destination);
    oscillator.start(t0);
    oscillator.stop(t0 + duration + 0.05);
    return oscillator;
}

/** Ticking of the reels: pulses further and further apart for ~2 s. */
function playSpin(): void {
    stopSpin();
    let moment = 0;
    let gap = 0.045;
    while (moment < 2.3) {
        const oscillator = note(moment % 0.2 < 0.1 ? 1300 : 1100, { start: moment, duration: 0.03, wave: "square", volume: 0.07, filter: 3000 });
        if (oscillator) spinOscillators.push(oscillator);
        moment += gap;
        gap *= 1.045;
    }
}

/** Cuts the spin ticking if it's still playing. */
function stopSpin(): void {
    spinOscillators.forEach((oscillator) => {
        try {
            oscillator.stop();
        } catch {
            // Already finished.
        }
    });
    spinOscillators = [];
}

/**
 * Plays an effect.
 * @param name Effect to play.
 */
export function playEffect(name: EffectName): void {
    switch (name) {
        case "click":
            note(620, { duration: 0.07, volume: 0.14, slideTo: 930 });
            break;
        case "correct":
            note(784, { duration: 0.13, volume: 0.28 });
            note(1175, { start: 0.09, duration: 0.28, volume: 0.28 });
            note(2350, { start: 0.09, duration: 0.2, wave: "sine", volume: 0.06 });
            break;
        case "wrong":
            note(220, { duration: 0.18, wave: "sawtooth", volume: 0.18, slideTo: 160, filter: 900 });
            note(180, { start: 0.16, duration: 0.32, wave: "sawtooth", volume: 0.18, slideTo: 110, filter: 700 });
            break;
        case "victory":
            [523, 659, 784, 1047].forEach((frequency, position) => note(frequency, { start: position * 0.1, duration: 0.16, volume: 0.24 }));
            [1047, 1319, 1568].forEach((frequency) => note(frequency, { start: 0.42, duration: 0.9, wave: "sine", volume: 0.16 }));
            note(523, { start: 0.42, duration: 0.9, volume: 0.14 });
            break;
        case "defeat":
            [392, 370, 349].forEach((frequency, position) =>
                note(frequency, { start: position * 0.26, duration: 0.24, wave: "sawtooth", volume: 0.14, filter: 1200 }),
            );
            note(330, { start: 0.78, duration: 0.8, wave: "sawtooth", volume: 0.14, slideTo: 262, filter: 900 });
            break;
        case "spin":
            playSpin();
            break;
        case "jackpot":
            note(1047, { duration: 0.6, wave: "sine", volume: 0.22 });
            note(1568, { start: 0.06, duration: 0.7, wave: "sine", volume: 0.16 });
            note(2093, { start: 0.12, duration: 0.5, wave: "sine", volume: 0.08 });
            break;
        case "tick":
            note(1000, { duration: 0.05, wave: "square", volume: 0.08, filter: 2500 });
            break;
    }
}

/**
 * Stops a long effect that is still playing (only the spin lasts long enough).
 * @param name Effect to stop.
 */
export function stopEffect(name: EffectName): void {
    if (name === "spin") stopSpin();
}

/**
 * Short knock of a reel when it stops (higher for each reel).
 * @param pitch Frequency in Hz.
 */
export function playReelStop(pitch: number): void {
    note(pitch, { duration: 0.09, wave: "square", volume: 0.12, slideTo: pitch * 0.7, filter: 2200 });
}
