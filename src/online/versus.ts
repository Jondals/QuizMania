/**
 * versus.ts
 * Versus challenges between friends:
 *   1. You challenge a friend from your profile and play 10 mixed-topic
 *      questions (15 s each).
 *   2. Your questions and points are stored in the database and the
 *      challenge shows up on your friend's profile (and as a header badge).
 *   3. Your friend plays exactly the same questions. Whoever scores more
 *      wins: +30 league points for a win, +10 for a draw and -15 for a loss
 *      (decided by the database, responder_reto function).
 * If the rival leaves half-way, what they had answered counts.
 * The results screen shows both scores side by side.
 */

import { accountErrorMessage, paintAvatar, setPendingChallenges } from "../account/account-ui";
import { displayName, getProfile, SESSION_CHANGED, updateLeague } from "../account/session";
import { leagueFor } from "../config/leagues";
import { VERSUS_MODE } from "../config/modes";
import { TOPICS } from "../config/topics";
import { getLanguage, t } from "../i18n/texts";
import type { GameSummary } from "../game/match";
import { startGame } from "../game/match";
import { formatPoints } from "../game/scoring";
import { packQuestions, unpackQuestions } from "../questions/fixed";
import { getElement } from "../utils/dom";
import type { Player, PlayerRow } from "./common";
import { callFunction } from "./common";

/** Event fired on document when the list of challenges changes. */
export const CHALLENGES_CHANGED = "quizmania:challenges";
/** At most one automatic reload of challenges every so often (ms). */
const RELOAD_PAUSE = 20000;

/** A challenge as the interface uses it. */
export interface Challenge {
    id: number;
    iChallenged: boolean;
    rival: Player;
    rivalLeague: number;
    state: "pendiente" | "terminado" | "rechazado";
    total: number;
    myPoints: number | null;
    /** null while you haven't played a challenge sent to you. */
    theirPoints: number | null;
    myChange: number | null;
    created: string;
}

/** A challenge as the mis_retos function returns it. */
interface ChallengeRow {
    id: number;
    soy_retador: boolean;
    rival_id: string;
    rival_usuario: string;
    rival_nombre: string | null;
    rival_avatar: number | null;
    rival_liga: number;
    estado: Challenge["state"];
    total: number;
    mis_puntos: number | null;
    sus_puntos: number | null;
    mi_cambio: number | null;
    creado: string;
}

/** Result returned by responder_reto. */
interface ChallengeResult {
    resultado: "victoria" | "empate" | "derrota";
    mis_puntos: number;
    sus_puntos: number;
    cambio: number;
    puntos_liga: number;
    victorias: number;
    empates: number;
    derrotas: number;
}

const elements = {
    block: getElement("versus-block"),
    headline: getElement("versus-headline"),
    status: getElement("versus-status"),
    myAvatar: getElement("versus-avatar-me"),
    myName: getElement("versus-name-me"),
    myPoints: getElement("versus-points-me"),
    rivalAvatar: getElement("versus-avatar-rival"),
    rivalName: getElement("versus-name-rival"),
    rivalPoints: getElement("versus-points-rival"),
};

let challenges: Challenge[] = [];
let lastReload = 0;
let lastPlayer: string | null = null;

/**
 * Converts a database row into a challenge.
 * @param row mis_retos row.
 */
function toChallenge(row: ChallengeRow): Challenge {
    const rivalRow: PlayerRow = { id: row.rival_id, usuario: row.rival_usuario, nombre: row.rival_nombre, avatar_version: row.rival_avatar };
    return {
        id: Number(row.id),
        iChallenged: row.soy_retador,
        rival: { id: rivalRow.id, username: rivalRow.usuario, name: rivalRow.nombre, avatarVersion: rivalRow.avatar_version },
        rivalLeague: Number(row.rival_liga ?? 0),
        state: row.estado,
        total: row.total,
        myPoints: row.mis_puntos,
        theirPoints: row.sus_puntos,
        myChange: row.mi_cambio,
        created: row.creado,
    };
}

/** Loaded challenges (pending first). */
export function getChallenges(): readonly Challenge[] {
    return challenges;
}

/**
 * Whether a challenge was sent to you and you haven't played it yet.
 * @param challenge Challenge.
 */
export function isMyTurn(challenge: Challenge): boolean {
    return challenge.state === "pendiente" && !challenge.iChallenged;
}

/** Downloads your challenges, updates the header badge and repaints the profile. */
export async function loadChallenges(): Promise<readonly Challenge[]> {
    if (!getProfile()) {
        challenges = [];
    } else {
        lastReload = Date.now();
        challenges = (await callFunction<ChallengeRow[]>("mis_retos")).map(toChallenge);
    }
    setPendingChallenges(challenges.filter(isMyTurn).length);
    document.dispatchEvent(new CustomEvent(CHALLENGES_CHANGED));
    return challenges;
}

/** Reloads the challenges if it's been a while (silent errors). */
function reloadIfDue(): void {
    if (getProfile() && Date.now() - lastReload > RELOAD_PAUSE) void loadChallenges().catch(() => {});
}

/**
 * Declines a challenge sent to you or withdraws one of yours.
 * @param challenge Challenge.
 */
export async function declineChallenge(challenge: Challenge): Promise<void> {
    await callFunction("rechazar_reto", { p_reto: challenge.id });
    await loadChallenges();
}

/* ---------- Results-screen scoreboard ---------- */

/**
 * Prepares the Versus scoreboard: you on the left, your rival on the right.
 * @param rival Rival.
 * @param myPoints Your points.
 * @param theirPoints Their points (null = not played yet).
 */
function prepareScoreboard(rival: Player, myPoints: number, theirPoints: number | null): void {
    const profile = getProfile();
    const language = getLanguage();
    paintAvatar(elements.myAvatar, profile);
    elements.myName.textContent = profile ? displayName(profile) : "";
    elements.myPoints.textContent = formatPoints(myPoints, language);
    paintAvatar(elements.rivalAvatar, rival);
    elements.rivalName.textContent = displayName(rival);
    elements.rivalPoints.textContent = theirPoints === null ? "?" : formatPoints(theirPoints, language);
    elements.block.dataset.result = "";
    elements.block.hidden = false;
}

/**
 * Writes the headline and status line of the scoreboard.
 * @param headline Headline.
 * @param status Line below.
 * @param result "victoria", "empate", "derrota" or "" (for the colour).
 */
function writeScoreboard(headline: string, status: string, result = ""): void {
    elements.headline.textContent = headline;
    elements.status.textContent = status;
    elements.block.dataset.result = result;
}

/* ---------- Challenging ---------- */

/**
 * Stores the challenge just played so your friend can play it.
 * @param rival Challenged friend.
 * @param summary What was played.
 */
async function sendChallenge(rival: Player, summary: GameSummary): Promise<void> {
    prepareScoreboard(rival, summary.points, null);
    if (summary.total === 0) {
        writeScoreboard(t("challengeNoQuestions"), "");
        return;
    }
    writeScoreboard(`⚔️ ${t("sendingChallenge")}`, "");
    try {
        await callFunction("crear_reto", {
            p_rival: rival.id,
            p_tema: TOPICS[0].id,
            p_preguntas: packQuestions(summary.questions),
            p_puntos: summary.points,
            p_aciertos: summary.hits,
        });
        writeScoreboard(`⚔️ ${t("challengeSent")}`, `${t("challengeSentDetail")} ${displayName(rival)}.`);
        void loadChallenges().catch(() => {});
    } catch (error) {
        writeScoreboard(t("challengeNotSent"), accountErrorMessage(error));
    }
}

/**
 * Challenges a friend: a Versus game starts right away and, at the end, the
 * challenge is sent.
 * @param friend Challenged friend.
 */
export async function challengeFriend(friend: Player): Promise<void> {
    await startGame(VERSUS_MODE, TOPICS[0], { onEnd: (summary) => void sendChallenge(friend, summary) });
}

/* ---------- Answering ---------- */

/**
 * Stores your points in a challenge and shows who won.
 * @param challenge Challenge played.
 * @param summary What was played.
 * @param silently true when abandoned (there's no results screen).
 */
async function answerChallenge(challenge: Challenge, summary: GameSummary, silently = false): Promise<void> {
    if (!silently) {
        prepareScoreboard(challenge.rival, summary.points, null);
        writeScoreboard(`⚔️ ${t("saving")}`, "");
    }
    try {
        const result = await callFunction<ChallengeResult>("responder_reto", { p_reto: challenge.id, p_puntos: summary.points, p_aciertos: summary.hits });
        updateLeague({ leaguePoints: result.puntos_liga, wins: result.victorias, draws: result.empates, losses: result.derrotas });
        void loadChallenges().catch(() => {});
        if (silently) return;
        const language = getLanguage();
        const league = leagueFor(result.puntos_liga);
        const headlines = { victoria: "resultWin", empate: "resultDraw", derrota: "resultLoss" } as const;
        const change = `${result.cambio >= 0 ? "+" : ""}${result.cambio} ${t("lp")}`;
        prepareScoreboard(challenge.rival, result.mis_puntos, result.sus_puntos);
        writeScoreboard(
            t(headlines[result.resultado]),
            `${change} · ${league.icon} ${league.name[language]} (${formatPoints(result.puntos_liga, language)} ${t("lp")})`,
            result.resultado,
        );
    } catch (error) {
        if (!silently) writeScoreboard(t("challengeNotSent"), accountErrorMessage(error));
    }
}

/**
 * Plays a challenge sent to you, with the same questions as your friend.
 * @param challenge Pending challenge.
 * @throws AccountError if it can no longer be played.
 */
export async function playChallenge(challenge: Challenge): Promise<void> {
    const questions = unpackQuestions(await callFunction<unknown>("preguntas_reto", { p_reto: challenge.id }));
    if (questions.length === 0) throw new Error("Challenge without questions");
    await startGame(VERSUS_MODE, TOPICS[0], {
        questions,
        onEnd: (summary) => void answerChallenge(challenge, summary),
        onAbandon: (summary) => void answerChallenge(challenge, summary, true),
    });
}

/** Keeps challenges up to date: when logging in with another account and when coming back to the tab. */
export function initVersus(): void {
    document.addEventListener(SESSION_CHANGED, () => {
        const id = getProfile()?.id ?? null;
        if (id === lastPlayer) return;
        lastPlayer = id;
        void loadChallenges().catch(() => {});
    });
    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reloadIfDue();
    });
    window.addEventListener("focus", reloadIfDue);
}
