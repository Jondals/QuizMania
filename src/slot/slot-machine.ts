/**
 * slot-machine.ts
 * The slot machine that sets up each game. Its three reels carry symbols:
 *   1. Topic       (30 casino chips with the topic icon and a short name).
 *   2. Game mode   (10 chips, same style).
 *   3. Multiplier  (×1 to ×5 chips with the figure; higher ones are rarer,
 *                   see config/multipliers.ts).
 * The topic and mode reels have ▲ ▼ arrows on the window itself that nudge
 * the reel one symbol (choosing it by hand also holds it), and a lit HOLD
 * button underneath that keeps that reel still on the next spin. Holds are
 * remembered between visits. The multiplier is always left to luck.
 *
 * Each reel is a vertical strip inside a window that shows the centre plate
 * in full and half a plate above and below. To spin, the strip is filled
 * with random plates ending in the winner (plus one peeking below) and
 * moved with a CSS transition.
 */

import { playEffect, playReelStop, stopEffect } from "../audio/effects";
import { SESSION_CHANGED } from "../account/session";
import type { Mode } from "../config/modes";
import { findMode, MODES } from "../config/modes";
import { drawMultiplier, findMultiplier, MULTIPLIERS } from "../config/multipliers";
import type { Topic } from "../config/topics";
import { findTopic, TOPICS } from "../config/topics";
import { readRecord } from "../game/records";
import { formatPoints } from "../game/scoring";
import type { TextKey } from "../i18n/texts";
import { getLanguage, LANGUAGE_CHANGED, t } from "../i18n/texts";
import { getElement, prefersReducedMotion } from "../utils/dom";
import { pickRandom } from "../utils/random";
import { readSaved, save } from "../utils/storage";

/** What a spin decides. */
export interface SpinResult {
    topic: Topic;
    mode: Mode;
    multiplier: number;
}

/** A symbol on a reel: id, text and colour. */
interface Plate {
    id: string;
    text: string;
    /** Emoji (topics, modes) or figure (multipliers) in the middle of the chip. */
    icon: string;
    color: string;
    kind: "topic" | "mode" | "multiplier" | "mystery";
}

/** Saved choices and holds. */
interface SavedSlot {
    topic: string;
    mode: string;
    holdTopic: boolean;
    holdMode: boolean;
}

const STORAGE_KEY = "slot";
/** Random plates that pass by the first reel before it stops. */
const PLATES_PER_SPIN = 22;
/** Extra plates for each following reel (so they stop one after another). */
const EXTRA_PLATES_PER_REEL = 7;
/** Spin duration of the first reel (ms). */
const FIRST_REEL_DURATION = 1500;
/** Extra spin time of each following reel (ms). */
const DELAY_BETWEEN_REELS = 500;
/** Duration with "reduce motion" on (ms). */
const REDUCED_MOTION_DURATION = 250;
/** Duration of a nudge (ms). */
const NUDGE_DURATION = 220;

const elements = {
    machine: getElement("slot-machine"),
    title: getElement("slot-title"),
    reels: [...document.querySelectorAll<HTMLElement>(".reel")],
    windows: [...document.querySelectorAll<HTMLElement>(".reel-window")],
    strips: [...document.querySelectorAll<HTMLElement>(".reel-strip")],
    modeDisplay: getElement("mode-display"),
    modeDescription: getElement("mode-description"),
    recordLed: getElement("record-led"),
    multiplierLed: getElement("multiplier-led"),
    topicPrevious: getElement("topic-previous", HTMLButtonElement),
    topicNext: getElement("topic-next", HTMLButtonElement),
    topicHold: getElement("topic-hold", HTMLButtonElement),
    modePrevious: getElement("mode-previous", HTMLButtonElement),
    modeNext: getElement("mode-next", HTMLButtonElement),
    modeHold: getElement("mode-hold", HTMLButtonElement),
};

const saved = readSaved<Partial<SavedSlot>>(STORAGE_KEY, {});
let topicIndex = Math.max(0, TOPICS.indexOf(findTopic(saved.topic ?? "")));
let modeIndex = Math.max(0, MODES.indexOf(findMode(saved.mode ?? "")));
let multiplierIndex = -1; // -1 = the "?" plate before the first spin.
let holdTopic = saved.holdTopic === true;
let holdMode = saved.holdMode === true;
let spinning = false;
let locked = false;

/* ---------- Plates ---------- */

/**
 * Plate of a topic.
 * @param topic Topic.
 */
function topicPlate(topic: Topic): Plate {
    return { id: topic.id, text: topic.short[getLanguage()], icon: topic.icon, color: topic.color, kind: "topic" };
}

/**
 * Plate of a mode.
 * @param mode Mode.
 */
function modePlate(mode: Mode): Plate {
    return { id: mode.id, text: mode.short[getLanguage()], icon: mode.icon, color: mode.color, kind: "mode" };
}

/**
 * Plate of a multiplier (or the "?" one).
 * @param index Position in MULTIPLIERS (-1 = "?").
 */
function multiplierPlate(index: number): Plate {
    if (index < 0) return { id: "?", text: t("luck"), icon: "?", color: "#ff2e7e", kind: "mystery" };
    const multiplier = MULTIPLIERS[index];
    const label = `multiplier${multiplier.value}` as TextKey;
    return { id: String(multiplier.value), text: t(label), icon: `×${multiplier.value}`, color: multiplier.color, kind: "multiplier" };
}

/**
 * Plate at a position of a reel (positions wrap around).
 * @param reel 0 topic, 1 mode, 2 multiplier.
 * @param index Position (any integer).
 */
function plateAt(reel: number, index: number): Plate {
    if (reel === 0) return topicPlate(TOPICS[((index % TOPICS.length) + TOPICS.length) % TOPICS.length]);
    if (reel === 1) return modePlate(MODES[((index % MODES.length) + MODES.length) % MODES.length]);
    return multiplierPlate(((index % MULTIPLIERS.length) + MULTIPLIERS.length) % MULTIPLIERS.length);
}

/**
 * Creates the element of a symbol: a casino chip (a notched disc in its
 * colour) with the topic or mode icon, or the multiplier figure, in the
 * middle, and its short name printed on the reel underneath.
 * @param plate Symbol data.
 */
function createPlate(plate: Plate): HTMLElement {
    const symbol = document.createElement("span");
    symbol.className = `symbol symbol--${plate.kind}`;
    symbol.style.setProperty("--plate-color", plate.color);
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = plate.icon;
    const label = document.createElement("span");
    label.className = "symbol-label";
    // Long names get a smaller font so they always fit.
    label.dataset.length = plate.text.length > 8 ? "long" : plate.text.length > 6 ? "medium" : "short";
    label.textContent = plate.text;
    symbol.append(chip, label);
    return symbol;
}

/**
 * Transform that centres the plate at a strip position.
 * @param position Position in the strip.
 */
function centreOn(position: number): string {
    return `translateY(calc(var(--symbol-height) * -${position}))`;
}

/** Current centre index of each reel. */
function currentIndex(reel: number): number {
    return reel === 0 ? topicIndex : reel === 1 ? modeIndex : multiplierIndex;
}

/**
 * Shows a reel still: the centre plate and half of the ones around it.
 * @param reel 0, 1 or 2.
 */
function renderReel(reel: number): void {
    const strip = elements.strips[reel];
    const index = currentIndex(reel);
    strip.style.transition = "none";
    strip.style.transform = centreOn(1);
    const plates = reel === 2 && index < 0 ? [plateAt(2, 4), multiplierPlate(-1), plateAt(2, 0)] : [plateAt(reel, index - 1), plateAt(reel, index), plateAt(reel, index + 1)];
    strip.replaceChildren(...plates.map(createPlate));
}

/* ---------- Display, LEDs and holds ---------- */

/** Saves the current choices and holds. */
function saveChoices(): void {
    save<SavedSlot>(STORAGE_KEY, { topic: TOPICS[topicIndex].id, mode: MODES[modeIndex].id, holdTopic, holdMode });
}

/** Paints the LED display, the record and the hold buttons. */
export function paintSlot(): void {
    const language = getLanguage();
    const mode = MODES[modeIndex];
    elements.modeDisplay.textContent = `${mode.icon} ${mode.name[language]}`;
    elements.modeDescription.textContent = mode.description[language];
    elements.machine.style.setProperty("--mode-color", mode.color);
    elements.recordLed.textContent = formatPoints(readRecord(mode.id), language);
    elements.multiplierLed.textContent = multiplierIndex < 0 ? "×?" : `×${MULTIPLIERS[multiplierIndex].value}`;
    for (const [button, held, label] of [
        [elements.topicHold, holdTopic, "holdTopic"],
        [elements.modeHold, holdMode, "holdMode"],
    ] as const) {
        button.setAttribute("aria-pressed", String(held));
        button.setAttribute("aria-label", t(label));
        button.lastElementChild!.textContent = t(held ? "held" : "hold");
    }
    elements.reels[0].classList.toggle("is-held", holdTopic);
    elements.reels[1].classList.toggle("is-held", holdMode);
}

/**
 * Enables or disables the controls (while spinning or playing).
 * @param value true to lock.
 */
export function lockSlot(value: boolean): void {
    locked = value;
    for (const button of [elements.topicPrevious, elements.topicNext, elements.topicHold, elements.modePrevious, elements.modeNext, elements.modeHold]) {
        button.disabled = value;
    }
}

/**
 * Moves a reel one plate up or down with a short animation and holds it
 * (choosing a plate by hand means you want it).
 * @param reel 0 topic or 1 mode.
 * @param step -1 previous, +1 next.
 */
function nudge(reel: 0 | 1, step: 1 | -1): void {
    if (spinning || locked) return;
    const strip = elements.strips[reel];
    const before = currentIndex(reel);
    if (reel === 0) {
        topicIndex = (topicIndex + step + TOPICS.length) % TOPICS.length;
        holdTopic = true;
    } else {
        modeIndex = (modeIndex + step + MODES.length) % MODES.length;
        holdMode = true;
    }
    saveChoices();
    paintSlot();
    playReelStop(step > 0 ? 520 : 460);
    if (prefersReducedMotion()) {
        renderReel(reel);
        return;
    }
    // Strip with one extra plate on the side we move towards, then slide.
    const plates = step > 0 ? [-1, 0, 1, 2] : [-2, -1, 0, 1];
    strip.style.transition = "none";
    strip.replaceChildren(...plates.map((offset) => createPlate(plateAt(reel, before + offset))));
    strip.style.transform = centreOn(step > 0 ? 1 : 2);
    void strip.offsetHeight;
    strip.style.transition = `transform ${NUDGE_DURATION}ms cubic-bezier(0.3, 1.4, 0.5, 1)`;
    strip.style.transform = centreOn(step > 0 ? 2 : 1);
    setTimeout(() => {
        if (!spinning) renderReel(reel);
    }, NUDGE_DURATION + 20);
}

/** Nudges the mode reel (← → keys). */
export function nudgeMode(step: 1 | -1): void {
    nudge(1, step);
}

/** Nudges the topic reel (↑ ↓ keys). */
export function nudgeTopic(step: 1 | -1): void {
    nudge(0, step);
}

/**
 * Toggles the hold of a reel.
 * @param reel 0 topic or 1 mode.
 */
function toggleHold(reel: 0 | 1): void {
    if (spinning || locked) return;
    if (reel === 0) holdTopic = !holdTopic;
    else holdMode = !holdMode;
    saveChoices();
    paintSlot();
}

/* ---------- Spinning ---------- */

/**
 * Spins one reel and waits until it stops on the target plate.
 * @param reel 0, 1 or 2.
 * @param target Target index.
 * @param order Order among the spinning reels (to stagger the stops).
 */
function spinReel(reel: number, target: number, order: number): Promise<void> {
    const strip = elements.strips[reel];
    // The three visible plates stay in place at the start.
    const visible = [...strip.children].slice(0, 3).map((child) => child.cloneNode(true) as HTMLElement);
    const randomCount = PLATES_PER_SPIN + order * EXTRA_PLATES_PER_REEL;
    const count = reel === 0 ? TOPICS.length : reel === 1 ? MODES.length : MULTIPLIERS.length;
    const plates = [
        ...visible,
        ...Array.from({ length: randomCount }, () => createPlate(plateAt(reel, Math.floor(Math.random() * count)))),
        createPlate(plateAt(reel, target)),
        createPlate(plateAt(reel, target + 1)),
    ];
    strip.style.transition = "none";
    strip.style.transform = centreOn(1);
    strip.replaceChildren(...plates);
    void strip.offsetHeight; // Forces the browser to apply the start position.

    const duration = prefersReducedMotion() ? REDUCED_MOTION_DURATION : FIRST_REEL_DURATION + order * DELAY_BETWEEN_REELS;
    strip.style.transition = `transform ${duration}ms cubic-bezier(0.12, 0.8, 0.22, 1.04)`;
    strip.style.transform = centreOn(plates.length - 2);
    return new Promise((resolve) => {
        setTimeout(() => {
            playReelStop(420 + order * 110);
            elements.windows[reel].classList.add("has-stopped");
            resolve();
        }, duration);
    });
}

/**
 * Spins the reels that aren't held and returns what came up.
 */
export async function spin(): Promise<SpinResult> {
    spinning = true;
    lockSlot(true);
    elements.machine.classList.remove("has-prize", "is-jackpot");
    elements.machine.classList.add("is-spinning");
    elements.windows.forEach((window) => window.classList.remove("has-stopped"));
    elements.title.textContent = t("spinning");
    delete elements.title.dataset.text;
    playEffect("spin");

    const targetTopic = holdTopic ? topicIndex : TOPICS.indexOf(pickRandom(TOPICS));
    const targetMode = holdMode ? modeIndex : MODES.indexOf(pickRandom(MODES));
    const multiplier = drawMultiplier();
    const targetMultiplier = MULTIPLIERS.findIndex((item) => item.value === multiplier);

    const reels: [number, number][] = [];
    if (!holdTopic) reels.push([0, targetTopic]);
    if (!holdMode) reels.push([1, targetMode]);
    reels.push([2, targetMultiplier]);
    await Promise.all(reels.map(([reel, target], order) => spinReel(reel, target, order)));

    topicIndex = targetTopic;
    modeIndex = targetMode;
    multiplierIndex = targetMultiplier;
    saveChoices();
    stopEffect("spin");
    playEffect("jackpot");
    spinning = false;

    const topic = TOPICS[topicIndex];
    const mode = MODES[modeIndex];
    elements.machine.classList.remove("is-spinning");
    elements.machine.classList.add("has-prize");
    elements.machine.classList.toggle("is-jackpot", multiplier === 5);
    document.body.style.setProperty("--accent", topic.color);
    elements.title.textContent = `${topic.name[getLanguage()]} · ${mode.name[getLanguage()]} · ×${multiplier}`;
    paintSlot();
    return { topic, mode, multiplier: findMultiplier(multiplier).value };
}

/** Puts the machine back to its resting state (on the home screen). */
export function resetSlot(): void {
    elements.title.textContent = t("pullTheLever");
    elements.title.dataset.text = "pullTheLever";
    elements.machine.classList.remove("has-prize", "is-jackpot", "is-spinning");
    document.body.style.removeProperty("--accent");
    lockSlot(false);
    paintSlot();
}

/** Builds the reels and connects the hold and nudge controls. */
export function initSlotMachine(): void {
    [0, 1, 2].forEach(renderReel);
    elements.topicPrevious.addEventListener("click", () => nudge(0, -1));
    elements.topicNext.addEventListener("click", () => nudge(0, 1));
    elements.topicHold.addEventListener("click", () => toggleHold(0));
    elements.modePrevious.addEventListener("click", () => nudge(1, -1));
    elements.modeNext.addEventListener("click", () => nudge(1, 1));
    elements.modeHold.addEventListener("click", () => toggleHold(1));
    document.addEventListener(LANGUAGE_CHANGED, () => {
        if (!spinning) [0, 1, 2].forEach(renderReel);
        paintSlot();
    });
    // Logging in or out changes the records shown.
    document.addEventListener(SESSION_CHANGED, paintSlot);
    paintSlot();
}
