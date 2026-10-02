/**
 * protection.ts
 * Blocks the right-click menu (and long-press on phones) and image dragging.
 * Note: no website can fully prevent it (JavaScript can be turned off), but
 * in normal use the menu doesn't show up.
 */

/**
 * Whether the element is a text field, where the context menu is allowed so
 * links can be pasted with the mouse.
 * @param target Element that received the event.
 */
function isTextField(target: EventTarget | null): boolean {
    return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

/** Turns on the context-menu and drag blocking for the whole document. */
export function blockContextMenu(): void {
    document.addEventListener("contextmenu", (event) => {
        if (!isTextField(event.target)) event.preventDefault();
    });
    document.addEventListener("dragstart", (event) => event.preventDefault());
}
