/**
 * dom.ts
 * Type-safe helpers for working with the HTML document.
 */

/**
 * Finds an element by id and fails loudly if it is missing, so a broken
 * HTML file is noticed at start-up instead of in the middle of a game.
 * @param id Element id.
 * @param type Expected element class (HTMLElement by default).
 */
export function getElement<T extends HTMLElement = HTMLElement>(id: string, type: new () => T = HTMLElement as unknown as new () => T): T {
    const element = document.getElementById(id);
    if (!(element instanceof type)) {
        throw new Error(`Missing element #${id} in the HTML`);
    }
    return element;
}

/**
 * Creates an element with a class name and, optionally, its text.
 * @param tag HTML tag.
 * @param className Classes.
 * @param text Text content.
 */
export function createElement<K extends keyof HTMLElementTagNameMap>(tag: K, className = "", text = ""): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text) element.textContent = text;
    return element;
}

/**
 * Restarts a CSS animation by removing a class, forcing a reflow and adding
 * it back (used for the staggered entrance of list rows).
 * @param element Element that holds the class.
 * @param className Class that triggers the animation.
 */
export function restartAnimation(element: HTMLElement, className = "is-entering"): void {
    element.classList.remove(className);
    void element.offsetWidth;
    element.classList.add(className);
}

/**
 * Whether animations should be reduced: either the system asks for it, or
 * the player turned on "Reduce animations" in Settings (which adds the
 * "force-reduced-motion" class to <html>; see settings/settings.ts and the
 * matching CSS rule in style.css).
 */
export function prefersReducedMotion(): boolean {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches || document.documentElement.classList.contains("force-reduced-motion");
}
