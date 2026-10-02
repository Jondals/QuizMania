/**
 * settings.ts
 * The language toggle in the header (one button that flips between Spanish
 * and English) and the Settings drop-down under the gear button (it closes
 * on the ✕, on Escape or when clicking outside): two collapsible sections
 * ("Options" and "Playlist"), the effects/music volume, a "Reduce
 * animations" switch and a button to watch the splash screen again.
 * Everything is saved in the browser.
 */

import { setBeatEnabled } from "../audio/beat";
import { playEffect, setEffectsVolume } from "../audio/effects";
import type { Language } from "../i18n/texts";
import { detectBrowserLanguage, setLanguage, t } from "../i18n/texts";
import { readSaved, save } from "../utils/storage";
import { getElement } from "../utils/dom";

/** Settings kept between visits. */
interface SavedSettings {
    language: Language;
    /** 0-100 */
    effectsVolume: number;
    /** Force reduced motion on, regardless of the system setting. */
    reduceMotion: boolean;
}

const STORAGE_KEY = "settings";
/** Key used by the first versions (same fields); read once as a fallback. */
const LEGACY_STORAGE_KEY = "ajustes";

let settings: SavedSettings = { language: detectBrowserLanguage(), effectsVolume: 70, reduceMotion: false };

const elements = {
    openButton: getElement("settings-button", HTMLButtonElement),
    zone: getElement("settings-zone"),
    menu: getElement("settings-menu"),
    closeButton: getElement("settings-close", HTMLButtonElement),
    languageToggle: getElement("language-toggle", HTMLButtonElement),
    languageCode: getElement("language-code"),
    effectsSlider: getElement("effects-volume", HTMLInputElement),
    effectsValue: getElement("effects-volume-value", HTMLOutputElement),
    reduceMotionToggle: getElement("reduce-motion-toggle", HTMLInputElement),
    replayIntroButton: getElement("replay-intro-button", HTMLButtonElement),
    sections: [...document.querySelectorAll<HTMLElement>(".settings-section")],
};

/** Saves the current settings. */
function saveSettings(): void {
    save(STORAGE_KEY, settings);
}

/**
 * Activates a language and shows it on the toggle (its flag flips over via
 * CSS when data-language changes).
 * @param language Language to activate.
 */
function applyLanguage(language: Language): void {
    settings.language = language;
    setLanguage(language);
    const code = language.toUpperCase();
    elements.languageToggle.dataset.language = language;
    elements.languageCode.textContent = code;
    // The accessible name starts with the visible code, then says what a press does.
    elements.languageToggle.setAttribute("aria-label", `${t("language")}: ${code}. ${t("switchLanguage")}`);
}

/** Whether the Settings drop-down is open. */
function isMenuOpen(): boolean {
    return elements.menu.classList.contains("is-open");
}

/**
 * Opens or closes the Settings drop-down.
 * @param open true to open, false to close.
 */
function toggleMenu(open: boolean): void {
    elements.menu.classList.toggle("is-open", open);
    elements.openButton.setAttribute("aria-expanded", String(open));
}

/**
 * Turns "Reduce animations" on or off: adds (or removes) a class on <html>
 * that a plain CSS rule treats exactly like the system's reduced-motion
 * preference (see style.css), and stops the slot machine's beat-sync too.
 * @param value Whether to force reduced motion.
 */
function applyReduceMotion(value: boolean): void {
    const wasReduced = document.documentElement.classList.contains("force-reduced-motion");
    settings.reduceMotion = value;
    document.documentElement.classList.toggle("force-reduced-motion", value);
    if (wasReduced && !value) restartBackground();
    elements.reduceMotionToggle.checked = value;
    setBeatEnabled(!value);
    // The CSS for reduced motion hides the splash outright, so replaying it
    // would do nothing visible while this is on.
    elements.replayIntroButton.disabled = value;
}

/**
 * Restarts every animation of the background (lights, floor and the floating,
 * falling and twinkling particles). While animations were reduced they were
 * cut to a single near-instant run, and some browsers leave them finished
 * when the normal rules come back; restarting them makes sure the particles
 * return straight away instead of after the usual page-load delay.
 */
function restartBackground(): void {
    const background = document.querySelector<HTMLElement>(".background");
    if (!background) return;
    const animated = [background, ...background.querySelectorAll<HTMLElement>("*")];
    animated.forEach((element) => (element.style.animation = "none"));
    void background.offsetWidth; // Forces the browser to drop the old animations.
    animated.forEach((element) => (element.style.animation = ""));
    // The particle layers normally fade in 2.5 s after loading; here, at once.
    background.querySelectorAll<HTMLElement>(".background-symbols, .background-rain, .background-stars").forEach((layer) => (layer.style.animationDelay = "0s"));
}

/**
 * Opens or closes one of the two collapsible sections (both start open;
 * the grid-rows transition that animates it lives in deferred.css).
 * @param section The section's own element (".settings-section").
 * @param open Whether to open it.
 */
function toggleSection(section: HTMLElement, open: boolean): void {
    section.classList.toggle("is-open", open);
    section.querySelector(".settings-section-header")?.setAttribute("aria-expanded", String(open));
}

/**
 * Shows the splash screen again from the start, reels and all, as if the
 * page had just loaded. Its own permanent "animationend" listener (set up
 * once in main.ts) hides it again when the replay finishes.
 */
function replayIntro(): void {
    const splash = document.getElementById("splash");
    if (!splash) return;
    toggleMenu(false);
    splash.classList.remove("is-hidden");
    // The splash and its reels already ran their animation once and are
    // frozen on its last frame; clearing and restoring `animation` restarts it.
    for (const element of [splash, ...splash.querySelectorAll<HTMLElement>(".splash-reels, .splash-strip, .seven")]) {
        element.style.animation = "none";
        void element.offsetWidth; // Forces the browser to apply that before animation is restored.
        element.style.animation = "";
    }
    const skip = () => {
        splash.classList.add("is-hidden");
        window.removeEventListener("keydown", skip, true);
        window.removeEventListener("pointerdown", skip, true);
    };
    window.addEventListener("keydown", skip, true);
    window.addEventListener("pointerdown", skip, true);
}

/** Loads the saved settings, applies them and connects the controls. */
export function initSettings(): void {
    const stored = readSaved<Partial<SavedSettings> | null>(STORAGE_KEY, null) ?? readSaved<Partial<SavedSettings>>(LEGACY_STORAGE_KEY, {});
    settings = {
        language: stored.language === "en" || stored.language === "es" ? stored.language : settings.language,
        effectsVolume: typeof stored.effectsVolume === "number" ? stored.effectsVolume : settings.effectsVolume,
        reduceMotion: stored.reduceMotion === true,
    };
    applyLanguage(settings.language);
    setEffectsVolume(settings.effectsVolume / 100);
    elements.effectsSlider.value = String(settings.effectsVolume);
    elements.effectsValue.value = `${settings.effectsVolume}%`;
    applyReduceMotion(settings.reduceMotion);

    elements.openButton.addEventListener("click", () => toggleMenu(!isMenuOpen()));
    elements.closeButton.addEventListener("click", () => {
        toggleMenu(false);
        elements.openButton.focus();
    });
    // Closes when clicking outside or pressing Escape.
    document.addEventListener("pointerdown", (event) => {
        if (isMenuOpen() && !elements.zone.contains(event.target as Node)) toggleMenu(false);
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && isMenuOpen()) {
            toggleMenu(false);
            elements.openButton.focus();
        }
    });
    elements.languageToggle.addEventListener("click", () => {
        applyLanguage(settings.language === "es" ? "en" : "es");
        saveSettings();
    });
    elements.effectsSlider.addEventListener("input", () => {
        settings.effectsVolume = Number(elements.effectsSlider.value);
        setEffectsVolume(settings.effectsVolume / 100);
        elements.effectsValue.value = `${settings.effectsVolume}%`;
        saveSettings();
    });
    // When the slider is released, a sound plays so the volume can be heard.
    elements.effectsSlider.addEventListener("change", () => playEffect("correct"));

    elements.reduceMotionToggle.addEventListener("change", () => {
        applyReduceMotion(elements.reduceMotionToggle.checked);
        saveSettings();
    });
    elements.replayIntroButton.addEventListener("click", replayIntro);

    elements.sections.forEach((section) => {
        const header = section.querySelector<HTMLButtonElement>(".settings-section-header");
        header?.addEventListener("click", () => toggleSection(section, !section.classList.contains("is-open")));
    });
}
