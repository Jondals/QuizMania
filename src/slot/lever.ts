/**
 * lever.ts
 * The slot machine lever, which works like a real one:
 *   - Dragging it down (mouse or finger): past 75 % of the way it pulls.
 *   - A click or tap: it goes down and back up by itself.
 *   - With the keyboard (Enter or Space): same as a click.
 */

import { playReelStop } from "../audio/effects";

/** Lever travel (px); matches the CSS (--lever-travel). */
const LEVER_TRAVEL = 120;
/** Share of the travel from which it counts as a pull. */
const PULL_THRESHOLD = 0.75;
/** Time the lever stays down before coming back (ms). */
const TIME_DOWN = 180;

/**
 * Puts the lever in a position.
 * @param lever Lever button.
 * @param pull 0 = up, 1 = all the way down.
 */
function moveLever(lever: HTMLElement, pull: number): void {
    lever.style.setProperty("--pull", String(Math.min(Math.max(pull, 0), 1)));
}

/**
 * Connects the lever.
 * @param lever Lever button.
 * @param onPull Called when the lever is pulled.
 * @returns Function that pulls the lever with its animation (for the Space key).
 */
export function connectLever(lever: HTMLButtonElement, onPull: () => void): () => void {
    let startY: number | null = null;
    let pull = 0;
    let pulled = false;

    /** Takes the lever all the way down, reports it and brings it back up. */
    const pullLever = () => {
        if (lever.disabled) return;
        pulled = true;
        lever.classList.remove("is-dragging");
        moveLever(lever, 1);
        playReelStop(260);
        onPull();
        setTimeout(() => moveLever(lever, 0), TIME_DOWN);
    };

    lever.addEventListener("pointerdown", (event) => {
        if (lever.disabled || event.button !== 0) return;
        startY = event.clientY;
        pull = 0;
        pulled = false;
        try {
            lever.setPointerCapture(event.pointerId);
        } catch {
            // Some browsers don't allow capturing the pointer: dragging still works.
        }
        lever.classList.add("is-dragging");
    });
    lever.addEventListener("pointermove", (event) => {
        if (startY === null || pulled) return;
        pull = (event.clientY - startY) / LEVER_TRAVEL;
        moveLever(lever, pull);
        if (pull >= PULL_THRESHOLD) pullLever();
    });
    const release = () => {
        if (startY === null) return;
        startY = null;
        lever.classList.remove("is-dragging");
        // A tap without dragging counts as a pull; a short drag doesn't.
        if (!pulled && pull < 0.05) pullLever();
        else if (!pulled) moveLever(lever, 0);
    };
    lever.addEventListener("pointerup", release);
    lever.addEventListener("pointercancel", () => {
        startY = null;
        lever.classList.remove("is-dragging");
        moveLever(lever, 0);
    });
    // Keyboard: Enter and Space generate a "click" without pointer (detail = 0).
    lever.addEventListener("click", (event) => {
        if (event.detail === 0) pullLever();
    });
    return pullLever;
}
