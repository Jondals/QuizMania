/**
 * confirm.ts
 * Confirmation dialog with the game's look (instead of window.confirm, which
 * can't be styled).
 */

import { t } from "../i18n/texts";
import { getElement } from "./dom";

const dialog = getElement("confirm-dialog", HTMLDialogElement);
const title = getElement("confirm-title");
const message = getElement("confirm-message");
const acceptButton = getElement("confirm-accept", HTMLButtonElement);
const cancelButton = getElement("confirm-cancel", HTMLButtonElement);

/** Dialog options. */
export interface ConfirmOptions {
    title: string;
    message: string;
    /** Accept button text ("OK" by default). */
    accept?: string;
    /** true = destructive action (the accept button turns red). */
    danger?: boolean;
}

/**
 * Asks the player something.
 * @param options Title, message and button text.
 * @returns true if accepted; false if cancelled or closed.
 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
    title.textContent = options.title;
    message.textContent = options.message;
    acceptButton.textContent = options.accept ?? t("ok");
    cancelButton.textContent = t("cancel");
    acceptButton.classList.toggle("button-danger", options.danger === true);
    acceptButton.classList.toggle("button-pink", options.danger !== true);

    return new Promise((resolve) => {
        let accepted = false;
        const onAccept = () => {
            accepted = true;
            dialog.close();
        };
        const onCancel = () => dialog.close();
        const onBackdrop = (event: MouseEvent) => {
            if (event.target === dialog) dialog.close();
        };
        const onClose = () => {
            acceptButton.removeEventListener("click", onAccept);
            cancelButton.removeEventListener("click", onCancel);
            dialog.removeEventListener("click", onBackdrop);
            resolve(accepted);
        };
        acceptButton.addEventListener("click", onAccept);
        cancelButton.addEventListener("click", onCancel);
        dialog.addEventListener("click", onBackdrop);
        dialog.addEventListener("close", onClose, { once: true });
        dialog.showModal();
        cancelButton.focus();
    });
}
