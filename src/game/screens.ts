/**
 * screens.ts
 * The game is a single page with several "screens" (HTML sections). This
 * module decides which one is visible.
 */

import { getElement } from "../utils/dom";

/** Game screens. */
export type ScreenName = "home" | "loading" | "question" | "results" | "ranking" | "profile";

const SCREEN_IDS: Record<ScreenName, string> = {
    home: "home-screen",
    loading: "loading-screen",
    question: "question-screen",
    results: "results-screen",
    ranking: "ranking-screen",
    profile: "profile-screen",
};

/** The screen being shown. */
export function currentScreen(): ScreenName {
    const visible = (Object.keys(SCREEN_IDS) as ScreenName[]).find((name) => !getElement(SCREEN_IDS[name]).hidden);
    return visible ?? "home";
}

/**
 * Shows a screen and hides every other one. Focus moves to the new screen's
 * title so screen readers announce the change.
 * @param name Screen to show.
 */
export function showScreen(name: ScreenName): void {
    for (const [screen, id] of Object.entries(SCREEN_IDS)) {
        const element = getElement(id);
        element.hidden = screen !== name;
        // From now on every screen animates in (see .is-initial in style.css).
        element.classList.remove("is-initial");
    }
    // The header marks the current section: Ranking, none on the profile
    // (it opens from the account menu) or Play for everything else.
    const section = name === "ranking" ? "nav-ranking" : name === "profile" ? "" : "nav-play";
    for (const id of ["nav-play", "nav-ranking"]) {
        const link = document.getElementById(id);
        if (id === section) link?.setAttribute("aria-current", "page");
        else link?.removeAttribute("aria-current");
    }
    getElement(SCREEN_IDS[name]).querySelector<HTMLElement>("h1, h2")?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
}
