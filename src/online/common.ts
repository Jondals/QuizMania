/**
 * common.ts
 * What the ranking, the profile and Versus share: the Supabase client,
 * calling database functions (whose errors are turned into AccountError),
 * converting database rows (Spanish column names) into English objects and
 * the small avatars of the lists.
 */

import { paintAvatar } from "../account/account-ui";
import { AccountError } from "../account/session";
import { loadSupabase, SUPABASE_CONFIGURED } from "../account/supabase";

/** A player as the interface uses it. */
export interface Player {
    id: string;
    username: string;
    name: string | null;
    avatarVersion: number | null;
}

/** Player columns as they come from the database. */
export interface PlayerRow {
    id: string;
    usuario: string;
    nombre: string | null;
    avatar_version: number | null;
}

/**
 * Converts a database row into a player.
 * @param row Row with usuario, nombre and avatar_version.
 */
export function toPlayer(row: PlayerRow): Player {
    return { id: row.id, username: row.usuario, name: row.nombre, avatarVersion: row.avatar_version };
}

/** Returns the Supabase client (loading it the first time) or throws. */
async function client() {
    if (!SUPABASE_CONFIGURED) throw new AccountError("no-server");
    return loadSupabase();
}

/**
 * Turns a database function error into an AccountError (the functions
 * raise short codes such as "usuario-no-existe"; a missing function means
 * the database is out of date).
 * @param error Supabase error.
 */
export function databaseError(error: { message?: string; code?: string }): AccountError {
    if (error.code === "PGRST202" || error.code === "42883" || error.code === "42703") return new AccountError("outdated-database");
    const code = (error.message ?? "").trim();
    return new AccountError(/^[a-z-]+$/.test(code) ? code : "offline");
}

/**
 * Calls a database function and returns its result.
 * @param name Function name.
 * @param args Arguments.
 * @throws AccountError with the error code.
 */
export async function callFunction<T>(name: string, args?: Record<string, unknown>): Promise<T> {
    const { data, error } = await (await client()).rpc(name, args);
    if (error) throw databaseError(error);
    return data as T;
}

/**
 * Creates a player's avatar.
 * @param player Player.
 * @param className Extra size class.
 */
export function createAvatar(player: Player, className = ""): HTMLElement {
    const avatar = document.createElement("span");
    avatar.className = `avatar ${className}`.trim();
    avatar.setAttribute("aria-hidden", "true");
    paintAvatar(avatar, player);
    return avatar;
}
