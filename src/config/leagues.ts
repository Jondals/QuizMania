/**
 * leagues.ts
 * Versus leagues. There are no seasons and nothing expires: every player has
 * league points (LP) that go up when winning a challenge and down when
 * losing, and the league depends only on those points.
 * The points won or lost are decided by the database (responder_reto in
 * supabase/schema.sql).
 */

import type { Language } from "../i18n/texts";

/** A league: where it starts, its icon and colour. */
export interface League {
    id: string;
    minimum: number;
    icon: string;
    color: string;
    name: Record<Language, string>;
}

/** Leagues from lowest to highest. */
export const LEAGUES: readonly League[] = [
    { id: "bronze", minimum: 0, icon: "🥉", color: "#e2995a", name: { es: "Bronce", en: "Bronze" } },
    { id: "silver", minimum: 150, icon: "🥈", color: "#cfd0de", name: { es: "Plata", en: "Silver" } },
    { id: "gold", minimum: 400, icon: "🥇", color: "#ffd84d", name: { es: "Oro", en: "Gold" } },
    { id: "platinum", minimum: 800, icon: "💠", color: "#22e5ff", name: { es: "Platino", en: "Platinum" } },
    { id: "diamond", minimum: 1300, icon: "💎", color: "#a78bfa", name: { es: "Diamante", en: "Diamond" } },
    { id: "legend", minimum: 2000, icon: "👑", color: "#ff2e7e", name: { es: "Leyenda", en: "Legend" } },
];

/** League points for a win, a draw and a loss (same as the database). */
export const LEAGUE_POINTS = { win: 30, draw: 10, loss: -15 } as const;

/**
 * League for a number of points.
 * @param points League points.
 */
export function leagueFor(points: number): League {
    let current = LEAGUES[0];
    for (const league of LEAGUES) {
        if (points >= league.minimum) current = league;
    }
    return current;
}

/**
 * Progress inside the current league towards the next one.
 * @param points League points.
 * @returns Next league (null at the top), points missing and progress from 0 to 1.
 */
export function leagueProgress(points: number): { next: League | null; missing: number; progress: number } {
    const current = leagueFor(points);
    const next = LEAGUES[LEAGUES.indexOf(current) + 1] ?? null;
    if (!next) return { next: null, missing: 0, progress: 1 };
    return { next, missing: next.minimum - points, progress: (points - current.minimum) / (next.minimum - current.minimum) };
}
