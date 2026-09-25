/**
 * supabase.ts
 * Cliente de Supabase. La URL y la clave pública se ponen al compilar
 * (variables SUPABASE_URL y SUPABASE_ANON_KEY, ver scripts/build.mjs).
 * Si faltan, `supabase` es null y el juego funciona sin cuentas.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@supabase/supabase-js";

export const URL_SUPABASE = __SUPABASE_URL__;

/** Cliente de Supabase, o null si el juego se compiló sin configurarlo. */
export const supabase: SupabaseClient | null =
    __SUPABASE_URL__ && __SUPABASE_ANON_KEY__
        ? createClient(__SUPABASE_URL__, __SUPABASE_ANON_KEY__, {
              auth: { persistSession: true, autoRefreshToken: true, storageKey: "quizmania.sesion" },
          })
        : null;

/** Bucket de storage con las fotos de perfil. */
export const BUCKET_AVATARES = "avatares";
