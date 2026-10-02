/**
 * main.ts
 * QuizMania entry point. Starts the settings, the language and the session,
 * blocks the right-click menu, adds the click sound to every button and
 * connects each screen's buttons:
 *
 *   Home (hold topic/mode + pull the lever or press Space) → Loading → Questions
 *        → Results → (Review answers) → Play again → Home
 *   Header: logo and "Play" (home), ranking, the language toggle, the
 *   settings drop-down (with the music) and the account menu, which opens
 *   "My profile" (friends and Versus challenges).
 * When the page opens the welcome screen (splash) shows for a moment.
 */

import { initAccountUi } from "./account/account-ui";
import { isOnline, restoreSession } from "./account/session";
import { initBeat } from "./audio/beat";
import { playEffect } from "./audio/effects";
import { initMusicUi } from "./audio/music-ui";
import { abandonGame, changeGameLanguage, endGame, isGameInProgress, moveReview, paintResults, showCurrentQuestion, showResults, startGame, startReview } from "./game/match";
import { currentScreen, showScreen } from "./game/screens";
import { formatPoints } from "./game/scoring";
import { gameState } from "./game/state";
import { getLanguage, LANGUAGE_CHANGED, t } from "./i18n/texts";
import { initProfile, loadProfileScreen } from "./online/profile";
import { initRanking, loadRankingScreen } from "./online/ranking";
import { initVersus } from "./online/versus";
import { initSettings } from "./settings/settings";
import { connectLever } from "./slot/lever";
import { initSlotMachine, lockSlot, nudgeMode, nudgeTopic, resetSlot, spin } from "./slot/slot-machine";
import { confirmDialog } from "./utils/confirm";
import { getElement } from "./utils/dom";
import { blockContextMenu } from "./utils/protection";
import { wait } from "./utils/random";

/** Pause after the reels stop before loading the questions (ms). */
const PAUSE_AFTER_SPIN = 1400;

const lever = getElement("lever", HTMLButtonElement);

/** Avoids pulling the lever again while it spins. */
let spinning = false;

/**
 * If a game is in progress, asks whether to abandon it.
 * @returns true if it's fine to leave (no game, or the player accepts).
 */
async function confirmLeave(): Promise<boolean> {
    if (!isGameInProgress()) return true;
    const accepted = await confirmDialog({ title: t("leaveGameTitle"), message: t("leaveGameConfirm"), accept: t("leave"), danger: true });
    if (accepted) abandonGame();
    return accepted;
}

/** Shows the home screen with the slot machine ready to pull. */
function showHome(): void {
    lever.disabled = false;
    resetSlot();
    gameState.reviewing = false;
    showScreen("home");
}

/** Shows the ranking screen. */
async function showRanking(): Promise<void> {
    if (spinning || !(await confirmLeave())) return;
    showScreen("ranking");
    void loadRankingScreen();
}

/** Shows your profile: friends and Versus challenges. */
async function showProfile(): Promise<void> {
    if (spinning || !(await confirmLeave())) return;
    showScreen("profile");
    void loadProfileScreen();
}

/** Pulls the lever: spins the reels and starts the game they decide. */
async function pull(): Promise<void> {
    if (spinning) return;
    spinning = true;
    lever.disabled = true;
    lockSlot(true);
    const result = await spin();
    await wait(PAUSE_AFTER_SPIN);
    spinning = false;
    await startGame(result.mode, result.topic, { multiplier: result.multiplier });
}

/** Plays a click when any button is pressed, except those marked data-no-click (they have their own sound). */
function enableButtonSounds(): void {
    document.addEventListener("click", (event) => {
        const button = (event.target as Element | null)?.closest("button");
        if (button && !button.disabled && !("noClick" in button.dataset)) playEffect("click");
    });
}

/**
 * Keyboard shortcuts of the home screen (not while typing or with a dialog open):
 *   Space   pulls the lever.
 *   ← / →   nudge the mode reel.
 *   ↑ / ↓   nudge the topic reel.
 * @param pullWithAnimation Pulls the lever with its animation.
 */
function enableHomeShortcuts(pullWithAnimation: () => void): void {
    document.addEventListener("keydown", (event) => {
        if (event.repeat || currentScreen() !== "home" || spinning) return;
        const target = event.target as HTMLElement | null;
        // Not while typing, inside a drop-down menu or with a dialog open.
        if (target?.closest("input, textarea, select, dialog, .settings-menu, .account-menu") || document.querySelector("dialog[open]")) return;
        if (event.code === "Space") {
            // Space on any focused button presses that button; on the lever it already pulls.
            if (target?.closest("button")) return;
            event.preventDefault();
            pullWithAnimation();
        } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            nudgeMode(event.key === "ArrowLeft" ? -1 : 1);
        } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
            nudgeTopic(event.key === "ArrowUp" ? -1 : 1);
        }
    });
}

/** Removes the splash when its animation ends, or earlier on any key or click. */
function prepareSplash(): void {
    const splash = document.getElementById("splash");
    if (!splash) return;
    const hide = () => {
        splash.classList.add("is-hidden");
        window.removeEventListener("keydown", hide, true);
        window.removeEventListener("pointerdown", hide, true);
    };
    splash.addEventListener("animationend", (event) => {
        if (event.target === splash) hide();
    });
    window.addEventListener("keydown", hide, true);
    window.addEventListener("pointerdown", hide, true);
}

/** Connects every screen button with its action. */
function connectButtons(): void {
    const pullWithAnimation = connectLever(lever, () => void pull());
    enableHomeShortcuts(pullWithAnimation);
    const goHome = async () => {
        if (!spinning && (await confirmLeave())) showHome();
    };
    getElement("home-button").addEventListener("click", goHome);
    getElement("nav-play").addEventListener("click", goHome);
    const rankingButton = getElement("nav-ranking");
    rankingButton.hidden = !isOnline();
    rankingButton.addEventListener("click", () => void showRanking());
    getElement("retry-button").addEventListener("click", showHome);
    getElement("end-game-button").addEventListener("click", async () => {
        // In Double or nothing, ending is cashing out with your points.
        const cashOut = gameState.mode.loseAllOnMiss;
        const accepted = await confirmDialog({
            title: t(cashOut ? "cashOutTitle" : "endGameTitle"),
            message: cashOut ? `${t("cashOutConfirm")} ${formatPoints(gameState.points, getLanguage())} ${t("points")}.` : t("endGameConfirm"),
            accept: t(cashOut ? "cashOut" : "endGame"),
        });
        if (accepted && isGameInProgress()) endGame();
    });
    getElement("review-button").addEventListener("click", startReview);
    getElement("review-previous").addEventListener("click", () => moveReview(-1));
    getElement("review-next").addEventListener("click", () => moveReview(1));
    getElement("see-results-button").addEventListener("click", showResults);
    document.querySelectorAll(".play-again-button").forEach((button) => button.addEventListener("click", showHome));
    document.querySelectorAll<HTMLElement>(".see-ranking-button").forEach((button) => {
        button.hidden = !isOnline();
        button.addEventListener("click", () => void showRanking());
    });
}

/**
 * Repaints the texts generated by code when the player changes language.
 * Questions on screen are translated too (from their original text).
 */
function repaintOnLanguageChange(): void {
    document.addEventListener(LANGUAGE_CHANGED, () => {
        const screen = currentScreen();
        if (screen === "question" && gameState.history.length > 0) {
            showCurrentQuestion();
            void changeGameLanguage(getLanguage());
        } else if (screen === "results") {
            paintResults();
        } else if (screen === "ranking") {
            void loadRankingScreen();
        }
    });
}

/** Writes the version in the footer. */
function paintVersion(): void {
    getElement("app-version").textContent = `v${__APP_VERSION__}`;
}

/** Starts the game. */
async function start(): Promise<void> {
    prepareSplash();
    blockContextMenu();
    repaintOnLanguageChange();
    initSettings();
    initMusicUi();
    initBeat(getElement("slot-machine"));
    initAccountUi(() => void showProfile());
    initSlotMachine();
    enableButtonSounds();
    connectButtons();
    paintVersion();
    initVersus();
    await restoreSession().catch(() => {});
    initRanking(() => void showProfile());
    initProfile(() => void showProfile(), showHome);
}

void start();
