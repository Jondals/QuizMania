/**
 * entorno.d.ts
 * Constantes que scripts/build.mjs sustituye al compilar (con esbuild `define`).
 */

/** URL del proyecto de Supabase ("" si no está configurado). */
declare const __SUPABASE_URL__: string;
/** Clave pública (anon / publishable) de Supabase ("" si no está configurada). */
declare const __SUPABASE_ANON_KEY__: string;
