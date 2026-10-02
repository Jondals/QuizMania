/**
 * match.ts
 * Everything that happens after the slot machine stops: loading questions,
 * showing them, keeping time, lives and points (with the reel multiplier),
 * showing where each question comes from, the results screen and the answer
 * review at the end.
 *
 * A game ends when:
 *   - every question has been answered (Classic, Blitz, 50/50, Marathon,
 *     Climb, Versus),
 *   - the lives run out (Survival, Bomb, Double or nothing, Sudden death,
 *     Marathon),
 *   - the total time runs out (Time attack),
 *   - or the player presses "End game" ("Cash out" in Double or nothing).
 *
 * Versus games use fixed questions and, instead of being saved as a normal
 * game, hand their summary over to online/versus.ts.
 */

import { playEffect } from "../audio/effects";
import { accountErrorMessage } from "../account/account-ui";
import { getProfile, isOnline, saveGameOnline } from "../account/session";
import type { Mode } from "../config/modes";
import { climbFactor, secondsForQuestion } from "../config/modes";
import type { Topic } from "../config/topics";
import type { Language, TextKey } from "../i18n/texts";
import { getLanguage, t } from "../i18n/texts";
import { showFriendsComparison } from "../online/ranking";
import type { QuestionSupply } from "../questions/feed";
import { adaptQuestionsToLanguage, QuestionFeed } from "../questions/feed";
import { FixedQuestionFeed } from "../questions/fixed";
import type { Question, QuestionSource } from "../questions/model";
import { getElement, prefersReducedMotion } from "../utils/dom";
import { shuffle, wait } from "../utils/random";
import { readRecord, saveLocalGame } from "./records";
import { showScreen } from "./screens";
import { formatPoints, hitPoints } from "./scoring";
import type { QuestionRecord } from "./state";
import { currentRecord, gameState, startGameState } from "./state";

/** Time the right/wrong colours stay before the next question (ms). */
const PAUSE_AFTER_ANSWER = 1300;
/** Shorter pause in Time attack so the rhythm isn't lost (ms). */
const QUICK_PAUSE_AFTER_ANSWER = 650;
/** Clock refresh interval (ms). */
const CLOCK_INTERVAL = 100;
/** Last seconds in which a tick sounds every second. */
const WARNING_SECONDS = 3;
/** Share of correct answers from which a game counts as won. */
const WIN_RATIO = 0.6;
/** Duration of the final points count-up (ms). */
const COUNT_UP_DURATION = 900;
/** Letters in front of each answer. */
const ANSWER_LETTERS = ["A", "B", "C", "D", "E", "F"];
/** Text of each question source badge. */
const SOURCE_KEYS: Record<QuestionSource, TextKey> = { opentdb: "sourceOpenTdb", "trivia-api": "sourceTriviaApi", local: "sourceLocal" };

const elements = {
    loadingMessage: getElement("loading-message"),
    loadingError: getElement("loading-error"),
    loadingIndicator: getElement("loading-indicator"),
    card: getElement("question-card"),
    topicBadge: getElement("topic-badge"),
    modeBadge: getElement("mode-badge"),
    multiplierBadge: getElement("multiplier-badge"),
    counter: getElement("question-counter"),
    scoreboard: getElement("scoreboard"),
    scorePoints: getElement("score-points"),
    pointsGained: getElement("points-gained"),
    scoreStreak: getElement("score-streak"),
    scoreLives: getElement("score-lives"),
    scoreTime: getElement("score-time"),
    progressBar: getElement("progress-bar"),
    progressFill: getElement("progress-fill"),
    timeBar: getElement("time-bar"),
    timeFill: getElement("time-fill"),
    questionNumber: getElement("question-number"),
    questionText: getElement("question-text"),
    questionHeading: getElement("question-heading"),
    answerList: getElement("answer-list"),
    sourceBadge: getElement("source-badge"),
    offlineNotice: getElement("offline-notice"),
    gameControls: getElement("game-controls"),
    reviewControls: getElement("review-controls"),
    reviewPrevious: getElement("review-previous", HTMLButtonElement),
    reviewNext: getElement("review-next", HTMLButtonElement),
    endGameButton: getElement("end-game-button", HTMLButtonElement),
    resultsMode: getElement("results-mode"),
    resultsTopic: getElement("results-topic"),
    resultsMultiplier: getElement("results-multiplier"),
    resultMessage: getElement("result-message"),
    finalPoints: getElement("final-points"),
    recordNotice: getElement("record-notice"),
    savedNotice: getElement("saved-notice"),
    guestNotice: getElement("guest-notice"),
    resultsCorrect: getElement("results-correct"),
    resultsAccuracy: getElement("results-accuracy"),
    resultsStreak: getElement("results-streak"),
    resultsBest: getElement("results-best"),
    reviewButton: getElement("review-button", HTMLButtonElement),
    friendsBlock: getElement("friends-block"),
    versusBlock: getElement("versus-block"),
};

/** What is known about a game when it ends (or is abandoned). */
export interface GameSummary {
    points: number;
    hits: number;
    /** Answered questions. */
    total: number;
    /** The answered questions, in order. */
    questions: Question[];
}

/** Options of a special game. */
export interface GameOptions {
    /** Slot machine multiplier (×1 by default). */
    multiplier?: number;
    /** Fixed questions, in order (otherwise they come from the APIs). */
    questions?: readonly Question[];
    /** When given, the game isn't saved as normal: the summary is handed over. */
    onEnd?: (summary: GameSummary) => void;
    /** Called if the player abandons the game half-way. */
    onAbandon?: (summary: GameSummary) => void;
}

/** Changes on every game: waits of a previous game are discarded. */
let generation = 0;
let supply: QuestionSupply | null = null;
let options: GameOptions = {};
let clock: ReturnType<typeof setInterval> | null = null;
let lastTick = 0;
/** true while a question is on screen waiting for an answer. */
let waitingForAnswer = false;
/** true while the question on screen is being translated (the clock stops). */
let translating = false;
/** Whether the last game beat the record (to repaint the results). */
let lastNewRecord = false;
/** Whether the last game counts as won (record or at least 60 % right). */
let lastWin = false;

/** Whether a game is in progress (to warn before leaving it). */
export function isGameInProgress(): boolean {
    return gameState.playing;
}

/**
 * Loads the first question and starts the game. Meanwhile the loading
 * screen is shown; if everything fails, an error.
 * @param mode Chosen mode.
 * @param topic Topic picked by the slot machine.
 * @param gameOptions Multiplier, fixed questions and what to do at the end (Versus).
 */
export async function startGame(mode: Mode, topic: Topic, gameOptions: GameOptions = {}): Promise<void> {
    const myGeneration = ++generation;
    stopClock();
    elements.loadingMessage.textContent = t("loadingQuestions");
    elements.loadingError.hidden = true;
    elements.loadingIndicator.hidden = false;
    showScreen("loading");

    supply?.stop();
    options = gameOptions;
    supply = gameOptions.questions
        ? new FixedQuestionFeed(gameOptions.questions, getLanguage())
        : new QuestionFeed(topic, getLanguage(), () => {
              elements.loadingMessage.textContent = t("translating");
          });
    try {
        const first = await supply.next();
        if (myGeneration !== generation) return;
        startGameState(mode, topic, gameOptions.multiplier ?? 1);
        showScreen("question");
        presentQuestion(first);
        startClock();
    } catch {
        if (myGeneration !== generation) return;
        elements.loadingIndicator.hidden = true;
        elements.loadingMessage.textContent = "";
        elements.loadingError.hidden = false;
    }
}

/** Summary of what has been played (only answered questions count). */
function summarize(): GameSummary {
    const answered = gameState.history.filter((record) => record.answered);
    return { points: gameState.points, hits: gameState.hits, total: answered.length, questions: answered.map((record) => record.question) };
}

/** Abandons the game in progress without saving (a Versus hands over what was played). */
export function abandonGame(): void {
    if (gameState.playing) options.onAbandon?.(summarize());
    options = {};
    generation++;
    stopClock();
    waitingForAnswer = false;
    gameState.playing = false;
    supply?.stop();
}

/* ---------- Clock ---------- */

/** Starts the game clock (it only runs while waiting for an answer). */
function startClock(): void {
    stopClock();
    const { secondsPerQuestion, totalSeconds } = gameState.mode;
    if (secondsPerQuestion === null && totalSeconds === null) return;
    lastTick = performance.now();
    clock = setInterval(advanceClock, CLOCK_INTERVAL);
}

/** Stops the game clock. */
function stopClock(): void {
    if (clock !== null) {
        clearInterval(clock);
        clock = null;
    }
}

/** Seconds left and maximum of the visible clock (per question or total), or null. */
function visibleClock(): { left: number; max: number } | null {
    const { mode, questionSeconds, questionSecondsMax, totalSeconds } = gameState;
    if (mode.totalSeconds !== null) return { left: totalSeconds, max: mode.totalSeconds };
    if (mode.secondsPerQuestion !== null) return { left: questionSeconds, max: questionSecondsMax };
    return null;
}

/** Subtracts the elapsed time, warns in the last seconds and stops when time is up. */
function advanceClock(): void {
    const now = performance.now();
    const elapsed = (now - lastTick) / 1000;
    lastTick = now;
    if (!waitingForAnswer || translating) return;
    const before = visibleClock()?.left ?? 0;
    if (gameState.mode.secondsPerQuestion !== null) gameState.questionSeconds -= elapsed;
    if (gameState.mode.totalSeconds !== null) gameState.totalSeconds -= elapsed;
    const after = visibleClock()?.left ?? 0;

    if (Math.ceil(after) < Math.ceil(before) && Math.ceil(after) <= WARNING_SECONDS && after > 0) playEffect("tick");
    paintClock();

    if (gameState.mode.totalSeconds !== null && gameState.totalSeconds <= 0) {
        // Game over (the half-answered question doesn't count).
        waitingForAnswer = false;
        playEffect("wrong");
        endGame();
    } else if (gameState.mode.secondsPerQuestion !== null && gameState.questionSeconds <= 0) {
        void answerQuestion(null);
    }
}

/* ---------- Questions ---------- */

/**
 * Keeps only some of a question's answers (50/50): the right one plus
 * random wrong ones, in their original order. The untranslated original is
 * trimmed the same way, because translations map answers by position.
 * @param question Question with every answer.
 * @param count Answers to keep; null keeps them all.
 */
function trimAnswers(question: Question, count: number | null): Question {
    if (count === null || question.answers.length <= count) return question;
    const right = question.answers.findIndex((answer) => answer.correct);
    const wrong = shuffle(question.answers.map((_, index) => index).filter((index) => index !== right)).slice(0, count - 1);
    const kept = new Set([right, ...wrong]);
    const pick = <T>(list: readonly T[]) => list.filter((_, index) => kept.has(index));
    return {
        ...question,
        answers: pick(question.answers),
        original: question.original && { ...question.original, answers: pick(question.original.answers) },
    };
}

/**
 * Adds a question to the history and shows it.
 * @param question New question.
 */
function presentQuestion(question: Question): void {
    question = trimAnswers(question, gameState.mode.answersShown);
    gameState.history.push({ question, chosen: null, answered: false, correct: false, points: 0 });
    // In Bomb each question's clock gets shorter the more hits you have.
    gameState.questionSecondsMax = secondsForQuestion(gameState.mode, gameState.hits) ?? 0;
    gameState.questionSeconds = gameState.questionSecondsMax;
    elements.card.classList.remove("is-loading");
    showCurrentQuestion();
    waitingForAnswer = true;
    lastTick = performance.now();
}

/**
 * Paints the badge saying where the question comes from (and whether it was translated).
 * @param question Question on screen.
 */
function paintSource(question: Question): void {
    const translated = question.original !== undefined && question.original.language !== question.language;
    elements.sourceBadge.dataset.source = question.source;
    elements.sourceBadge.textContent = `${t(SOURCE_KEYS[question.source])}${translated ? ` · ${t("translated")}` : ""}`;
    elements.sourceBadge.title = t("questionSource");
}

/**
 * Paints the current question (or the one being reviewed): header,
 * scoreboard, clock, text and buttons. If already answered, it stays marked.
 */
export function showCurrentQuestion(): void {
    const { topic, mode, multiplier, history, reviewing, reviewIndex } = gameState;
    const index = reviewing ? reviewIndex : history.length - 1;
    const record = history[index];
    if (!record) return;
    const number = index + 1;
    const language = getLanguage();

    if (topic) elements.topicBadge.textContent = `${topic.icon} ${topic.name[language]}`;
    elements.modeBadge.textContent = `${mode.icon} ${mode.name[language]}`;
    elements.multiplierBadge.textContent = `×${multiplier}`;
    elements.multiplierBadge.hidden = multiplier <= 1;
    const total = reviewing ? history.length : mode.totalQuestions;
    elements.counter.textContent = total ? `${t("question")} ${number} ${t("of")} ${total}` : `${t("question")} ${number}`;

    elements.progressBar.hidden = !total;
    if (total) elements.progressFill.style.width = `${(number / total) * 100}%`;
    elements.questionNumber.textContent = `#${String(number).padStart(2, "0")}`;
    elements.questionText.textContent = record.question.text;
    paintSource(record.question);
    elements.offlineNotice.hidden = record.question.source !== "local" || reviewing || (topic?.sources.length ?? 0) === 0;

    elements.answerList.replaceChildren(
        ...record.question.answers.map((answer, position) => createAnswerButton(answer.text, position, record.answered || reviewing)),
    );
    if (record.answered) markAnswers(record);

    // In Double or nothing, ending is cashing out with what you have.
    elements.endGameButton.textContent = t(mode.loseAllOnMiss ? "cashOut" : "endGame");
    elements.scoreboard.hidden = reviewing;
    elements.gameControls.hidden = reviewing;
    elements.reviewControls.hidden = !reviewing;
    if (reviewing) {
        elements.timeBar.hidden = true;
        elements.reviewPrevious.disabled = reviewIndex === 0;
        elements.reviewNext.disabled = reviewIndex === history.length - 1;
    } else {
        paintScoreboard();
        paintClock();
    }
}

/**
 * Creates an answer button.
 * @param text Answer text.
 * @param position Answer position.
 * @param disabled Whether it can't be pressed (already answered or reviewing).
 */
function createAnswerButton(text: string, position: number, disabled: boolean): HTMLButtonElement {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "answer-button";
    // Answers have their own sound (right/wrong), not the general click.
    button.dataset.noClick = "";
    const letter = document.createElement("span");
    letter.className = "answer-letter";
    letter.setAttribute("aria-hidden", "true");
    letter.textContent = ANSWER_LETTERS[position] ?? "";
    const content = document.createElement("span");
    content.textContent = text;
    button.append(letter, content);
    button.disabled = disabled;
    button.addEventListener("click", () => void answerQuestion(position));
    return button;
}

/** The answer buttons on screen. */
function answerButtons(): HTMLButtonElement[] {
    return [...elements.answerList.querySelectorAll<HTMLButtonElement>(".answer-button")];
}

/**
 * Paints the right answer green and, if the chosen one is another, red.
 * @param record Answered question.
 */
function markAnswers(record: QuestionRecord): void {
    answerButtons().forEach((button, position) => {
        const correct = record.question.answers[position].correct;
        button.classList.toggle("is-correct", correct);
        button.classList.toggle("is-wrong", position === record.chosen && !correct);
        button.classList.toggle("is-chosen", position === record.chosen);
    });
}

/** Paints points, streak and lives. */
function paintScoreboard(): void {
    const { points, streak, lives, mode } = gameState;
    elements.scorePoints.textContent = formatPoints(points, getLanguage());
    elements.scoreStreak.hidden = streak < 2;
    // Climb shows how much the next hit is worth on top of the streak.
    const climb = climbFactor(mode, streak + 1);
    elements.scoreStreak.textContent = climb > 1 ? `🔥 ${streak} · ×${climb.toFixed(2).replace(/\.?0+$/, "")}` : `🔥 ${streak}`;
    elements.scoreStreak.title = t("streak");
    elements.scoreLives.hidden = mode.lives === null;
    if (mode.lives !== null && lives !== null) {
        elements.scoreLives.textContent = "❤️".repeat(Math.max(lives, 0)) + "🖤".repeat(mode.lives - Math.max(lives, 0));
        elements.scoreLives.setAttribute("aria-label", `${t("lives")}: ${lives}`);
    }
}

/** Paints the clock (number and bar) when the mode has one. */
function paintClock(): void {
    const visible = visibleClock();
    elements.scoreTime.hidden = visible === null;
    elements.timeBar.hidden = visible === null;
    if (!visible) return;
    const left = Math.max(visible.left, 0);
    elements.scoreTime.textContent = `⏱ ${Math.ceil(left)} s`;
    elements.timeFill.style.width = `${Math.min(left / visible.max, 1) * 100}%`;
    const urgent = left <= WARNING_SECONDS;
    elements.scoreTime.classList.toggle("is-urgent", urgent);
    elements.timeBar.classList.toggle("is-urgent", urgent);
}

/**
 * Shows a floating text next to the points ("+140", "-3 s"…).
 * @param text Text to show.
 * @param negative Whether it's a penalty (painted red).
 */
function showFloatingNotice(text: string, negative = false): void {
    const notice = elements.pointsGained;
    notice.textContent = text;
    notice.classList.toggle("is-negative", negative);
    notice.classList.remove("is-visible");
    void notice.offsetWidth; // Restarts the animation.
    notice.classList.add("is-visible");
}

/** Whether the game must end after the last answer. */
function shouldEnd(): boolean {
    const { mode, lives, history, totalSeconds } = gameState;
    return (lives !== null && lives <= 0) || (mode.totalQuestions !== null && history.length >= mode.totalQuestions) || (mode.totalSeconds !== null && totalSeconds <= 0);
}

/**
 * Stores the answer (or that time ran out), adds points or takes a life,
 * paints it green or red and, after a pause, moves on to the next question
 * or to the results.
 * @param position Position of the pressed answer, or null if time ran out.
 */
async function answerQuestion(position: number | null): Promise<void> {
    const record = currentRecord();
    if (!waitingForAnswer || !record || record.answered) return;
    waitingForAnswer = false;
    const myGeneration = generation;
    const { mode } = gameState;

    record.answered = true;
    record.chosen = position;
    record.correct = position !== null && record.question.answers[position].correct;

    if (record.correct) {
        gameState.streak++;
        gameState.bestStreak = Math.max(gameState.bestStreak, gameState.streak);
        gameState.hits++;
        record.points = hitPoints({
            streak: gameState.streak,
            secondsLeft: gameState.questionSeconds,
            secondsPerQuestion: mode.secondsPerQuestion === null ? null : gameState.questionSecondsMax,
            multiplier: mode.multiplier * gameState.multiplier * climbFactor(mode, gameState.streak),
        });
        gameState.points += record.points;
        if (mode.totalSeconds !== null && mode.bonusPerHit > 0) {
            // Time attack: a hit gives time (never above the starting time).
            gameState.totalSeconds = Math.min(mode.totalSeconds, gameState.totalSeconds + mode.bonusPerHit);
            showFloatingNotice(`+${record.points} · +${mode.bonusPerHit} s`);
            paintClock();
        } else {
            showFloatingNotice(`+${record.points}`);
        }
    } else {
        gameState.streak = 0;
        if (mode.loseAllOnMiss && gameState.points > 0) {
            // Double or nothing: the miss takes every point.
            showFloatingNotice(`-${formatPoints(gameState.points, getLanguage())}`, true);
            gameState.points = 0;
        }
        if (gameState.lives !== null) {
            gameState.lives--;
            elements.scoreLives.classList.remove("loses-life");
            void elements.scoreLives.offsetWidth;
            elements.scoreLives.classList.add("loses-life");
        }
        if (mode.penaltyPerMiss > 0) {
            gameState.totalSeconds -= mode.penaltyPerMiss;
            showFloatingNotice(`-${mode.penaltyPerMiss} s`, true);
            paintClock();
        }
    }

    answerButtons().forEach((button) => (button.disabled = true));
    markAnswers(record);
    paintScoreboard();
    playEffect(record.correct ? "correct" : "wrong");

    await wait(mode.totalSeconds !== null ? QUICK_PAUSE_AFTER_ANSWER : PAUSE_AFTER_ANSWER);
    if (myGeneration !== generation) return;
    if (shouldEnd()) {
        endGame();
        return;
    }
    elements.card.classList.add("is-loading");
    try {
        const next = await (supply as QuestionSupply).next();
        if (myGeneration !== generation) return;
        presentQuestion(next);
        elements.questionHeading.focus({ preventScroll: true });
    } catch {
        if (myGeneration !== generation) return;
        // No more questions available: finish with what was achieved.
        endGame();
    }
}

/* ---------- Results ---------- */

/** Ends the game: saves the record, compares with friends and shows the results. */
export function endGame(): void {
    if (!gameState.playing) return;
    generation++;
    supply?.stop();
    stopClock();
    waitingForAnswer = false;
    gameState.playing = false;
    gameState.reviewing = false;
    // A question on screen without an answer (when pressing "End") doesn't count.
    gameState.history = gameState.history.filter((record) => record.answered);
    elements.card.classList.remove("is-loading");

    const { mode, points, hits, history, topic } = gameState;
    const total = history.length;
    elements.savedNotice.hidden = true;
    elements.guestNotice.hidden = true;
    elements.friendsBlock.hidden = true;
    elements.versusBlock.hidden = true;
    const { onEnd } = options;
    options = {};

    if (onEnd) {
        // Versus: not a normal game (no record); online/versus.ts saves it.
        lastNewRecord = false;
        onEnd(summarize());
    } else if (getProfile()) {
        // With a session the server decides the record; meanwhile the local one is used.
        lastNewRecord = points > readRecord(mode.id);
        void saveOnline();
    } else {
        lastNewRecord = saveLocalGame(mode.id, points) && points > 0;
        elements.guestNotice.hidden = !isOnline();
    }
    lastWin = lastNewRecord || (total > 0 && hits / total >= WIN_RATIO);
    paintResults();
    showScreen("results");
    countUp(elements.finalPoints, points);
    playEffect(lastWin ? "victory" : "defeat");

    /** Saves the game in Supabase and repaints with the server's answer. */
    async function saveOnline(): Promise<void> {
        elements.savedNotice.hidden = false;
        elements.savedNotice.textContent = t("saving");
        try {
            const result = await saveGameOnline({ mode: mode.id, topic: topic?.id ?? "", points, hits, total });
            lastNewRecord = result.newRecord && points > 0;
            paintResults();
            const language = getLanguage();
            elements.savedNotice.textContent = `+${formatPoints(points, language)} ${t("pointsAdded")} · ${t("total")}: ${formatPoints(result.totalPoints, language)}`;
            void showFriendsComparison(mode.id);
        } catch (error) {
            elements.savedNotice.textContent = accountErrorMessage(error);
        }
    }
}

/**
 * Picks the final message: record, or depending on the share of hits.
 * @param hits Correct answers.
 * @param total Answered questions.
 */
function finalMessage(hits: number, total: number): string {
    if (lastNewRecord) return t("messageRecord");
    const { mode, lives } = gameState;
    if (!lastWin && mode.lives !== null && (lives ?? 1) <= 0) {
        if (mode.id === "bomba") return t("messageBoom");
        if (mode.loseAllOnMiss) return t("messageLostAll");
        return t("messageOutOfLives");
    }
    const ratio = total === 0 ? 0 : hits / total;
    if (ratio === 1) return t("messagePerfect");
    if (ratio >= 0.7) return t("messageGood");
    if (ratio >= 0.4) return t("messageOk");
    return t("messageBad");
}

/**
 * Counts from 0 up to the final figure, slowing down at the end.
 * @param element Where the number is written.
 * @param target Final figure.
 */
function countUp(element: HTMLElement, target: number): void {
    const language = getLanguage();
    if (target <= 0 || prefersReducedMotion()) {
        element.textContent = formatPoints(target, language);
        return;
    }
    const start = performance.now();
    const step = (now: number) => {
        const progress = Math.min((now - start) / COUNT_UP_DURATION, 1);
        element.textContent = formatPoints(Math.round(target * (1 - (1 - progress) ** 3)), language);
        if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
}

/** Paints the results screen (also when the language changes). */
export function paintResults(): void {
    const { mode, topic, multiplier, history, hits, points, bestStreak } = gameState;
    const language = getLanguage();
    const total = history.length;
    elements.resultsMode.textContent = `${mode.icon} ${mode.name[language]}`;
    elements.resultsTopic.textContent = topic ? `${topic.icon} ${topic.name[language]}` : "";
    elements.resultsMultiplier.textContent = `×${multiplier}`;
    elements.resultsMultiplier.hidden = multiplier <= 1;
    elements.resultMessage.textContent = finalMessage(hits, total);
    elements.finalPoints.textContent = formatPoints(points, language);
    elements.recordNotice.hidden = !lastNewRecord;
    elements.resultsCorrect.textContent = `${hits}/${total}`;
    elements.resultsAccuracy.textContent = `${total === 0 ? 0 : Math.round((hits / total) * 100)}%`;
    elements.resultsStreak.textContent = String(bestStreak);
    elements.resultsBest.textContent = mode.id === "versus" ? "–" : formatPoints(readRecord(mode.id), language);
    elements.reviewButton.hidden = total === 0;
}

/** Goes back to the results screen (from the review). */
export function showResults(): void {
    gameState.reviewing = false;
    showScreen("results");
}

/** Starts reviewing from the first question. */
export function startReview(): void {
    if (gameState.history.length === 0) return;
    gameState.reviewing = true;
    gameState.reviewIndex = 0;
    showCurrentQuestion();
    showScreen("question");
}

/**
 * Moves one question forward or back while reviewing.
 * @param direction +1 next, -1 previous.
 */
export function moveReview(direction: 1 | -1): void {
    const index = gameState.reviewIndex + direction;
    if (index >= 0 && index < gameState.history.length) {
        gameState.reviewIndex = index;
        showCurrentQuestion();
    }
}

/**
 * Changes the language of the game in progress: translates the questions
 * already shown (from their original text) and the ones still to come. The
 * clock stops while the question on screen is translated.
 * @param language New language.
 */
export async function changeGameLanguage(language: Language): Promise<void> {
    if (gameState.history.length === 0) return;
    const myGeneration = generation;
    translating = true;
    elements.card.classList.add("is-loading");
    try {
        const translated = await adaptQuestionsToLanguage(
            gameState.history.map((record) => record.question),
            language,
        );
        // If another game started meanwhile, nothing is touched.
        if (myGeneration !== generation && gameState.playing) return;
        gameState.history.forEach((record, position) => {
            if (translated[position]) record.question = translated[position];
        });
    } finally {
        translating = false;
        lastTick = performance.now();
        elements.card.classList.remove("is-loading");
    }
    if (gameState.playing || gameState.reviewing) showCurrentQuestion();
    if (gameState.playing) void supply?.setLanguage(language);
}
