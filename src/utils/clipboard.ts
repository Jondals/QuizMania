/**
 * clipboard.ts
 * Copies text to the clipboard without failing when the browser doesn't allow it.
 */

/**
 * Copies a text to the clipboard.
 * @param text Text to copy.
 * @returns true if it was copied.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch {
        // Outside a secure context (http, LAN IP) the modern API doesn't
        // exist: fall back to selecting and copying.
        return copyWithSelection(text);
    }
}

/**
 * Copies using a temporary text area and execCommand (works over http).
 * @param text Text to copy.
 * @returns true if it was copied.
 */
function copyWithSelection(text: string): boolean {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    Object.assign(area.style, { position: "fixed", top: "-1000px", opacity: "0", userSelect: "text" });
    document.body.append(area);
    let copied = false;
    try {
        area.select();
        copied = document.execCommand("copy");
    } catch {
        copied = false;
    }
    area.remove();
    return copied;
}
