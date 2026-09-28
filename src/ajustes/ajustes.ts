/**
 * settings.ts (renamed from ajustes.ts)
 * Language selector (ES/EN flags in the top bar) and settings panel with
 * effects volume. Everything is stored in the browser.
 */

import { establecerVolumenEfectos as setEffectsVolume, reproducirEfecto as playEffect } from "../audio/efectos";
import type { Idioma } from "../i18n/textos";
import { cambiarIdioma as changeLanguage, detectarIdiomaDelNavegador as detectBrowserLanguage } from "../i18n/textos";
import { guardarDato as saveData, leerDatoGuardado as readSavedData } from "../utilidades/almacenamiento";
import { obtenerElemento as getElement } from "../utilidades/dom";

/** Settings that persist between visits. */
interface SavedSettings {
    language: Idioma;
    /** 0-100 */
    effectsVolume: number;
}

const STORAGE_KEY = "ajustes";

/** Current settings. */
let settings: SavedSettings = {
    language: detectBrowserLanguage(),
    effectsVolume: 70,
};

const elements = {
    openButton: getElement("boton-ajustes", HTMLButtonElement),
    dialog: getElement("dialogo-ajustes", HTMLDialogElement),
    languageButtons: [...document.querySelectorAll<HTMLButtonElement>(".boton-idioma")],
    effectsSlider: getElement("volumen-efectos", HTMLInputElement),
    effectsValue: getElement("valor-volumen-efectos", HTMLOutputElement),
};

/** Saves current settings to the browser. */
function saveSettings(): void {
    saveData(STORAGE_KEY, settings);
}

/**
 * Activates a language and marks its button as pressed.
 * @param language Language to activate.
 */
function applyLanguage(language: Idioma): void {
    settings.language = language;
    changeLanguage(language);
    elements.languageButtons.forEach((button) => {
        button.setAttribute("aria-pressed", String(button.dataset.idioma === language));
    });
}

/** Loads saved settings, applies them, and connects the controls. */
export function initSettings(): void {
    const saved = readSavedData<Partial<SavedSettings>>(STORAGE_KEY, {});
    settings = {
        language: saved.language === "en" || saved.language === "es" ? saved.language : settings.language,
        effectsVolume: typeof saved.effectsVolume === "number" ? saved.effectsVolume : settings.effectsVolume,
    };

    applyLanguage(settings.language);
    setEffectsVolume(settings.effectsVolume / 100);
    elements.effectsSlider.value = String(settings.effectsVolume);
    elements.effectsValue.value = `${settings.effectsVolume}%`;

    elements.openButton.addEventListener("click", () => elements.dialog.showModal());
    elements.dialog.addEventListener("click", (event) => {
        if (event.target === elements.dialog) {
            elements.dialog.close();
        }
    });

    elements.languageButtons.forEach((button) => {
        button.addEventListener("click", () => {
            applyLanguage(button.dataset.idioma as Idioma);
            saveSettings();
        });
    });

    elements.effectsSlider.addEventListener("input", () => {
        settings.effectsVolume = Number(elements.effectsSlider.value);
        setEffectsVolume(settings.effectsVolume / 100);
        elements.effectsValue.value = `${settings.effectsVolume}%`;
        saveSettings();
    });
    // When the slider is released, play a sound so the user can hear the chosen volume.
    elements.effectsSlider.addEventListener("change", () => playEffect("acierto"));
}
