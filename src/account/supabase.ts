/**
 * supabase.ts
 * Supabase client. The URL and public key are inlined at build time
 * (SUPABASE_URL and SUPABASE_ANON_KEY, see scripts/build.mjs). Without them
 * the game works without accounts.
 *
 * The Supabase library is big, so it lives in its own chunk and is only
 * downloaded the first time something needs the server (a saved session, the
 * ranking, logging in…). A guest opening the game never pays for it.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const SUPABASE_URL = __SUPABASE_URL__;

/** Whether the game was built with Supabase (accounts, friends and ranking). */
export const SUPABASE_CONFIGURED = Boolean(__SUPABASE_URL__ && __SUPABASE_ANON_KEY__);

/** Key under which Supabase keeps the session in localStorage (used since the first version: renaming it would log everyone out). */
export const SESSION_STORAGE_KEY = "quizmania.sesion";

/** Storage bucket with the profile photos. */
export const AVATAR_BUCKET = "avatares";

/** The client once created (shared by every caller). */
let clientPromise: Promise<SupabaseClient> | null = null;

/**
 * Loads the Supabase library (first call only) and returns the client.
 * Callers must check SUPABASE_CONFIGURED first.
 */
export function loadSupabase(): Promise<SupabaseClient> {
    clientPromise ??= import("@supabase/supabase-js").then(({ createClient }) =>
        createClient(__SUPABASE_URL__, __SUPABASE_ANON_KEY__, {
            auth: { persistSession: true, autoRefreshToken: true, storageKey: SESSION_STORAGE_KEY },
        }),
    );
    return clientPromise;
}

/** Whether the browser keeps a saved session (without loading Supabase to find out). */
export function hasSavedSession(): boolean {
    try {
        return localStorage.getItem(SESSION_STORAGE_KEY) !== null;
    } catch {
        return false;
    }
}
