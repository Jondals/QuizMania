/**
 * env.d.ts
 * Constants that scripts/build.mjs replaces at build time (esbuild `define`).
 */

/** Supabase project URL ("" when not configured). */
declare const __SUPABASE_URL__: string;
/** Supabase public (anon / publishable) key ("" when not configured). */
declare const __SUPABASE_ANON_KEY__: string;
/** Game version, taken from package.json. */
declare const __APP_VERSION__: string;
