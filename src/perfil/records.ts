/**
 * records.ts
 * Récords de cada modo. Con sesión iniciada son los del servidor; como
 * invitado se guardan en este navegador.
 */

import type { IdModo } from "../config/modos";
import { obtenerPerfil, obtenerRecordOnline } from "../cuenta/sesion";
import { guardarDato, leerDatoGuardado } from "../utilidades/almacenamiento";

const CLAVE_RECORDS = "records";

/** Récord y partidas jugadas de un modo. */
export interface RecordModo {
    mejor: number;
    partidas: number;
}

type TablaRecords = Partial<Record<IdModo, RecordModo>>;

/** Devuelve el récord de un modo (0 si nunca se ha jugado). */
export function leerRecord(modo: IdModo): RecordModo {
    if (obtenerPerfil()) {
        return obtenerRecordOnline(modo);
    }
    return leerDatoGuardado<TablaRecords>(CLAVE_RECORDS, {})[modo] ?? { mejor: 0, partidas: 0 };
}

/**
 * Apunta una partida de invitado en el navegador.
 * @param modo Modo jugado.
 * @param puntos Puntos conseguidos.
 * @returns El récord anterior y si esta partida lo ha batido.
 */
export function registrarPartidaLocal(modo: IdModo, puntos: number): { anterior: number; nuevoRecord: boolean } {
    const tabla = leerDatoGuardado<TablaRecords>(CLAVE_RECORDS, {});
    const actual = tabla[modo] ?? { mejor: 0, partidas: 0 };
    const nuevoRecord = puntos > actual.mejor;
    tabla[modo] = { mejor: Math.max(actual.mejor, puntos), partidas: actual.partidas + 1 };
    guardarDato(CLAVE_RECORDS, tabla);
    return { anterior: actual.mejor, nuevoRecord };
}
