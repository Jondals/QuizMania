/**
 * profile.ts
 * "My profile" screen (opened from the account menu):
 *   - Header with your photo, name, Versus league (with a bar of what's
 *     missing for the next one) and your numbers.
 *   - Friends: your friend code (copy it or share the invite link), add a
 *     friend by code or username (friendship is mutual) and the list, with
 *     ⚔️ Challenge and remove buttons.
 *   - Versus: challenges waiting for you, those waiting for your rival and
 *     the latest results (with a rematch button).
 *   - A warning when the database still lacks the latest schema.sql.
 *   - Invite link: …/?amigo=<code> leads here (after logging in or signing
 *     up) and adds that friend.
 */

import { accountErrorMessage, openEditProfile, openLogin } from "../account/account-ui";
import { displayName, getProfile, isDatabaseOutdated, isOnline, SESSION_CHANGED } from "../account/session";
import { leagueFor, leagueProgress } from "../config/leagues";
import { getLanguage, LANGUAGE_CHANGED, t } from "../i18n/texts";
import { formatPoints } from "../game/scoring";
import { copyToClipboard } from "../utils/clipboard";
import { confirmDialog } from "../utils/confirm";
import { createElement, getElement, restartAnimation } from "../utils/dom";
import type { Player, PlayerRow } from "./common";
import { callFunction, createAvatar, toPlayer } from "./common";
import type { Challenge } from "./versus";
import { CHALLENGES_CHANGED, challengeFriend, declineChallenge, getChallenges, isMyTurn, loadChallenges, playChallenge } from "./versus";

/**
 * Accepted format when looking for a friend:
 *   - Friend code: 6 characters of the safe alphabet (no I, O, 0, 1).
 *   - Username: 3-20 characters (letters, digits or underscore).
 * The database looks for a code first and then for a username.
 */
const FRIEND_FORMAT = /^[A-HJ-NP-Z2-9]{6}$|^[a-z0-9_]{3,20}$/i;
/** Query parameter of invite links (kept from the first version so old links work). */
const INVITE_PARAMETER = "amigo";

/** A friend of the list. */
interface Friend extends Player {
    totalPoints: number;
    leaguePoints: number;
}

/** Friend row as mis_amigos / anadir_amigo return it. */
interface FriendRow extends PlayerRow {
    puntos_totales: number;
    puntos_liga?: number | null;
}

const elements = {
    screen: getElement("profile-screen"),
    avatar: getElement("hero-avatar"),
    name: getElement("hero-name"),
    username: getElement("hero-username"),
    league: getElement("hero-league"),
    leagueBar: getElement("league-bar"),
    nextLeague: getElement("next-league"),
    numPoints: getElement("num-points"),
    numGames: getElement("num-games"),
    numAccuracy: getElement("num-accuracy"),
    numVersus: getElement("num-versus"),
    databaseWarning: getElement("database-warning"),
    friendsCount: getElement("friends-count"),
    myCode: getElement("my-code"),
    codeHelp: getElement("code-help"),
    inviteMessage: getElement("invite-message"),
    friendForm: getElement("friend-form", HTMLFormElement),
    friendInput: getElement("friend-input", HTMLInputElement),
    friendMessage: getElement("friend-message"),
    friendsList: getElement("friends-list"),
    groupMyTurn: getElement("group-my-turn"),
    listMyTurn: getElement("list-my-turn"),
    groupWaiting: getElement("group-waiting"),
    listWaiting: getElement("list-waiting"),
    groupHistory: getElement("group-history"),
    listHistory: getElement("list-history"),
    versusEmpty: getElement("versus-empty"),
    versusMessage: getElement("versus-message"),
};

let friends: Friend[] = [];

/**
 * Converts a friend row.
 * @param row mis_amigos row.
 */
function toFriend(row: FriendRow): Friend {
    return { ...toPlayer(row), totalPoints: Number(row.puntos_totales), leaguePoints: Number(row.puntos_liga ?? 0) };
}

/* ---------- Header ---------- */

/** Paints the profile header: photo, name, league and numbers. */
function paintHeader(): void {
    const profile = getProfile();
    if (!profile) return;
    const language = getLanguage();
    const number = (value: number) => formatPoints(value, language);

    const avatar = createAvatar(profile, "avatar--large");
    avatar.id = "hero-avatar";
    elements.avatar.replaceWith(avatar);
    elements.avatar = avatar;
    elements.name.textContent = displayName(profile);
    elements.username.textContent = `${t("user")}: ${profile.username}`;

    const league = leagueFor(profile.leaguePoints);
    const { next, missing, progress } = leagueProgress(profile.leaguePoints);
    elements.league.style.setProperty("--league-color", league.color);
    elements.league.replaceChildren(
        createElement("span", "league-badge-icon", league.icon),
        createElement("strong", "", league.name[language]),
        createElement("span", "league-badge-points", `${number(profile.leaguePoints)} ${t("lp")}`),
    );
    elements.leagueBar.style.setProperty("--progress", String(progress));
    elements.leagueBar.style.setProperty("--league-color", next?.color ?? league.color);
    elements.nextLeague.textContent = next ? `${t("missing")} ${number(missing)} ${t("lp")} ${t("forLeague")} ${next.icon} ${next.name[language]}` : t("topLeague");

    elements.numPoints.textContent = number(profile.totalPoints);
    elements.numGames.textContent = number(profile.games);
    elements.numAccuracy.textContent = profile.questions > 0 ? `${Math.round((profile.hits / profile.questions) * 100)}%` : "–";
    elements.numVersus.textContent = `${profile.wins}${t("winShort")} · ${profile.draws}${t("drawShort")} · ${profile.losses}${t("lossShort")}`;

    // The code is handed out by the database; without it (schema.sql not run) friends add you by username.
    elements.myCode.textContent = profile.code ?? "······";
    elements.myCode.classList.toggle("has-no-code", !profile.code);
    elements.codeHelp.textContent = t(profile.code ? "codeHelp" : "codeNotReady");
    elements.databaseWarning.hidden = !isDatabaseOutdated();
}

/* ---------- Friends ---------- */

/**
 * Creates a small button.
 * @param className Classes.
 * @param text Text.
 * @param label aria-label (when the text isn't enough).
 */
function createButton(className: string, text: string, label = ""): HTMLButtonElement {
    const button = createElement("button", className, text);
    button.type = "button";
    if (label) button.setAttribute("aria-label", label);
    return button;
}

/**
 * Asks and challenges a friend (the Versus game starts right away).
 * @param friend Friend to challenge.
 */
async function challenge(friend: Player): Promise<void> {
    const name = displayName(friend);
    const accepted = await confirmDialog({
        title: `${t("challengeWho")} ${name}?`,
        message: `${t("challengeExplain1")} ${name} ${t("challengeExplain2")}`,
        accept: t("letsPlay"),
    });
    if (accepted) await challengeFriend(friend);
}

/**
 * Shows a message under the add-friend form.
 * @param message Text.
 * @param isError Whether it's an error.
 */
function showFriendMessage(message: string, isError = false): void {
    elements.friendMessage.textContent = message;
    elements.friendMessage.classList.toggle("is-error", isError);
}

/**
 * Creates a friend's row with its challenge and remove buttons.
 * @param friend Friend data.
 * @param order Order in the list.
 */
function createFriendRow(friend: Friend, order: number): HTMLLIElement {
    const language = getLanguage();
    const row = createElement("li", "friend-row");
    row.style.setProperty("--order", String(order));
    const league = leagueFor(friend.leaguePoints);

    const texts = createElement("span", "row-texts");
    const detail = createElement("span", "row-detail", `${league.icon} ${league.name[language]} · ${formatPoints(friend.totalPoints, language)} ${t("pts")}`);
    detail.style.setProperty("--league-color", league.color);
    texts.append(createElement("span", "row-name", displayName(friend)), detail);

    const challengeButton = createButton("button button-small button-pink challenge-button", `⚔️ ${t("challenge")}`, `${t("challengeWho")} ${displayName(friend)}`);
    challengeButton.addEventListener("click", () => void challenge(friend));

    const remove = createButton("icon-button icon-button--small remove-button", "✕", `${t("removeFriend")}: ${displayName(friend)}`);
    remove.addEventListener("click", async () => {
        const accepted = await confirmDialog({
            title: t("removeFriend"),
            message: `${t("removeFriendConfirm")} ${displayName(friend)}?`,
            accept: t("removeFriend"),
            danger: true,
        });
        if (!accepted) return;
        try {
            await callFunction("quitar_amigo", { p_amigo: friend.id });
            row.classList.add("is-leaving");
            setTimeout(() => void loadFriends(), 250);
        } catch (error) {
            showFriendMessage(accountErrorMessage(error), true);
        }
    });

    row.append(createAvatar(friend), texts, challengeButton, remove);
    return row;
}

/** Downloads and paints the friends list. */
async function loadFriends(): Promise<void> {
    if (!getProfile()) return;
    try {
        friends = (await callFunction<FriendRow[]>("mis_amigos")).map(toFriend);
    } catch (error) {
        showFriendMessage(accountErrorMessage(error), true);
        return;
    }
    elements.friendsList.replaceChildren(...friends.map((friend, order) => createFriendRow(friend, order)));
    elements.friendsList.dataset.empty = String(friends.length === 0);
    elements.friendsCount.textContent = friends.length > 0 ? String(friends.length) : "";
    restartAnimation(elements.friendsList);
}

/**
 * Adds a friend by code or username.
 * @param typed What the player typed (spaces, dashes, # and @ are ignored).
 */
async function addFriend(typed: string): Promise<void> {
    const clean = typed.trim().replace(/[\s#@-]/g, "");
    if (!FRIEND_FORMAT.test(clean)) {
        showFriendMessage(t("errorCodeOrUsername"), true);
        return;
    }
    showFriendMessage(t("loading"));
    try {
        const friend = toFriend(await callFunction<FriendRow>("anadir_amigo", { p_usuario: clean }));
        showFriendMessage(`✓ ${t("friendAdded")}: ${displayName(friend)}`);
        elements.friendInput.value = "";
        await loadFriends();
    } catch (error) {
        showFriendMessage(accountErrorMessage(error), true);
    }
}

/** Shares (or copies) the invite link with your code. */
async function shareInvite(): Promise<void> {
    const profile = getProfile();
    if (!profile) return;
    const link = `${location.origin}${location.pathname}?${INVITE_PARAMETER}=${encodeURIComponent(profile.code ?? profile.username)}`;
    if (navigator.share) {
        try {
            await navigator.share({ title: "QuizMania", text: t("inviteMessage"), url: link });
            return;
        } catch {
            // Cancelled or not allowed: copy it to the clipboard.
        }
    }
    elements.inviteMessage.textContent = (await copyToClipboard(link)) ? t("linkCopied") : link;
}

/* ---------- Versus ---------- */

/**
 * "5 min ago", "2 h ago"… in the player's language.
 * @param date ISO date.
 */
function timeAgo(date: string): string {
    const seconds = (new Date(date).getTime() - Date.now()) / 1000;
    const format = new Intl.RelativeTimeFormat(getLanguage(), { numeric: "auto" });
    const scales: [Intl.RelativeTimeFormatUnit, number][] = [
        ["day", 86400],
        ["hour", 3600],
        ["minute", 60],
    ];
    for (const [unit, size] of scales) {
        if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
    }
    return format.format(0, "minute");
}

/**
 * Creates the row of a challenge.
 * @param item Challenge.
 * @param order Order in the list.
 */
function createChallengeRow(item: Challenge, order: number): HTMLLIElement {
    const language = getLanguage();
    const name = displayName(item.rival);
    const number = (value: number | null) => (value === null ? "?" : formatPoints(value, language));
    const row = createElement("li", "challenge-row");
    row.style.setProperty("--order", String(order));
    const texts = createElement("span", "row-texts");
    row.append(createAvatar(item.rival), texts);

    if (isMyTurn(item)) {
        row.classList.add("challenge-row--my-turn");
        texts.append(createElement("span", "row-name", `${name} ${t("challengesYou")}`), createElement("span", "row-detail", `${item.total} ${t("questionsLower")} · ${timeAgo(item.created)}`));
        const play = createButton("button button-small button-pink", `⚔️ ${t("play")}`);
        play.addEventListener("click", async () => {
            play.disabled = true;
            try {
                await playChallenge(item);
            } catch (error) {
                elements.versusMessage.textContent = accountErrorMessage(error);
                void loadChallenges().catch(() => {});
            } finally {
                play.disabled = false;
            }
        });
        const decline = createButton("icon-button icon-button--small remove-button", "✕", `${t("decline")}: ${name}`);
        decline.addEventListener("click", async () => {
            const accepted = await confirmDialog({ title: t("declineChallenge"), message: `${t("declineConfirm")} ${name}?`, accept: t("decline"), danger: true });
            if (accepted) await declineChallenge(item).catch((error) => (elements.versusMessage.textContent = accountErrorMessage(error)));
        });
        row.append(play, decline);
    } else if (item.state === "pendiente") {
        texts.append(createElement("span", "row-name", `${t("waitingFor")} ${name}`), createElement("span", "row-detail", `${t("yourPoints")}: ${number(item.myPoints)} · ${timeAgo(item.created)}`));
        const withdraw = createButton("icon-button icon-button--small remove-button", "✕", `${t("withdrawChallenge")}: ${name}`);
        withdraw.addEventListener("click", () => void declineChallenge(item).catch(() => {}));
        row.append(withdraw);
    } else {
        const declined = item.state === "rechazado";
        const won = !declined && (item.myPoints ?? 0) > (item.theirPoints ?? 0);
        const tied = !declined && item.myPoints === item.theirPoints;
        const result = declined ? "declined" : won ? "win" : tied ? "draw" : "loss";
        row.dataset.result = result;
        texts.append(
            createElement("span", "row-name", name),
            createElement("span", "row-detail", declined ? t("challengeDeclined") : `${number(item.myPoints)} – ${number(item.theirPoints)} · ${timeAgo(item.created)}`),
        );
        const change = item.myChange === null || declined ? "" : ` ${item.myChange >= 0 ? "+" : ""}${item.myChange}`;
        row.append(createElement("span", "result-stamp", `${t(result)}${change}`));
        // Rematch: challenge again someone you already know.
        if (!declined && friends.some((friend) => friend.id === item.rival.id)) {
            const rematch = createButton("icon-button icon-button--small", "⚔️", `${t("rematch")}: ${name}`);
            rematch.title = t("rematch");
            rematch.addEventListener("click", () => void challenge(item.rival));
            row.append(rematch);
        }
    }
    return row;
}

/** Paints the three challenge groups (my turn, waiting and history). */
function paintChallenges(): void {
    const all = getChallenges();
    const groups: [HTMLElement, HTMLElement, Challenge[]][] = [
        [elements.groupMyTurn, elements.listMyTurn, all.filter(isMyTurn)],
        [elements.groupWaiting, elements.listWaiting, all.filter((item) => item.state === "pendiente" && item.iChallenged)],
        [elements.groupHistory, elements.listHistory, all.filter((item) => item.state !== "pendiente").slice(0, 10)],
    ];
    for (const [group, list, items] of groups) {
        group.hidden = items.length === 0;
        list.replaceChildren(...items.map((item, order) => createChallengeRow(item, order)));
        restartAnimation(list);
    }
    elements.versusEmpty.hidden = all.length > 0;
}

/* ---------- Screen ---------- */

/** Fills the profile screen (called when entering it). */
export async function loadProfileScreen(): Promise<void> {
    elements.friendMessage.textContent = "";
    elements.inviteMessage.textContent = "";
    elements.versusMessage.textContent = "";
    paintHeader();
    paintChallenges();
    await Promise.all([loadFriends(), loadChallenges().catch((error) => (elements.versusMessage.textContent = accountErrorMessage(error)))]);
}

/** If the page was opened with ?amigo=code (or username), returns it and removes it from the URL. */
function readInviteFromUrl(): string | null {
    const params = new URLSearchParams(location.search);
    const friend = (params.get(INVITE_PARAMETER) ?? "").trim();
    if (params.has(INVITE_PARAMETER)) {
        params.delete(INVITE_PARAMETER);
        const query = params.toString();
        history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`);
    }
    return FRIEND_FORMAT.test(friend) ? friend : null;
}

/**
 * Connects the profile screen.
 * @param showProfile Shows the profile screen.
 * @param showHome Goes back home (when logging out from the profile).
 */
export function initProfile(showProfile: () => void, showHome: () => void): void {
    if (!isOnline()) return;
    getElement("hero-edit").addEventListener("click", openEditProfile);
    getElement("share-button").addEventListener("click", () => void shareInvite());
    elements.friendForm.addEventListener("submit", (event) => {
        event.preventDefault();
        void addFriend(elements.friendInput.value);
    });
    document.addEventListener(CHALLENGES_CHANGED, () => {
        if (!elements.screen.hidden) paintChallenges();
    });
    document.addEventListener(SESSION_CHANGED, () => {
        if (elements.screen.hidden) return;
        if (getProfile()) paintHeader();
        else showHome();
    });
    document.addEventListener(LANGUAGE_CHANGED, () => {
        if (elements.screen.hidden) return;
        paintHeader();
        paintChallenges();
        void loadFriends();
    });

    const invite = readInviteFromUrl();
    if (invite) {
        const accept = () => {
            showProfile();
            elements.friendInput.value = invite;
            void addFriend(invite);
        };
        if (getProfile()) accept();
        else openLogin("signup", accept);
    }
}
