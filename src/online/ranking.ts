/**
 * ranking.ts
 * Ranking screen and the comparison with friends at the end of a game.
 * Everything comes from Supabase (ranking and ranking_liga functions):
 *   - Three tabs: 🏆 Points (earned in every game), ⚔️ League (Versus
 *     league points, with each player's league) and 🎯 Records (best game
 *     in each mode, chosen with chips).
 *   - Global (the best 50; visible without an account) or among friends,
 *     with a switch whose lit piece slides to the chosen side.
 *   - On top your position (unless you're already on the podium), then the
 *     podium with the first three and the list.
 *   - ← and → change tabs.
 */

import { displayName, getProfile, isOnline, SESSION_CHANGED } from "../account/session";
import { accountErrorMessage } from "../account/account-ui";
import { LEAGUES, leagueFor } from "../config/leagues";
import type { ModeId } from "../config/modes";
import { findMode, MODES } from "../config/modes";
import type { TextKey } from "../i18n/texts";
import { getLanguage, LANGUAGE_CHANGED, t } from "../i18n/texts";
import { formatPoints } from "../game/scoring";
import { createElement, getElement, restartAnimation } from "../utils/dom";
import type { Player, PlayerRow } from "./common";
import { callFunction, createAvatar, toPlayer } from "./common";

/** Rows shown in the results-screen comparison. */
const ROWS_IN_RESULTS = 5;

/** Which standings are shown. */
type RankingKind = "total" | "league" | "records";
const KINDS: readonly RankingKind[] = ["total", "league", "records"];

/** Row of the ranking function. */
interface PointsRow extends PlayerRow {
    posicion: number | null;
    puntos: number | null;
    partidas?: number | null;
    aciertos?: number | null;
    preguntas?: number | null;
    soy_yo: boolean;
}

/** Row of the ranking_liga function. */
interface LeagueRow extends PlayerRow {
    posicion: number | null;
    puntos: number | null;
    victorias: number;
    empates: number;
    derrotas: number;
    soy_yo: boolean;
}

/** A row ready to paint. */
interface Row extends Player {
    position: number | null;
    /** Main figure (null = not played). */
    value: number | null;
    /** Small line under the name. */
    detail: string;
    /** League colour (League tab only). */
    color?: string;
    isMe: boolean;
}

const elements = {
    screen: getElement("ranking-screen"),
    tabs: [...document.querySelectorAll<HTMLButtonElement>(".ranking-tab")],
    modeChips: getElement("mode-chips"),
    scopeSwitch: getElement("scope-switch"),
    scopeButtons: [...document.querySelectorAll<HTMLButtonElement>(".scope-button")],
    description: getElement("ranking-description"),
    leagueLegend: getElement("league-legend"),
    myRow: getElement("my-ranking-row"),
    guest: getElement("ranking-guest"),
    podium: getElement("podium"),
    list: getElement("ranking-list"),
    status: getElement("ranking-status"),
    addFriendsButton: getElement("ranking-add-friends", HTMLButtonElement),
    friendsBlock: getElement("friends-block"),
    friendsPosition: getElement("friends-position"),
    friendsList: getElement("friends-result-list"),
    inviteFriends: getElement("invite-friends"),
};

let kind: RankingKind = "total";
let recordMode: ModeId = MODES[0].id;
let scope: "friends" | "global" = "global";
/** Avoids painting an old answer when switching quickly. */
let request = 0;

/* ---------- Data ---------- */

/**
 * Accuracy text ("–" if nothing was answered).
 * @param questions Questions answered.
 * @param hits Correct answers.
 */
function accuracyText(questions: number, hits: number): string {
    return questions > 0 ? `${Math.round((hits / questions) * 100)}%` : "–";
}

/**
 * Detail of a points row: games and accuracy.
 * @param row Database row.
 */
function pointsDetail(row: PointsRow): string {
    // Old versions of the database don't return games: show nothing rather than something wrong.
    if (row.partidas === null || row.partidas === undefined) return "";
    const games = Number(row.partidas);
    if (games === 0) return row.puntos === null ? t("noGames") : "";
    return `${formatPoints(games, getLanguage())} ${t("gamesLower")} · ${accuracyText(Number(row.preguntas ?? 0), Number(row.aciertos ?? 0))} ${t("correctLower")}`;
}

/**
 * Requests points standings (total or a mode's record).
 * @param mode "total" or mode id.
 * @param where "friends" or "global".
 */
async function fetchPoints(mode: ModeId | "total", where: "friends" | "global"): Promise<Row[]> {
    const rows = await callFunction<PointsRow[]>("ranking", { p_modo: mode, p_ambito: where === "friends" ? "amigos" : "global", p_limite: 50 });
    return rows.map((row) => ({
        ...toPlayer(row),
        position: row.posicion === null ? null : Number(row.posicion),
        value: row.puntos === null ? null : Number(row.puntos),
        // Games and accuracy are of every game: they're only shown under Points.
        detail: mode === "total" ? pointsDetail(row) : "",
        isMe: row.soy_yo,
    }));
}

/**
 * Requests the Versus league standings.
 * @param where "friends" or "global".
 */
async function fetchLeague(where: "friends" | "global"): Promise<Row[]> {
    const rows = await callFunction<LeagueRow[]>("ranking_liga", { p_ambito: where === "friends" ? "amigos" : "global", p_limite: 50 });
    const language = getLanguage();
    return rows.map((row) => {
        const points = Number(row.puntos ?? 0);
        const league = leagueFor(points);
        const played = row.victorias + row.empates + row.derrotas;
        return {
            ...toPlayer(row),
            position: row.posicion === null ? null : Number(row.posicion),
            value: played === 0 ? null : points,
            detail: `${league.icon} ${league.name[language]} · ${row.victorias}${t("winShort")} ${row.empates}${t("drawShort")} ${row.derrotas}${t("lossShort")}`,
            color: league.color,
            isMe: row.soy_yo,
        };
    });
}

/* ---------- Painting ---------- */

/** Unit of the main figure. */
function unit(): string {
    return kind === "league" ? t("lp") : t("pts");
}

/**
 * Text of the main figure.
 * @param value Figure, or null if not played.
 */
function valueText(value: number | null): string {
    return value === null ? t("notPlayed") : formatPoints(value, getLanguage());
}

/**
 * Creates a player row: position, avatar, name with its detail and figure.
 * @param row Row data.
 * @param order Order in the list (staggers the entrance).
 * @param withUnit Whether "pts"/"LP" is written next to the figure.
 */
function createRow(row: Row, order = 0, withUnit = true): HTMLLIElement {
    const element = createElement("li", "ranking-row");
    element.classList.toggle("is-me", row.isMe);
    element.style.setProperty("--order", String(order));
    if (row.position !== null && row.position <= 3) element.classList.add(`podium-${row.position}`);

    const texts = createElement("span", "row-texts");
    const name = createElement("span", "row-name", displayName(row));
    if (row.isMe) name.append(createElement("span", "you-tag", t("you")));
    texts.append(name);
    if (row.detail) {
        const detail = createElement("span", "row-detail", row.detail);
        if (row.color) detail.style.setProperty("--league-color", row.color);
        texts.append(detail);
    }
    const value = createElement("span", "row-points", valueText(row.value));
    if (withUnit && row.value !== null) value.append(createElement("small", "row-unit", unit()));
    element.append(createElement("span", "row-position", row.position === null ? "–" : String(row.position)), createAvatar(row), texts, value);
    return element;
}

/**
 * Creates a podium column: crown, avatar, name, figure, detail and step.
 * @param row Player in that place.
 * @param place 1, 2 or 3.
 */
function createPodiumColumn(row: Row, place: number): HTMLElement {
    const column = createElement("div", `podium-column podium-column--${place}`);
    column.classList.toggle("is-me", row.isMe);
    const crown = createElement("span", "podium-crown", place === 1 ? "👑" : "");
    crown.setAttribute("aria-hidden", "true");
    const value = createElement("span", "podium-points", valueText(row.value));
    value.append(createElement("small", "row-unit", unit()));
    const detail = createElement("span", "podium-detail", row.detail);
    if (row.color) detail.style.setProperty("--league-color", row.color);
    column.append(
        crown,
        createAvatar(row, place === 1 ? "avatar--podium-large" : "avatar--podium"),
        createElement("span", "podium-name", displayName(row)),
        value,
        detail,
        createElement("span", "podium-step", String(place)),
    );
    return column;
}

/** Description of the chosen standings (and the league legend in League). */
function paintDescription(): void {
    const language = getLanguage();
    const keys: Record<RankingKind, TextKey> = { total: "describeTotal", league: "describeLeague", records: "describeRecords" };
    const mode = findMode(recordMode);
    elements.description.textContent =
        kind === "records" ? `${t(keys.records)} ${mode.icon} ${mode.name[language]}: ${mode.description[language]}.` : t(keys[kind]);
    elements.leagueLegend.hidden = kind !== "league";
    if (kind === "league") {
        elements.leagueLegend.replaceChildren(
            ...LEAGUES.map((league) => {
                const chip = createElement("li", "league-chip");
                chip.style.setProperty("--league-color", league.color);
                chip.append(createElement("span", "", league.icon), createElement("strong", "", league.name[language]), createElement("small", "", `${league.minimum}+`));
                return chip;
            }),
        );
    }
}

/** Marks the chosen tab, mode chip and scope. */
function paintControls(): void {
    const language = getLanguage();
    elements.tabs.forEach((tab) => {
        const selected = tab.dataset.kind === kind;
        tab.setAttribute("aria-selected", String(selected));
        tab.tabIndex = selected ? 0 : -1;
    });
    elements.modeChips.hidden = kind !== "records";
    elements.modeChips.querySelectorAll<HTMLButtonElement>(".mode-chip").forEach((chip) => {
        const mode = findMode(chip.dataset.mode ?? "");
        chip.setAttribute("aria-pressed", String(mode.id === recordMode));
        chip.lastElementChild!.textContent = mode.name[language];
    });
    elements.scopeButtons.forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.scope === scope)));
    // The lit piece of the switch slides to the chosen side.
    elements.scopeSwitch.dataset.scope = scope;
    paintDescription();
}

/**
 * Empties the podium and the list and shows a message.
 * @param message Message.
 */
function showStatus(message: string): void {
    elements.podium.replaceChildren();
    elements.list.replaceChildren();
    elements.myRow.replaceChildren();
    elements.myRow.hidden = true;
    elements.status.textContent = message;
    elements.status.hidden = false;
}

/** Downloads and paints the chosen standings. */
async function loadRanking(): Promise<void> {
    const myRequest = ++request;
    paintControls();
    const profile = getProfile();
    elements.guest.hidden = profile !== null;
    elements.addFriendsButton.hidden = true;
    elements.status.textContent = t("loading");
    elements.status.hidden = false;

    if (scope === "friends" && !profile) {
        showStatus(t("logInForFriends"));
        return;
    }
    try {
        const rows = kind === "league" ? await fetchLeague(scope) : await fetchPoints(kind === "total" ? "total" : recordMode, scope);
        if (myRequest !== request) return;

        // The first three with points go to the podium, ordered 2 · 1 · 3.
        const podium = rows.filter((row) => row.position !== null && row.position <= 3 && row.value !== null).slice(0, 3);
        const rest = rows.filter((row) => !podium.includes(row));
        const columns = [podium[1], podium[0], podium[2]]
            .map((row, index) => (row ? createPodiumColumn(row, [2, 1, 3][index]) : null))
            .filter((column): column is HTMLElement => column !== null);
        elements.podium.replaceChildren(...columns);
        elements.list.replaceChildren(...rest.map((row, order) => createRow(row, order)));
        restartAnimation(elements.list);

        // Your row, always visible on top (unless you're already on the podium).
        const me = rows.find((row) => row.isMe);
        const showMine = me !== undefined && !podium.includes(me);
        elements.myRow.hidden = !showMine;
        elements.myRow.replaceChildren(...(showMine ? [createElement("span", "my-row-title", t("yourPosition")), createRow(me, 0)] : []));

        const onlyMe = scope === "friends" && rows.length <= 1;
        const nobody = rows.every((row) => row.value === null);
        elements.status.hidden = !onlyMe && !nobody;
        elements.status.textContent = onlyMe ? t("noFriendsRanking") : t(kind === "league" ? "leagueEmpty" : "rankingEmpty");
        elements.addFriendsButton.hidden = !onlyMe;
    } catch (error) {
        if (myRequest !== request) return;
        showStatus(accountErrorMessage(error));
    }
}

/**
 * Switches tab.
 * @param next Chosen tab.
 */
function chooseKind(next: RankingKind): void {
    kind = next;
    void loadRanking();
}

/* ---------- Screen and results ---------- */

/** Fills the ranking screen (called when entering it). */
export async function loadRankingScreen(): Promise<void> {
    if (!getProfile() && scope === "friends") scope = "global";
    await loadRanking();
}

/**
 * After a saved game: shows where you stand among your friends in that mode.
 * @param mode Mode played.
 */
export async function showFriendsComparison(mode: ModeId): Promise<void> {
    elements.friendsBlock.hidden = true;
    if (!getProfile()) return;
    try {
        const rows = await fetchPoints(mode, "friends");
        const hasFriends = rows.length > 1;
        const me = rows.find((row) => row.isMe);
        elements.inviteFriends.hidden = hasFriends;
        elements.friendsList.hidden = !hasFriends;
        elements.friendsPosition.textContent = hasFriends && me?.position ? `${me.position}º / ${rows.length}` : "";
        // The first ones and, if you're not among them, your row too.
        const visible = rows.slice(0, ROWS_IN_RESULTS);
        if (me && !visible.includes(me)) visible[visible.length - 1] = me;
        elements.friendsList.replaceChildren(...visible.map((row, order) => createRow({ ...row, detail: "" }, order, false)));
        elements.friendsBlock.hidden = false;
        restartAnimation(elements.friendsList);
    } catch {
        // Offline: no comparison.
    }
}

/**
 * Connects the ranking screen controls.
 * @param openProfile Goes to your profile (to add friends).
 */
export function initRanking(openProfile: () => void): void {
    if (!isOnline()) return;
    elements.modeChips.replaceChildren(
        ...MODES.map((mode) => {
            const chip = createElement("button", "mode-chip");
            chip.type = "button";
            chip.dataset.mode = mode.id;
            chip.style.setProperty("--mode-color", mode.color);
            chip.append(createElement("span", "", mode.icon), createElement("span", ""));
            chip.addEventListener("click", () => {
                recordMode = mode.id;
                void loadRanking();
            });
            return chip;
        }),
    );
    elements.tabs.forEach((tab) => tab.addEventListener("click", () => chooseKind(tab.dataset.kind as RankingKind)));
    elements.scopeButtons.forEach((button) => {
        button.addEventListener("click", () => {
            scope = button.dataset.scope === "friends" ? "friends" : "global";
            void loadRanking();
        });
    });
    elements.addFriendsButton.addEventListener("click", openProfile);
    getElement("invite-from-results").addEventListener("click", openProfile);

    // On the ranking screen, ← and → switch tabs.
    document.addEventListener("keydown", (event) => {
        if (elements.screen.hidden || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
        const target = event.target as HTMLElement | null;
        if (target?.closest("input, textarea, select") || document.querySelector("dialog[open]")) return;
        event.preventDefault();
        const step = event.key === "ArrowLeft" ? -1 : 1;
        chooseKind(KINDS[(KINDS.indexOf(kind) + step + KINDS.length) % KINDS.length]);
        if (target?.classList.contains("ranking-tab")) elements.tabs.find((tab) => tab.dataset.kind === kind)?.focus();
    });

    document.addEventListener(LANGUAGE_CHANGED, paintControls);
    document.addEventListener(SESSION_CHANGED, () => {
        if (!elements.screen.hidden) void loadRankingScreen();
    });
    paintControls();
}
