/**
 * account-ui.ts
 * Account interface:
 *   - Header button that opens a drop-down menu. As a guest the menu has
 *     the Log in / Create account tabs (username and password). With a
 *     session it shows your photo, name, points, league and numbers, and the
 *     My profile (friends and Versus), Edit profile and Log out buttons.
 *     A pink badge shows the challenges waiting for you.
 *   - "Edit profile" dialog: name, photo, password change (asks for the
 *     current one) and account deletion.
 *   - Eye buttons to show passwords and copy buttons.
 */

import { leagueFor } from "../config/leagues";
import type { TextKey } from "../i18n/texts";
import { getLanguage, LANGUAGE_CHANGED, t } from "../i18n/texts";
import { formatPoints } from "../game/scoring";
import { copyToClipboard } from "../utils/clipboard";
import { confirmDialog } from "../utils/confirm";
import { getElement } from "../utils/dom";
import {
    AccountError,
    avatarUrl,
    changeName,
    changePassword,
    deleteAccount,
    displayName,
    getProfile,
    isOnline,
    logIn,
    logOut,
    MAX_NAME_LENGTH,
    removeAvatar,
    SESSION_CHANGED,
    signUp,
    uploadAvatar,
} from "./session";

/** Background colours of avatars without a photo (picked from the username). */
const INITIAL_COLORS = ["#ff2e7e", "#19f5c8", "#ffd84d", "#22e5ff", "#a78bfa", "#ff8a3d", "#4ade80", "#f472b6"];

const EYE_ICON =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
const EYE_OFF_ICON =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" d="M3 3l18 18M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a18 18 0 0 1-3.1 4M6.6 6.6A17.6 17.6 0 0 0 2 12s3.6 7 10 7a9.7 9.7 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

const elements = {
    zone: getElement("account-zone"),
    button: getElement("account-button", HTMLButtonElement),
    headerAvatar: getElement("header-avatar"),
    headerUsername: getElement("header-username"),
    headerPoints: getElement("header-points"),
    headerChallenges: getElement("header-challenges"),
    menu: getElement("account-menu"),
    guestMenu: getElement("guest-menu"),
    playerMenu: getElement("player-menu"),
    tabs: [...document.querySelectorAll<HTMLButtonElement>(".account-tab")],
    loginForm: getElement("login-form", HTMLFormElement),
    usernameInput: getElement("username-input", HTMLInputElement),
    passwordInput: getElement("password-input", HTMLInputElement),
    repeatGroup: getElement("repeat-group"),
    repeatInput: getElement("repeat-input", HTMLInputElement),
    loginSubmit: getElement("login-submit", HTMLButtonElement),
    loginMessage: getElement("login-message"),
    usernameHelp: getElement("username-help"),
    menuAvatar: getElement("menu-avatar"),
    menuName: getElement("menu-name"),
    menuPoints: getElement("menu-points"),
    menuLeague: getElement("menu-league"),
    menuChallenges: getElement("menu-challenges"),
    statGames: getElement("stat-games"),
    statHits: getElement("stat-hits"),
    statAccuracy: getElement("stat-accuracy"),
    myProfileButton: getElement("my-profile-button", HTMLButtonElement),
    editProfileButton: getElement("edit-profile-button", HTMLButtonElement),
    logoutButton: getElement("logout-button", HTMLButtonElement),
    profileDialog: getElement("profile-dialog", HTMLDialogElement),
    profileForm: getElement("profile-form", HTMLFormElement),
    nameInput: getElement("name-input", HTMLInputElement),
    profileAvatar: getElement("profile-avatar"),
    photoInput: getElement("photo-input", HTMLInputElement),
    removePhotoButton: getElement("remove-photo-button", HTMLButtonElement),
    photoMessage: getElement("photo-message"),
    hiddenUsername: getElement("hidden-username", HTMLInputElement),
    currentPasswordInput: getElement("current-password-input", HTMLInputElement),
    newPasswordInput: getElement("new-password-input", HTMLInputElement),
    profileMessage: getElement("profile-message"),
    saveProfileButton: getElement("save-profile-button", HTMLButtonElement),
    cancelProfileButton: getElement("cancel-profile-button", HTMLButtonElement),
    deleteAccountButton: getElement("delete-account-button", HTMLButtonElement),
};

/** What the menu form does: log in or sign up. */
let formMode: "login" | "signup" = "login";
/** Pending action after logging in (e.g. adding the friend of an invitation). */
let afterLogin: (() => void) | null = null;
/** Versus challenges waiting for the player (for the badge). */
let pendingChallenges = 0;

/** Minimum data to paint an avatar. */
export interface AvatarData {
    id: string;
    username: string;
    name?: string | null;
    avatarVersion: number | null;
}

/**
 * Paints an avatar: the player's photo or, without one, their initial on a colour.
 * @param element Element with the "avatar" class.
 * @param data Player (null = guest).
 */
export function paintAvatar(element: HTMLElement, data: AvatarData | null): void {
    const url = data ? avatarUrl(data.id, data.avatarVersion) : null;
    element.replaceChildren();
    if (url) {
        const image = document.createElement("img");
        image.src = url;
        image.alt = "";
        image.loading = "lazy";
        image.decoding = "async";
        image.draggable = false;
        element.append(image);
        element.style.removeProperty("--avatar-color");
        return;
    }
    let hash = 0;
    for (const character of data?.username ?? "?") hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    element.textContent = data ? [...displayName(data)][0] : "?";
    element.style.setProperty("--avatar-color", INITIAL_COLORS[hash % INITIAL_COLORS.length]);
}

/**
 * Turns an account error into a message for the player.
 * @param error Error received.
 */
export function accountErrorMessage(error: unknown): string {
    const keys: Record<string, TextKey> = {
        credentials: "errorWrongCredentials",
        "username-taken": "errorUsernameTaken",
        "invalid-username": "errorInvalidUsername",
        "short-password": "errorShortPassword",
        "current-password": "errorCurrentPassword",
        "confirm-email": "errorConfirmEmail",
        "too-many-attempts": "errorTooManyAttempts",
        offline: "errorOffline",
        "no-server": "accountsUnavailable",
        "outdated-database": "errorOutdatedDatabase",
        "invalid-image": "errorImage",
        "image-too-big": "errorImageTooBig",
        // Codes raised by the database functions (they keep their Spanish names).
        "usuario-no-existe": "errorNoSuchUser",
        "eres-tu": "errorItsYou",
        "demasiados-amigos": "tooManyFriends",
        "demasiado-rapido": "errorTooFast",
        "nombre-no-valido": "errorName",
        "no-es-amigo": "errorNotFriend",
        "reto-no-valido": "errorOffline",
        "reto-no-existe": "errorChallengeGone",
        "reto-terminado": "errorChallengeGone",
        "demasiados-retos": "errorTooManyChallenges",
    };
    const key = error instanceof AccountError ? keys[error.code] : undefined;
    if (!key) console.error(error);
    return t(key ?? "errorOffline");
}

/* ---------- Drop-down menu ---------- */

/** Whether the account menu is open. */
function isMenuOpen(): boolean {
    return elements.menu.classList.contains("is-open");
}

/**
 * Opens or closes the account menu.
 * @param open true to open, false to close.
 */
function toggleMenu(open: boolean): void {
    elements.menu.classList.toggle("is-open", open);
    elements.button.setAttribute("aria-expanded", String(open));
    // Wait for the animation to start so focus doesn't jump to something invisible.
    if (open && !getProfile()) requestAnimationFrame(() => elements.usernameInput.focus());
}

/**
 * Switches the form between "log in" and "create account".
 * @param mode Form mode.
 */
function setFormMode(mode: "login" | "signup"): void {
    formMode = mode;
    elements.tabs.forEach((tab) => tab.setAttribute("aria-selected", String(tab.dataset.mode === mode)));
    elements.guestMenu.dataset.mode = mode;
    elements.repeatGroup.hidden = mode === "login";
    elements.repeatInput.required = mode === "signup";
    elements.usernameHelp.hidden = mode === "login";
    elements.passwordInput.autocomplete = mode === "login" ? "current-password" : "new-password";
    elements.loginSubmit.textContent = t(mode === "login" ? "logIn" : "createAccount");
    elements.loginMessage.textContent = "";
}

/**
 * Opens the account menu on "Log in" or "Create account".
 * @param mode "login" or "signup".
 * @param then Action to run once the player has logged in.
 */
export function openLogin(mode: "login" | "signup" = "login", then: (() => void) | null = null): void {
    if (!isOnline()) return;
    afterLogin = then;
    setFormMode(mode);
    window.scrollTo({ top: 0, behavior: "smooth" });
    toggleMenu(true);
}

/** Sends the log in / sign up form. */
async function submitLogin(): Promise<void> {
    const username = elements.usernameInput.value;
    const password = elements.passwordInput.value;
    if (formMode === "signup" && password !== elements.repeatInput.value) {
        elements.loginMessage.textContent = t("errorPasswordsDiffer");
        return;
    }
    elements.loginSubmit.disabled = true;
    elements.loginSubmit.classList.add("is-loading");
    elements.loginMessage.textContent = "";
    try {
        if (formMode === "login") await logIn(username, password);
        else await signUp(username, password);
        elements.loginForm.reset();
        toggleMenu(false);
        const pending = afterLogin;
        afterLogin = null;
        pending?.();
    } catch (error) {
        elements.loginMessage.textContent = accountErrorMessage(error);
        elements.menu.classList.remove("is-shaking");
        void elements.menu.offsetWidth;
        elements.menu.classList.add("is-shaking");
    } finally {
        elements.loginSubmit.disabled = false;
        elements.loginSubmit.classList.remove("is-loading");
    }
}

/* ---------- Painting ---------- */

/** Paints the badge with pending challenges in the header and the menu. */
function paintChallengeBadges(): void {
    const show = pendingChallenges > 0 && getProfile() !== null;
    for (const badge of [elements.headerChallenges, elements.menuChallenges]) {
        badge.hidden = !show;
        badge.textContent = String(pendingChallenges);
    }
    elements.headerChallenges.title = show ? `${t("pendingChallenges")}: ${pendingChallenges}` : "";
}

/**
 * Stores how many Versus challenges are waiting for the player.
 * @param count Pending challenges.
 */
export function setPendingChallenges(count: number): void {
    pendingChallenges = count;
    paintChallengeBadges();
}

/** Repaints the header button and the menu contents. */
function paintAccount(): void {
    const profile = getProfile();
    const language = getLanguage();
    elements.zone.hidden = !isOnline();
    elements.button.classList.toggle("has-session", profile !== null);
    paintAvatar(elements.headerAvatar, profile);
    paintChallengeBadges();
    elements.headerUsername.textContent = profile ? displayName(profile) : t("logIn");
    elements.headerPoints.textContent = profile ? `${formatPoints(profile.totalPoints, language)} pts` : "";
    elements.headerPoints.hidden = !profile;
    elements.button.setAttribute("aria-label", profile ? `${t("yourAccount")}: ${displayName(profile)}` : t("logIn"));

    elements.guestMenu.hidden = profile !== null;
    elements.playerMenu.hidden = profile === null;
    if (!profile) return;
    paintAvatar(elements.menuAvatar, profile);
    elements.menuName.textContent = displayName(profile);
    elements.menuPoints.textContent = `${formatPoints(profile.totalPoints, language)} ${t("points")}`;
    const league = leagueFor(profile.leaguePoints);
    elements.menuLeague.textContent = `${league.icon} ${league.name[language]} · ${formatPoints(profile.leaguePoints, language)} ${t("lp")}`;
    elements.menuLeague.style.setProperty("--league-color", league.color);
    elements.statGames.textContent = formatPoints(profile.games, language);
    elements.statHits.textContent = formatPoints(profile.hits, language);
    elements.statAccuracy.textContent = profile.questions > 0 ? `${Math.round((profile.hits / profile.questions) * 100)}%` : "–";
    paintAvatar(elements.profileAvatar, profile);
    elements.removePhotoButton.hidden = profile.avatarVersion === null;
}

/* ---------- Edit profile ---------- */

/** Opens the edit-profile dialog with the current data. */
export function openEditProfile(): void {
    const profile = getProfile();
    if (!profile) return;
    toggleMenu(false);
    elements.nameInput.value = displayName(profile);
    elements.hiddenUsername.value = profile.username;
    elements.currentPasswordInput.value = "";
    elements.newPasswordInput.value = "";
    elements.profileMessage.textContent = "";
    elements.profileMessage.classList.remove("is-error");
    elements.photoMessage.textContent = "";
    paintAccount();
    elements.profileDialog.showModal();
}

/** Saves the name and, if typed, the new password. */
async function saveProfile(): Promise<void> {
    const profile = getProfile();
    if (!profile) return;
    const message = elements.profileMessage;
    message.classList.remove("is-error");
    const name = elements.nameInput.value.trim();
    const current = elements.currentPasswordInput.value;
    const next = elements.newPasswordInput.value;
    if (next && !current) {
        message.textContent = t("errorMissingCurrentPassword");
        message.classList.add("is-error");
        elements.currentPasswordInput.focus();
        return;
    }
    elements.saveProfileButton.disabled = true;
    elements.saveProfileButton.classList.add("is-loading");
    try {
        // Typing your own username (or nothing) goes back to showing the username.
        if (name !== displayName(profile)) await changeName(name.toLowerCase() === profile.username ? "" : name);
        if (next) await changePassword(current, next);
        message.textContent = t("changesSaved");
        setTimeout(() => elements.profileDialog.close(), 700);
    } catch (error) {
        message.textContent = accountErrorMessage(error);
        message.classList.add("is-error");
    } finally {
        elements.saveProfileButton.disabled = false;
        elements.saveProfileButton.classList.remove("is-loading");
    }
}

/* ---------- Shared details ---------- */

/** Adds the eye buttons that show or hide passwords. */
function connectEyeButtons(): void {
    document.querySelectorAll<HTMLButtonElement>(".show-password").forEach((button) => {
        const input = button.parentElement?.querySelector("input");
        if (!input) return;
        button.innerHTML = EYE_ICON;
        button.addEventListener("click", () => {
            const visible = input.type === "password";
            input.type = visible ? "text" : "password";
            button.innerHTML = visible ? EYE_OFF_ICON : EYE_ICON;
            button.setAttribute("aria-label", t(visible ? "hidePassword" : "showPassword"));
            button.setAttribute("aria-pressed", String(visible));
        });
    });
}

/** Buttons that copy a text of the page (data-copy = id of the element). */
function connectCopyButtons(): void {
    document.querySelectorAll<HTMLButtonElement>("[data-copy]").forEach((button) => {
        button.addEventListener("click", async () => {
            const text = document.getElementById(button.dataset.copy ?? "")?.textContent?.trim();
            if (!text || /^[·—]+$/.test(text) || !(await copyToClipboard(text))) return;
            button.classList.add("is-copied");
            setTimeout(() => button.classList.remove("is-copied"), 1200);
        });
    });
}

/**
 * Connects the account menu and the edit-profile dialog.
 * @param openProfile Shows the "My profile" screen (friends and Versus).
 */
export function initAccountUi(openProfile: () => void): void {
    elements.button.addEventListener("click", () => toggleMenu(!isMenuOpen()));
    // Closes when clicking outside or pressing Escape.
    document.addEventListener("pointerdown", (event) => {
        if (isMenuOpen() && !elements.zone.contains(event.target as Node)) toggleMenu(false);
    });
    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && isMenuOpen()) {
            toggleMenu(false);
            elements.button.focus();
        }
    });
    document.querySelectorAll<HTMLElement>("[data-open-login]").forEach((button) => {
        button.addEventListener("click", (event) => {
            event.stopPropagation();
            openLogin(button.dataset.openLogin === "signup" ? "signup" : "login");
        });
    });

    elements.tabs.forEach((tab) => tab.addEventListener("click", () => setFormMode(tab.dataset.mode === "signup" ? "signup" : "login")));
    elements.loginForm.addEventListener("submit", (event) => {
        event.preventDefault();
        void submitLogin();
    });
    // Usernames are always lowercase and without spaces.
    elements.usernameInput.addEventListener("input", () => {
        const clean = elements.usernameInput.value.toLowerCase().replace(/\s/g, "");
        if (clean !== elements.usernameInput.value) elements.usernameInput.value = clean;
    });

    elements.myProfileButton.addEventListener("click", () => {
        toggleMenu(false);
        openProfile();
    });
    elements.editProfileButton.addEventListener("click", openEditProfile);
    elements.logoutButton.addEventListener("click", async () => {
        toggleMenu(false);
        await logOut().catch(() => {});
    });

    elements.nameInput.maxLength = MAX_NAME_LENGTH;
    elements.profileForm.addEventListener("submit", (event) => {
        event.preventDefault();
        void saveProfile();
    });
    elements.cancelProfileButton.addEventListener("click", () => elements.profileDialog.close());
    elements.profileDialog.addEventListener("click", (event) => {
        if (event.target === elements.profileDialog) elements.profileDialog.close();
    });
    elements.photoInput.addEventListener("change", async () => {
        const file = elements.photoInput.files?.[0];
        elements.photoInput.value = "";
        if (!file) return;
        elements.photoMessage.textContent = t("uploadingPhoto");
        try {
            await uploadAvatar(file);
            elements.photoMessage.textContent = t("photoUpdated");
        } catch (error) {
            elements.photoMessage.textContent = accountErrorMessage(error);
        }
    });
    elements.removePhotoButton.addEventListener("click", async () => {
        try {
            await removeAvatar();
            elements.photoMessage.textContent = "";
        } catch (error) {
            elements.photoMessage.textContent = accountErrorMessage(error);
        }
    });
    elements.deleteAccountButton.addEventListener("click", async () => {
        const profile = getProfile();
        if (!profile) return;
        elements.profileDialog.close();
        const accepted = await confirmDialog({
            title: t("deleteAccountTitle"),
            message: `${t("deleteAccountConfirm")} (${displayName(profile)})`,
            accept: t("deleteAccount"),
            danger: true,
        });
        if (!accepted) {
            elements.profileDialog.showModal();
            return;
        }
        try {
            await deleteAccount();
        } catch (error) {
            elements.profileDialog.showModal();
            elements.profileMessage.textContent = accountErrorMessage(error);
            elements.profileMessage.classList.add("is-error");
        }
    });

    connectEyeButtons();
    connectCopyButtons();
    document.addEventListener(SESSION_CHANGED, paintAccount);
    document.addEventListener(LANGUAGE_CHANGED, () => {
        paintAccount();
        setFormMode(formMode);
    });
    setFormMode("login");
    paintAccount();
}
