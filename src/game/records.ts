/**
 * records.ts
 * Best score of each mode. With a session they come from the server; as a
 * guest they are kept in this browser.
 */

import type { ModeId } from "../config/modes";
import { getOnlineRecord, getProfile } from "../account/session";
import { readSaved, save } from "../utils/storage";

/** Storage key (the same since the first version). */
const RECORDS_KEY = "records";

/** A mode's best score and games played (keys kept from the first version). */
interface StoredRecord {
    mejor: number;
    partidas: number;
}

type RecordTable = Partial<Record<ModeId, StoredRecord>>;

/**
 * Best score of a mode (0 if never played).
 * @param mode Mode id.
 */
export function readRecord(mode: ModeId): number {
    if (getProfile()) return getOnlineRecord(mode).best;
    return readSaved<RecordTable>(RECORDS_KEY, {})[mode]?.mejor ?? 0;
}

/**
 * Stores a guest game in the browser.
 * @param mode Mode played.
 * @param points Points scored.
 * @returns Whether this game beat the record.
 */
export function saveLocalGame(mode: ModeId, points: number): boolean {
    const table = readSaved<RecordTable>(RECORDS_KEY, {});
    const current = table[mode] ?? { mejor: 0, partidas: 0 };
    table[mode] = { mejor: Math.max(current.mejor, points), partidas: current.partidas + 1 };
    save(RECORDS_KEY, table);
    return points > current.mejor;
}
